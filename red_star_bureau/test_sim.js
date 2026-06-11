'use strict';
/* Headless simulation harness: plays the game with a simple bot to validate
   logic and balance. Run: node test_sim.js [games] */

const fs = require('fs');
const load = (file, name) =>
  eval(fs.readFileSync(file, 'utf8').replace(`const ${name} =`, `globalThis.${name} =`));
load('data.js', 'DATA');
load('game.js', 'Game');

function assert(cond, msg) {
  if (!cond) { console.error('ASSERT FAILED:', msg); process.exitCode = 1; }
}

function bestDesignFor(contract) {
  // Bot: cheapest unlocked design that satisfies the contract; don't gold-plate.
  const s = Game.state;
  const atTier = (list, t) => list.filter(c => c.tech <= t).slice(-1)[0];
  let best = null;
  for (let t = 1; t <= 5; t++) {
    const af = atTier(Game.unlockedComponents('airframe', contract.type), t);
    const ids = {
      airframe: af.id,
      engine: atTier(Game.unlockedComponents('engine'), t).id,
      avionics: atTier(Game.unlockedComponents('avionics'), t).id,
      weapon: contract.type === 'transport' ? 'wp_0'
        : atTier(Game.unlockedComponents('weapon').filter(w => w.firepower > 0), t).id,
    };
    const perf = Game.calcPerformance(ids);
    const ev = Game.evaluateBid(perf, contract, contract.budget * 0.85, contract.deadline - 3);
    if (!best || ev.tech > best.ev.tech + 0.001) best = { ids, ev };
    if (ev.tech >= 0.85) break; // good enough, stop spending
  }
  let d = s.designs.find(x => JSON.stringify(x.perf.componentIds) === JSON.stringify(best.ids));
  if (!d) d = Game.createDesign('BOT-' + s.designs.length, best.ids).design;
  return d;
}

function botTurn() {
  const s = Game.state;

  // Bid on open contracts, but don't commit to more work than we can staff.
  for (const c of s.contracts.available) {
    if (s.contracts.pendingBids.some(b => b.contractId === c.id)) continue;
    if (s.projects.length + s.contracts.pendingBids.length >= 2) break;
    const d = bestDesignFor(c);
    const price = Math.round(c.budget * 0.85);
    const months = Math.max(3, c.deadline - 3);
    const ev = Game.evaluateBid(d.perf, c, price, months);
    if (ev.tech < 0.55) continue; // hopeless design, skip
    if (price < d.perf.cost * DATA.PROTO_MULT * 1.2) continue; // unprofitable, skip
    Game.submitBid(c.id, d.id, price, months);
  }

  // Research: start available tree nodes when rich, up to 2 in parallel.
  if (s.bureau.funds > 35000000) {
    for (const node of DATA.TECH_NODES) {
      if (Object.keys(s.tech.active).length >= 2) break;
      if (Game.nodeAvailable(node)) Game.startResearch(node.id);
    }
  }

  // Assignments: projects first (cancellations are deadly), then maintenance, then research.
  for (const e of s.staff) e.assignment = { type: 'idle' };
  const idle = () => s.staff.filter(e => e.assignment.type === 'idle');
  for (const p of s.projects) {
    idle().slice(0, 5).forEach(e => Game.assign(e.id, 'project:' + p.id));
  }
  idle().slice(0, Game.maintenanceDemand()).forEach(e => Game.assign(e.id, 'maintenance'));
  for (const nodeId of Object.keys(s.tech.active)) {
    idle().slice(0, 2).forEach(e => Game.assign(e.id, 'research:' + nodeId));
  }

  // Hire when rich and short-staffed.
  if (s.bureau.funds > 30000000 && s.staff.length < 30 && s.hirePool.length) Game.hire(0);
}

const games = Number(process.argv[2] || 20);
const results = [];

for (let g = 0; g < games; g++) {
  Game.newGame('Sim Bureau ' + g);
  let months = 0;
  while (!Game.state.gameOver && months < 200) {
    botTurn();
    const report = Game.endMonth();
    assert(report !== null, 'endMonth returned null mid-game');
    months++;
    const s = Game.state;
    assert(Number.isFinite(s.bureau.funds), 'funds is not finite');
    assert(s.bureau.reputation >= 0 && s.bureau.reputation <= 1, 'reputation out of range');
    for (const p of s.projects) assert(p.progress <= p.work + 0.001, 'progress overshoot');
    assert(s.contracts.available.length <= 6, 'contract board overflow');
    for (const a of s.fleet) {
      assert(a.units >= 0 && Number.isFinite(a.units), 'fleet units invalid');
      assert(a.combat && a.combat.losses >= 0, 'combat record invalid');
    }
    assert(s.stats.victories >= 0 && Number.isFinite(s.stats.victories), 'victories invalid');
  }
  const s = Game.state;
  results.push({
    end: s.gameOver ? s.gameOver.type : 'timeout',
    grade: s.gameOver && s.gameOver.grade,
    months,
    funds: Math.round(s.bureau.funds / 1e6),
    rep: s.bureau.reputation.toFixed(2),
    won: s.stats.bidsWon, lost: s.stats.bidsLost,
    completed: s.stats.completed, failed: s.stats.failed,
    kills: s.stats.victories, shot: s.stats.lossesCombat, tgts: s.stats.targets,
    fleet: s.fleet.length,
    techNodes: s.tech.researched.length,
    staff: s.staff.length,
  });
}

console.table(results);
const wins = results.filter(r => r.end === 'review').length;
const avgWinRate = results.reduce((a, r) => a + r.won / Math.max(1, r.won + r.lost), 0) / results.length;
console.log(`Reached 1965: ${wins}/${games} · avg bid win rate: ${(avgWinRate * 100).toFixed(0)}% · avg final funds: ₽${Math.round(results.reduce((a, r) => a + r.funds, 0) / games)}M`);
