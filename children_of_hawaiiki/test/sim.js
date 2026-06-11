// Headless balance/crash test: node test/sim.js [trials]
// Plays full games with a reasonable bot policy and reports outcomes.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = {
  console,
  Math,
  Number,
  JSON,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
vm.createContext(ctx);
for (const f of ["data.js", "game.js", "voyage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
}

const code = `
function botAssignJobs() {
  for (const j of JOB_NAMES) G.jobs[j] = 0;
  let free = G.pop;
  const take = (j, n) => { n = Math.max(0, Math.min(n, free)); G.jobs[j] += n; free -= n; };
  const isl = G.island;
  const fishYield = C.FISH_RATE * isl.fish * moraleFactor();
  const farmYield = C.FARM_RATE * isl.fertility * (isl.drought > 0 ? 0.5 : 1) * moraleFactor();
  const target = G.candidates[G.scoutTarget];
  // Reserve specialists first, then fill food, then stockpile
  if (!canoeReady()) { take("woodcutter", 2); take("builder", 3); }
  if (!target.final && target.tier < 3) take("scout", 2);
  if (G.knowledge < 90) take("navigator", Math.min(2, Math.max(0, free - 4)));
  let needFood = G.pop * 1.25;
  while (needFood > 0 && free > 0) {
    if (fishYield >= farmYield && G.jobs.fisher < isl.fishCap) { take("fisher", 1); needFood -= fishYield; }
    else if (farmYield > 0.8) { take("farmer", 1); needFood -= farmYield; }
    else if (G.jobs.fisher < isl.fishCap) { take("fisher", 1); needFood -= fishYield; }
    else { take("fisher", 1); needFood -= fishYield * 0.35; }
  }
  // Leftovers stockpile food for the crossing
  while (free > 0) {
    if (fishYield >= farmYield && G.jobs.fisher < isl.fishCap) take("fisher", 1);
    else if (farmYield > fishYield * 0.35) take("farmer", 1);
    else take("fisher", 1);
  }
}

function pickTarget() {
  // Prefer candidates with timber and good traits among scouted; otherwise scout nearest-guess
  let best = 0, bestScore = -1;
  G.candidates.forEach((c, i) => {
    let s = 0;
    if (c.final) s = 100;
    else s = (c.forestMax >= 70 ? 2 : 0) + c.fish + c.fertility - c.dist * 0.05 + c.tier;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

function botShouldDepart() {
  if (!canoeReady()) return false;
  const c = G.candidates[G.scoutTarget];
  if (!c.final && c.tier < 2) return false;
  const crew = Math.min(G.pop, C.CREW_MAX);
  const dist = c.tier >= 3 || c.final ? c.dist : c.estDist;
  const need = Math.ceil(dist * crew * C.SEA_EAT * 1.3);
  return G.food >= need + 5;
}

function runOne() {
  newGame();
  let guard = 0;
  while (G.phase !== "end" && guard++ < 3000) {
    if (G.pendingEvent) { resolvePendingEvent(Math.floor(Math.random() * (((G.pendingEvent.kind === "island" ? ISLAND_EVENTS : VOYAGE_EVENTS)[G.pendingEvent.id]).options.length))); continue; }
    if (G.phase === "island") {
      G.scoutTarget = pickTarget();
      botAssignJobs();
      if (botShouldDepart()) {
        const c = G.candidates[G.scoutTarget];
        const crew = Math.min(G.pop, C.CREW_MAX);
        depart(G.scoutTarget, crew, Math.floor(G.food));
      } else {
        if (G.morale < 35 && G.food > G.pop * 3) holdFestival();
        endTurn();
      }
    } else if (G.phase === "voyage") {
      sailDay();
    }
  }
  return { won: G.end ? G.end.won : false, reason: G.end ? G.end.reason : "timeout", turns: G.turn, leg: G.legIndex, settled: G.legacy.settled, lost: G.legacy.crewLost };
}

globalThis.runOne = runOne;
`;
vm.runInContext(code, ctx, { filename: "bot.js" });

const trials = parseInt(process.argv[2] || "300", 10);
const results = [];
for (let i = 0; i < trials; i++) results.push(ctx.runOne());

const wins = results.filter(r => r.won);
const byReason = {};
for (const r of results) byReason[r.won ? "win" : r.reason] = (byReason[r.won ? "win" : r.reason] || 0) + 1;
const legDist = {};
for (const r of results) if (!r.won) legDist[r.leg] = (legDist[r.leg] || 0) + 1;
const avg = (arr, k) => arr.length ? (arr.reduce((s, r) => s + r[k], 0) / arr.length).toFixed(1) : "-";

console.log(`trials: ${trials}`);
console.log(`win rate: ${(100 * wins.length / trials).toFixed(1)}%`);
console.log(`outcomes:`, byReason);
console.log(`losses stranded at leg:`, legDist);
console.log(`avg moons (wins): ${avg(wins, "turns")}, avg settled: ${avg(wins, "settled")}, avg crew lost: ${avg(wins, "lost")}`);
