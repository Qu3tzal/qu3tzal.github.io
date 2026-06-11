#!/usr/bin/env node
"use strict";
// Headless sanity test: runs full AI-vs-AI matches at 60 Hz and checks the
// sim stays healthy. Usage: node tools/sim_test.js [numMatches]

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const ctx = { WC: {}, Math, console };
vm.createContext(ctx);
for (const f of ["constants.js", "utils.js", "teams.js", "squads.js", "entities.js", "ai.js", "match.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: f });
}
const WC = ctx.WC;
const MANAGER = process.argv.includes("--manager");

const N = parseInt(process.argv[2] || "6", 10);
const DT = 1 / 60;
const F = WC.CONST.FIELD;
let failures = 0;
const eventTotals = {};
const restartTotals = {};
let totalGoals = 0;

function fail(msg) { failures++; console.error("  FAIL: " + msg); }

if (MANAGER) WC.setPitch("manager");

for (let m = 0; m < N; m++) {
  const a = WC.TEAMS[Math.floor(Math.random() * WC.TEAMS.length)];
  let b = a;
  while (b === a) b = WC.TEAMS[Math.floor(Math.random() * WC.TEAMS.length)];
  const mode = m % 2 === 0 ? "friendly" : "cup";

  let match;
  let squads = null;
  if (MANAGER) {
    const fNames = [pick(Object.keys(WC.FORMATIONS_11)), pick(Object.keys(WC.FORMATIONS_11))];
    const forms = [WC.FORMATIONS_11[fNames[0]], WC.FORMATIONS_11[fNames[1]]];
    squads = [WC.buildSquad(a.id), WC.buildSquad(b.id)];
    const xis = [WC.pickXI(squads[0], forms[0], fNames[0]), WC.pickXI(squads[1], forms[1], fNames[1])];
    xis.forEach(xi => xi.forEach(q => { if (q) q.onField = true; }));
    match = new WC.Match(a, b, {
      mode, humanTeam: null, managed: 0,
      formations: forms, formationNames: fNames, squads: xis, fullSquads: squads,
    });
  } else {
    match = new WC.Match(a, b, { mode, humanTeam: null });
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const stateTime = {};
  let frames = 0;
  const maxFrames = 60 * 60 * 12; // 12 minutes real-time cap
  let lastState = match.state;
  let stuckT = 0;

  while (!match.over && frames < maxFrames) {
    const prevState = match.state;
    match.update(DT, null);
    frames++;
    // in manager test, team 0 has no human coach - run the AI coach for it too
    if (MANAGER && frames % 120 === 0) match._coachAI(0);
    if (match.state === "SETUP" && prevState !== "SETUP" && match.restart) {
      restartTotals[match.restart.kind] = 1 + (restartTotals[match.restart.kind] || 0);
    }
    stateTime[match.state] = (stateTime[match.state] || 0) + DT;

    // consume events
    for (const e of match.events) eventTotals[e.type] = (eventTotals[e.type] || 0) + 1;
    match.events.length = 0;

    // NaN watch
    const bl = match.ball;
    if (!isFinite(bl.x) || !isFinite(bl.y) || !isFinite(bl.vx) || !isFinite(bl.vy)) {
      fail(`ball NaN at frame ${frames} state=${match.state}`); break;
    }
    for (const p of match.players) {
      if (!isFinite(p.x) || !isFinite(p.y)) { fail(`player NaN slot=${p.slot}`); frames = maxFrames; break; }
      // stepPlayer allows an 8px grace margin; separation adds ~2px of jitter
      if (p.x < F.left - 12 || p.x > F.right + 12 || p.y < F.top - 12 || p.y > F.bottom + 12) {
        fail(`player out of bounds team=${p.team} slot=${p.slot} role=${p.role} (${p.x.toFixed(1)},${p.y.toFixed(1)}) state=${match.state} restart=${match.restart && match.restart.kind}`);
        frames = maxFrames; break;
      }
    }

    // loose ball far out of bounds while PLAY should be impossible (>1 frame)
    if (match.state === "PLAY" && !bl.owner) {
      if (bl.x < F.left - 45 || bl.x > F.right + 45 || bl.y < F.top - 20 || bl.y > F.bottom + 20) {
        fail(`ball escaped: (${bl.x.toFixed(0)},${bl.y.toFixed(0)})`);
        break;
      }
    }

    // stuck state watch (no transition for 30s real)
    if (match.state === lastState) { stuckT += DT; } else { stuckT = 0; lastState = match.state; }
    if (stuckT > 40 && match.state !== "PLAY" && match.state !== "FULLTIME") {
      fail(`stuck in ${match.state} for 40s`); break;
    }

  }

  const goals = match.score[0] + match.score[1];
  totalGoals += goals;
  const mins = (frames * DT / 60).toFixed(1);
  let extra = "";
  if (MANAGER) {
    const fielded = match.players.filter(p => p.person);
    const avgStam = fielded.reduce((s, p) => s + p.person.stamina, 0) / fielded.length;
    const pa = match.stats.poss[0] + match.stats.poss[1] || 1;
    extra = ` | subs=${match.subsUsed[0]}+${match.subsUsed[1]} stam=${avgStam.toFixed(0)}` +
      ` shots=${match.stats.shots[0]}-${match.stats.shots[1]}` +
      ` poss=${Math.round(match.stats.poss[0] / pa * 100)}%`;
    if (avgStam > 97) fail("stamina never drained");
  }
  console.log(`match ${m + 1} [${mode}] ${a.id} ${match.score[0]}-${match.score[1]} ${b.id}` +
    ` | ${mins}min real, winner=${match.winner === null ? "draw" : [a.id, b.id][match.winner]}, over=${match.over}` + extra);

  if (!match.over) fail("match never finished");
  if (mode === "cup" && match.winner === null) fail("cup match must have a winner");
  if (goals > 25) fail(`absurd goal count ${goals}`);
}

console.log("\nevents:", JSON.stringify(eventTotals));
console.log("restarts:", JSON.stringify(restartTotals));
console.log("avg goals/match:", (totalGoals / N).toFixed(2));
if (totalGoals === 0) fail("no goals in any match - broken attack or impossible defense");
if (!eventTotals.kick) fail("no kicks");

console.log(failures ? `\n${failures} FAILURES` : "\nALL OK");
process.exit(failures ? 1 : 0);
