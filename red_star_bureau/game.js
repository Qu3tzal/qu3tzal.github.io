'use strict';

/* Game logic: state, simulation tick, player actions, save/load. No DOM access here. */
const Game = (() => {

  const SAVE_KEY = 'red_star_bureau_save_v2';
  let state = null;

  /* ---------- helpers ---------- */

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const roundTo = (v, step) => Math.round(v / step) * step;

  function nextId(kind) {
    state.nextIds[kind] = (state.nextIds[kind] || 0) + 1;
    return kind.toUpperCase() + '_' + state.nextIds[kind];
  }

  function log(msg, kind = 'info') {
    const entry = { y: state.date.y, m: state.date.m, msg, kind };
    state.log.unshift(entry);
    if (state.log.length > 200) state.log.pop();
    if (state._report) state._report.push(entry);
  }

  function addRep(delta) {
    state.bureau.reputation = clamp(state.bureau.reputation + delta, 0, 1);
  }

  /* Era technology tier: what level of components a contract of a given year assumes. */
  function eraTier(year) {
    return clamp(1 + Math.floor((year - 1950) / 3), 1, 5);
  }

  function findComponent(list, id) {
    return list.find(c => c.id === id);
  }

  const COMPONENT_LISTS = {
    airframe: () => DATA.AIRFRAMES,
    engine:   () => DATA.ENGINES,
    avionics: () => DATA.AVIONICS,
    weapon:   () => DATA.WEAPONS,
  };

  /* ---------- technology tree ---------- */

  function techNode(id) {
    return DATA.TECH_NODES.find(n => n.id === id);
  }

  function isResearched(id) {
    return state.tech.researched.includes(id);
  }

  /* Prereqs met, not yet researched, not already underway. */
  function nodeAvailable(node) {
    return !isResearched(node.id) && !state.tech.active[node.id]
      && node.requires.every(isResearched);
  }

  function unlockedComponentIds() {
    const ids = new Set();
    for (const nid of state.tech.researched) {
      for (const cid of techNode(nid).unlocks) ids.add(cid);
    }
    return ids;
  }

  /* Tier-1 components are the founding kit; everything else needs its tech node. */
  function unlockedComponents(key, role) {
    const unlocked = unlockedComponentIds();
    let list = COMPONENT_LISTS[key]().filter(c => c.tech <= 1 || unlocked.has(c.id));
    if (key === 'airframe' && role) list = list.filter(c => c.role === role);
    return list;
  }

  /* Highest component tier the bureau can build with (for contract difficulty labels). */
  function playerMaxTier() {
    let max = 1;
    for (const nid of state.tech.researched) {
      for (const cid of techNode(nid).unlocks) {
        for (const key of Object.keys(COMPONENT_LISTS)) {
          const c = findComponent(COMPONENT_LISTS[key](), cid);
          if (c && c.tech > max) max = c.tech;
        }
      }
    }
    return max;
  }

  /* ---------- aircraft performance ---------- */

  function calcPerformance(ids) {
    const af = findComponent(DATA.AIRFRAMES, ids.airframe);
    const en = findComponent(DATA.ENGINES, ids.engine);
    const av = findComponent(DATA.AVIONICS, ids.avionics);
    const wp = findComponent(DATA.WEAPONS, ids.weapon);
    if (!af || !en || !av || !wp) return null;
    const dragFactor = 1 - 0.03 * wp.drag;
    return {
      role: af.role,
      speed: Math.round(af.baseSpeed * en.speedMult * dragFactor),
      range: Math.round(af.baseRange * en.rangeMult * dragFactor),
      payload: af.payload,
      cost: af.cost + en.cost + av.cost + wp.cost,
      reliability: Math.round((af.rel * 0.35 + en.rel * 0.35 + av.rel * 0.2 + wp.rel * 0.1) * 100) / 100,
      firepower: wp.firepower + av.combat,
      components: { airframe: af.name, engine: en.name, avionics: av.name, weapon: wp.name },
      componentIds: { ...ids },
    };
  }

  /* ---------- bid evaluation ---------- */

  function reqScore(value, req) {
    if (value >= req.target) return 1;
    if (value >= req.min) return 0.4 + 0.6 * (value - req.min) / (req.target - req.min);
    return 0.4 * Math.pow(Math.max(0, value / req.min), 3);
  }

  /* Score a design + commercial terms against a contract. All sub-scores 0..1. */
  function evaluateBid(perf, contract, price, months) {
    const r = contract.requirements;
    const perfScores = {
      speed: reqScore(perf.speed, r.speed),
      range: reqScore(perf.range, r.range),
      payload: reqScore(perf.payload, r.payload),
    };
    const perfMean = (perfScores.speed + perfScores.range + perfScores.payload) / 3;
    const costOK = perf.cost <= r.unitCostMax
      ? 1
      : Math.max(0, 1 - 3 * (perf.cost / r.unitCostMax - 1));
    const tech = 0.8 * perfMean + 0.2 * costOK;
    const priceScore = clamp(1.15 - 0.95 * (price / contract.budget), 0.05, 1);
    const timeScore = months >= contract.deadline
      ? 0.2
      : 0.4 + 0.6 * (contract.deadline - months) / contract.deadline;
    const total = 0.6 * tech + 0.25 * priceScore + 0.15 * timeScore;
    const final = total * (0.85 + 0.3 * state.bureau.reputation);
    return { perfScores, perfMean, costOK, tech, priceScore, timeScore, total, final };
  }

  /* ---------- contract generation ---------- */

  function genContract() {
    const type = pick(['fighter', 'fighter', 'fighter', 'fighter', 'bomber', 'bomber', 'bomber', 'transport', 'transport']);
    const year = state.date.y;
    let tier = eraTier(year);
    if (Math.random() < 0.35) tier = Math.max(1, tier - 1); // occasional easier contract

    // Build a reference design from era-appropriate parts so requirements are achievable.
    const refIds = {
      airframe: DATA.AIRFRAMES.find(a => a.role === type && a.tech === tier).id,
      engine: DATA.ENGINES.find(e => e.tech === tier).id,
      avionics: DATA.AVIONICS.find(a => a.tech === tier).id,
      weapon: type === 'transport' ? 'wp_0' : DATA.WEAPONS.find(w => w.tech === tier && w.firepower > 0).id,
    };
    const ref = calcPerformance(refIds);

    const req = (value, step) => ({
      min: roundTo(value * rnd(0.80, 0.88), step),
      target: roundTo(value * rnd(0.98, 1.06), step),
    });

    const playerTier = playerMaxTier();
    const difficulty = tier <= playerTier ? (tier < playerTier ? 'easy' : 'medium') : 'hard';

    // Bidders: specialists always compete; others sometimes.
    const bidders = DATA.COMPETITORS
      .filter(c => c.specialty === type || Math.random() < 0.45)
      .map(c => c.name);

    return {
      id: nextId('contract'),
      name: pick(DATA.CONTRACT_NAMES[type]) + ' ’' + String(year % 100).padStart(2, '0'),
      type, tier, difficulty,
      requirements: {
        speed: req(ref.speed, 10),
        range: req(ref.range, 50),
        payload: req(ref.payload, 50),
        unitCostMax: roundTo(ref.cost * 1.2, 50000),
      },
      budget: roundTo(ref.cost * rnd(3.8, 5.2), 100000),
      deadline: ri(10, 16) + tier * 2, // months from award
      expiresIn: ri(2, 4),
      bidders,
    };
  }

  /* ---------- staff ---------- */

  function genEngineer(level) {
    const lv = DATA.LEVELS[level];
    return {
      id: nextId('eng'),
      name: pick(DATA.FIRST_NAMES) + ' ' + pick(DATA.LAST_NAMES),
      level,
      spec: pick(DATA.SPECS),
      efficiency: Math.round(rnd(0.70, 0.98) * 100) / 100,
      salary: roundTo(lv.salary * rnd(0.9, 1.15), 100),
      assignment: { type: 'idle' },
    };
  }

  function genHirePool() {
    const levels = ['junior', 'junior', 'senior', pick(['junior', 'senior', 'principal'])];
    return levels.map(genEngineer);
  }

  /* Work contribution of an engineer toward a given task kind. */
  function contribution(eng, task, node) {
    let bonus = 1;
    if (task === 'design') {
      if (eng.spec === 'aerodynamics' || eng.spec === 'structures') bonus = 1.2;
      else if (eng.spec === 'propulsion' || eng.spec === 'avionics') bonus = 1.1;
      else if (eng.spec === 'maintenance') bonus = 0.7;
    } else if (task === 'research') {
      if (node && node.specs.includes(eng.spec)) bonus = 1.5;
    } else if (task === 'maintenance') {
      if (eng.spec === 'maintenance') bonus = 1.5;
    }
    return DATA.LEVELS[eng.level].mult * eng.efficiency * bonus;
  }

  function assignedTo(type, id) {
    return state.staff.filter(e =>
      e.assignment.type === type && (id === undefined || e.assignment.id === id));
  }

  function projectMonthlyWork(projectId) {
    return assignedTo('project', projectId).reduce((s, e) => s + contribution(e, 'design'), 0);
  }

  function researchMonthlyWork(nodeId) {
    const node = techNode(nodeId);
    return assignedTo('research', nodeId).reduce((s, e) => s + contribution(e, 'research', node), 0);
  }

  function maintenanceCapacity() {
    return assignedTo('maintenance').reduce((s, e) => s + contribution(e, 'maintenance'), 0);
  }

  function maintenanceDemand() {
    return state.fleet.reduce((s, a) => s + a.maintDemand, 0);
  }

  function maintenanceCoverage() {
    const demand = maintenanceDemand();
    return demand <= 0 ? 1 : Math.min(1, maintenanceCapacity() / demand);
  }

  /* Support income scales directly with maintenance coverage: an unsupported fleet earns nothing. */
  function fleetIncome(a, coverage) {
    return Math.round(a.units * a.rate * a.effectiveness * coverage);
  }

  function unassignFrom(type, id) {
    assignedTo(type, id).forEach(e => { e.assignment = { type: 'idle' }; });
  }

  /* ---------- new game ---------- */

  function newGame(bureauName) {
    state = {
      version: 1,
      bureau: { name: bureauName || 'Red Star Design Bureau', funds: DATA.START_FUNDS, reputation: 0.5 },
      date: { y: 1950, m: 1 },
      staff: [],
      hirePool: [],
      hirePoolRefresh: 3,
      contracts: { available: [], pendingBids: [] },
      projects: [],
      designs: [],
      fleet: [],
      tech: { researched: [], active: {} },
      competitors: DATA.COMPETITORS.map(c => ({ ...c, wins: 0 })),
      stats: { bidsWon: 0, bidsLost: 0, completed: 0, failed: 0, totalEarned: 0,
               victories: 0, lossesCombat: 0, targets: 0, tonnage: 0 },
      log: [],
      nextIds: {},
      gameOver: null,
      _report: null,
    };

    ['principal', 'senior', 'senior', 'senior', 'senior', 'senior',
     'junior', 'junior', 'junior', 'junior', 'junior', 'junior', 'junior', 'junior']
      .forEach(lv => state.staff.push(genEngineer(lv)));
    // Guarantee at least one maintenance specialist in the founding team.
    if (!state.staff.some(e => e.spec === 'maintenance')) state.staff[6].spec = 'maintenance';

    state.hirePool = genHirePool();
    for (let i = 0; i < 3; i++) state.contracts.available.push(genContract());

    // A starter design so the workshop isn't intimidating on first open.
    const starterPerf = calcPerformance({ airframe: 'af_f1', engine: 'en_1', avionics: 'av_1', weapon: 'wp_1' });
    state.designs.push({ id: nextId('design'), name: 'RSB-1', perf: starterPerf });

    log('The Ministry of Aviation Industry has chartered our bureau. Win contracts, comrade.', 'good');
    save();
    return state;
  }

  /* ---------- player actions ---------- */

  function createDesign(name, ids) {
    const perf = calcPerformance(ids);
    if (!perf) return { ok: false, error: 'Incomplete component selection.' };
    const design = { id: nextId('design'), name: name.trim() || 'Unnamed', perf };
    state.designs.push(design);
    save();
    return { ok: true, design };
  }

  function deleteDesign(id) {
    state.designs = state.designs.filter(d => d.id !== id);
    save();
  }

  function submitBid(contractId, designId, price, months) {
    const contract = state.contracts.available.find(c => c.id === contractId);
    const design = state.designs.find(d => d.id === designId);
    if (!contract || !design) return { ok: false, error: 'Contract or design not found.' };
    if (design.perf.role !== contract.type) return { ok: false, error: 'Design role does not match contract type.' };
    if (!(price > 0) || !(months >= 3)) return { ok: false, error: 'Enter a valid price and timeline (min 3 months).' };
    if (state.contracts.pendingBids.some(b => b.contractId === contractId)) {
      return { ok: false, error: 'A bid is already pending on this contract.' };
    }
    state.contracts.pendingBids.push({
      contractId,
      contract: JSON.parse(JSON.stringify(contract)),
      designName: design.name,
      perf: JSON.parse(JSON.stringify(design.perf)),
      price: Math.round(price),
      months: Math.round(months),
    });
    log(`Proposal submitted for ${contract.name} (${design.name}). Decision expected next month.`);
    save();
    return { ok: true };
  }

  function withdrawBid(contractId) {
    state.contracts.pendingBids = state.contracts.pendingBids.filter(b => b.contractId !== contractId);
    save();
  }

  function hire(poolIdx) {
    const cand = state.hirePool[poolIdx];
    if (!cand) return { ok: false, error: 'Candidate no longer available.' };
    const bonus = cand.salary * 3;
    if (state.bureau.funds < bonus) return { ok: false, error: 'Insufficient funds for signing bonus.' };
    state.bureau.funds -= bonus;
    state.hirePool.splice(poolIdx, 1);
    state.staff.push(cand);
    log(`Hired ${cand.name} (${DATA.LEVELS[cand.level].label}, ${DATA.SPEC_LABELS[cand.spec]}). Signing bonus ₽${cand.salary * 3}.`);
    save();
    return { ok: true };
  }

  function fire(engId) {
    const idx = state.staff.findIndex(e => e.id === engId);
    if (idx < 0) return { ok: false };
    const eng = state.staff[idx];
    state.bureau.funds -= eng.salary * 3;
    state.staff.splice(idx, 1);
    log(`Dismissed ${eng.name}. Severance paid: ₽${eng.salary * 3}.`, 'bad');
    save();
    return { ok: true };
  }

  /* code: 'idle' | 'maintenance' | 'project:<id>' | 'research:<cat>' */
  function assign(engId, code) {
    const eng = state.staff.find(e => e.id === engId);
    if (!eng) return;
    const [type, id] = code.split(':');
    eng.assignment = id ? { type, id } : { type };
    save();
  }

  function startResearch(nodeId) {
    const node = techNode(nodeId);
    if (!node) return { ok: false, error: 'Unknown technology.' };
    if (isResearched(nodeId)) return { ok: false, error: 'Already researched.' };
    if (state.tech.active[nodeId]) return { ok: false, error: 'Research already underway.' };
    if (!node.requires.every(isResearched)) return { ok: false, error: 'Prerequisites not met.' };
    if (state.bureau.funds < node.cost) return { ok: false, error: 'Insufficient funds.' };
    state.bureau.funds -= node.cost;
    state.tech.active[nodeId] = { progress: 0, work: node.work };
    log(`Research started: ${node.name}. Assign engineers to it in the Staff tab.`);
    save();
    return { ok: true };
  }

  function retireAircraft(fleetId) {
    const idx = state.fleet.findIndex(a => a.id === fleetId);
    if (idx < 0) return;
    const a = state.fleet[idx];
    state.fleet.splice(idx, 1);
    log(`${a.name} withdrawn from service. Support contracts ended.`);
    save();
  }

  /* ---------- monthly tick ---------- */

  function resolveBids() {
    for (const bid of state.contracts.pendingBids) {
      const c = bid.contract;
      const tier = c.tier;
      const player = evaluateBid(bid.perf, c, bid.price, bid.months);

      let bestAi = null;
      for (const name of c.bidders) {
        const ai = state.competitors.find(x => x.name === name);
        if (!ai) continue;
        const aiTech = clamp(eraTier(state.date.y) + ai.techOffset, 1, 5);
        const score = 0.57
          + 0.05 * (aiTech - tier)
          + (ai.specialty === c.type ? 0.08 : -0.04)
          + 0.12 * (ai.rep - 0.6)
          + (ai.aggression - 0.6) * 0.06
          + rnd(-0.12, 0.12);
        if (!bestAi || score > bestAi.score) bestAi = { ai, score };
      }

      if (!bestAi || player.final > bestAi.score) {
        // Player wins: contract becomes a development project.
        state.stats.bidsWon++;
        addRep(0.01);
        const work = Math.round(12 + bid.perf.cost / 250000);
        state.projects.push({
          id: nextId('proj'),
          contractName: c.name,
          aircraftName: bid.designName,
          type: c.type,
          requirements: c.requirements,
          perf: bid.perf,
          price: bid.price,
          promised: bid.months,
          deadline: c.deadline,
          elapsed: 0,
          progress: 0,
          work,
          protoCost: Math.round(bid.perf.cost * DATA.PROTO_MULT),
          spent: 0,
          lateWarned: false,
        });
        log(`CONTRACT WON: ${c.name}! The commission selected our ${bid.designName}. ` +
            `Payment of ₽${fmtNum(bid.price)} on delivery within ${bid.months} months. Assign engineers to the project.`, 'good');
      } else {
        state.stats.bidsLost++;
        bestAi.ai.wins++;
        bestAi.ai.rep = clamp(bestAi.ai.rep + 0.01, 0, 1);
        log(`Bid lost: ${c.name} was awarded to ${bestAi.ai.name}.`, 'bad');
      }
      // Contract leaves the open board either way.
      state.contracts.available = state.contracts.available.filter(x => x.id !== bid.contractId);
    }
    state.contracts.pendingBids = [];
  }

  function stepProjects() {
    const finished = [];
    for (const p of state.projects) {
      p.elapsed++;
      const workDone = projectMonthlyWork(p.id);
      if (workDone > 0) {
        const applied = Math.min(workDone, p.work - p.progress);
        const burn = Math.round(p.protoCost * applied / p.work);
        p.progress += applied;
        p.spent += burn;
        state.bureau.funds -= burn;
      }

      if (p.progress >= p.work) { finished.push(p); continue; }

      if (p.elapsed > p.promised) {
        addRep(-0.003);
        if (!p.lateWarned) {
          p.lateWarned = true;
          log(`${p.contractName} is behind schedule. The Ministry is displeased.`, 'bad');
        }
      }
      if (p.elapsed > p.promised + 8) {
        addRep(-0.08);
        state.stats.failed++;
        unassignFrom('project', p.id);
        p.cancelled = true;
        log(`CONTRACT CANCELLED: ${p.contractName} ran ${p.elapsed - p.promised} months late. No payment. Our reputation suffers.`, 'bad');
      }
    }
    state.projects = state.projects.filter(p => !p.cancelled);

    for (const p of finished) {
      const lateMonths = Math.max(0, p.elapsed - p.promised);
      const payment = Math.round(p.price * Math.max(0.7, 1 - 0.02 * lateMonths));
      state.bureau.funds += payment;
      state.stats.completed++;
      state.stats.totalEarned += payment;
      addRep(lateMonths === 0 ? 0.03 : 0.015);

      const evalRes = evaluateBid(p.perf, { requirements: p.requirements, budget: p.price, deadline: p.deadline }, p.price, p.promised);
      const effectiveness = clamp(0.25 + 0.45 * evalRes.perfMean + 0.3 * p.perf.reliability, 0.25, 1);
      const t = DATA.TYPES[p.type];
      const units = Math.round(t.baseUnits * (0.5 + 0.8 * effectiveness) * rnd(0.8, 1.25));
      state.fleet.push({
        id: nextId('fleet'),
        name: p.aircraftName,
        type: p.type,
        componentIds: p.perf.componentIds,
        units,
        effectiveness: Math.round(effectiveness * 100) / 100,
        maintDemand: Math.ceil(units / t.unitsPerEng),
        rate: t.rate,
        serviceMonths: ri(96, 168),
        enteredYear: state.date.y,
        combat: { victories: 0, losses: 0, targets: 0, tonnage: 0, conflicts: [] },
      });
      unassignFrom('project', p.id);
      state.projects = state.projects.filter(x => x.id !== p.id);
      log(`AIRCRAFT DELIVERED: ${p.aircraftName} (${p.contractName}) accepted into service. ` +
          `Payment ₽${fmtNum(payment)}${lateMonths ? ` (late penalty applied)` : ''}. ` +
          `${units} units ordered — assign maintenance engineers to support the fleet.`, 'good');
    }
  }

  function stepResearch() {
    for (const nodeId of Object.keys(state.tech.active)) {
      const r = state.tech.active[nodeId];
      r.progress += researchMonthlyWork(nodeId);
      if (r.progress >= r.work) {
        const node = techNode(nodeId);
        delete state.tech.active[nodeId];
        state.tech.researched.push(nodeId);
        unassignFrom('research', nodeId);
        const names = node.unlocks.map(cid => {
          for (const key of Object.keys(COMPONENT_LISTS)) {
            const c = findComponent(COMPONENT_LISTS[key](), cid);
            if (c) return c.name;
          }
          return cid;
        });
        log(`RESEARCH COMPLETE: ${node.name}. Unlocked: ${names.join(', ')}.`, 'good');
      }
    }
  }

  function stepFleet() {
    const coverage = maintenanceCoverage();
    let income = 0;
    for (const a of state.fleet) {
      income += fleetIncome(a, coverage);
      a.serviceMonths--;
    }
    state.bureau.funds += income;

    if (state.fleet.length && coverage < 0.6 && Math.random() < 0.15) {
      const victim = pick(state.fleet);
      addRep(-0.02);
      log(`INCIDENT: A ${victim.name} was lost to a maintenance failure. The Air Force blames our thin support staff.`, 'bad');
    }

    const retired = state.fleet.filter(a => a.serviceMonths <= 0);
    for (const a of retired) log(`${a.name} has reached the end of its service life and is retired with honors.`);
    state.fleet = state.fleet.filter(a => a.serviceMonths > 0);
    return income;
  }

  /* ---------- conflicts & combat ---------- */

  function monthIndex(y, m) { return y * 12 + (m - 1); }

  function activeConflicts() {
    const t = monthIndex(state.date.y, state.date.m);
    return DATA.CONFLICTS.filter(c => {
      const s = monthIndex(c.start.y, c.start.m);
      return t >= s && t < s + c.months;
    });
  }

  function battleText(type, vars) {
    let text = pick(DATA.BATTLE_TEXTS[type]);
    for (const [k, v] of Object.entries(vars)) text = text.replace('{' + k + '}', v);
    return text;
  }

  /* One engagement of fleet `a` in conflict `c`. Outcome (-1..1) drives reputation. */
  function resolveEngagement(a, c, coverage) {
    const perf = calcPerformance(a.componentIds);
    if (!perf) return;
    const tier = eraTier(state.date.y);
    const readiness = 0.4 + 0.6 * coverage;
    const scale = (6 + 26 * c.intensity) * clamp(a.units / 400, 0.25, 1.5);
    let kills = 0, losses = 0, targets = 0, tons = 0, outcome = 0;

    if (a.type === 'fighter') {
      // air combat: speed and firepower against era-appropriate opposition
      const our = 0.35 * clamp(perf.speed / (800 + tier * 200), 0, 1.3)
                + 0.30 * clamp(perf.firepower / (12 + tier * 10), 0, 1.3)
                + 0.15 * perf.reliability
                + 0.20 * readiness;
      const enemy = 0.58 + 0.05 * c.intensity + rnd(-0.12, 0.12);
      const ratio = clamp(our / (our + enemy), 0.15, 0.85);
      kills = Math.round(scale * ratio * ratio * rnd(0.7, 1.3));
      losses = Math.round(scale * (1 - ratio) * (1 - ratio) * rnd(0.7, 1.3));
      outcome = (kills - losses) / Math.max(1, kills + losses);
    } else if (a.type === 'bomber') {
      // strike effectiveness from payload and aiming; survivability from speed
      const striking = 0.5 * clamp(perf.payload / (4000 + tier * 1500), 0, 1.3)
                     + 0.3 * clamp(perf.firepower / (15 + tier * 10), 0, 1.3)
                     + 0.2 * perf.reliability;
      const surviv = 0.4 * clamp(perf.speed / (700 + tier * 150), 0, 1.2)
                   + 0.3 * perf.reliability
                   + 0.3 * readiness;
      targets = Math.round(scale * striking * rnd(0.7, 1.3));
      losses = Math.round(scale * 0.3 * Math.max(0, 1.15 - surviv) * rnd(0.6, 1.4));
      outcome = clamp((targets * 0.6 - losses * 2) / Math.max(1, targets * 0.6 + losses * 2), -1, 1);
    } else {
      // airlift: tonnage delivered; attrition from reliability and upkeep
      tons = Math.round(a.units * rnd(0.3, 0.6) * perf.payload / 1000);
      const safety = 0.5 * perf.reliability + 0.3 * readiness
                   + 0.2 * clamp(perf.range / (2000 + tier * 800), 0, 1.2);
      losses = Math.round(scale * 0.18 * Math.max(0, 1.1 - safety) * rnd(0.5, 1.5));
      outcome = losses === 0 ? 0.5 : clamp(0.4 - losses / Math.max(2, scale * 0.3), -1, 1);
    }

    a.units = Math.max(0, a.units - losses);
    a.maintDemand = Math.ceil(a.units / DATA.TYPES[a.type].unitsPerEng);
    a.combat.victories += kills;
    a.combat.losses += losses;
    a.combat.targets += targets;
    a.combat.tonnage += tons;
    if (!a.combat.conflicts.includes(c.name)) a.combat.conflicts.push(c.name);
    state.stats.victories += kills;
    state.stats.lossesCombat += losses;
    state.stats.targets += targets;
    state.stats.tonnage += tons;
    addRep(clamp(outcome * 0.02, -0.025, 0.02));

    const lossStr = losses === 0 ? 'no' : String(losses);
    log(battleText(a.type, {
      name: a.name, enemy: c.enemy, theater: c.theater,
      kills, losses: lossStr, targets, tons: fmtNum(tons),
    }), 'war');

    // a strong showing attracts export orders
    if (outcome > 0.35 && Math.random() < 0.3) {
      const bonus = roundTo(perf.cost * rnd(0.3, 0.8), 100000);
      state.bureau.funds += bonus;
      log(`The ${a.name}'s combat record ${c.theater} has drawn an export order: ₽${fmtNum(bonus)}.`, 'good');
    }

    if (a.units < 25) {
      state.fleet = state.fleet.filter(x => x.id !== a.id);
      log(`Attrition has gutted the ${a.name} fleet. The survivors are withdrawn from service.`, 'bad');
    }
  }

  function stepCombat() {
    const t = monthIndex(state.date.y, state.date.m);
    for (const c of DATA.CONFLICTS) {
      const s = monthIndex(c.start.y, c.start.m);
      if (t === s) log(`WAR: ${c.announce}`, 'war');
      if (t === s + c.months) log(c.end, 'info');
    }

    const conflicts = activeConflicts();
    if (!conflicts.length || !state.fleet.length) return;
    const coverage = maintenanceCoverage();
    const candidates = [];
    for (const c of conflicts) {
      for (const a of state.fleet) {
        const w = c.roles[a.type] || 0;
        if (w > 0 && Math.random() < w * c.intensity * 0.4) candidates.push([a, c]);
      }
    }
    candidates.sort(() => Math.random() - 0.5);
    for (const [a, c] of candidates.slice(0, 2)) {
      if (state.fleet.includes(a)) resolveEngagement(a, c, coverage);
    }
  }

  function refreshContractBoard() {
    for (const c of state.contracts.available) c.expiresIn--;
    const expired = state.contracts.available.filter(c => c.expiresIn <= 0);
    for (const c of expired) log(`Tender closed without our participation: ${c.name}.`);
    state.contracts.available = state.contracts.available.filter(c => c.expiresIn > 0);
    const spawn = Math.min(ri(1, 2), 6 - state.contracts.available.length);
    for (let i = 0; i < spawn; i++) {
      const c = genContract();
      state.contracts.available.push(c);
      log(`New tender announced: ${c.name} (${DATA.TYPES[c.type].label.toLowerCase()}).`);
    }
  }

  function checkEndStates() {
    if (state.bureau.funds < DATA.CREDIT_LIMIT) {
      state.gameOver = { type: 'bankruptcy' };
      log('The State Bank has called in our debts. The bureau is liquidated.', 'bad');
    } else if (state.bureau.reputation <= 0.12 && state.date.y >= 1952) {
      state.gameOver = { type: 'disgrace' };
      log('The Ministry has lost all confidence in our bureau. We are dissolved and absorbed by Mikoyan-Gurevich.', 'bad');
    } else if (state.date.y >= DATA.END_YEAR) {
      // scaled so a fully researched tree (24 nodes) ≈ the old 4×5 level sum
      const techSum = 4 + state.tech.researched.length * (2 / 3);
      const score = state.bureau.funds / 1000000
        + state.stats.completed * 12
        + techSum * 6
        + state.bureau.reputation * 60
        + state.stats.victories * 0.3
        + state.stats.targets * 0.5;
      let grade;
      if (score >= 700) grade = 'Hero of Socialist Labor';
      else if (score >= 450) grade = 'Order of Lenin';
      else if (score >= 250) grade = 'Order of the Red Banner of Labor';
      else if (score >= 120) grade = 'Certificate of Adequacy';
      else grade = 'Reassignment to Siberia';
      state.gameOver = { type: 'review', score: Math.round(score), grade };
    }
  }

  function endMonth() {
    if (state.gameOver) return null;
    const fundsBefore = state.bureau.funds;
    state._report = [];

    // advance calendar
    state.date.m++;
    if (state.date.m > 12) { state.date.m = 1; state.date.y++; }

    resolveBids();
    stepProjects();
    stepResearch();
    stepCombat();
    stepFleet();

    // payroll & overhead
    const salaries = state.staff.reduce((s, e) => s + e.salary, 0);
    state.bureau.funds -= salaries + DATA.OVERHEAD;

    // working engineers slowly improve
    for (const e of state.staff) {
      if (e.assignment.type !== 'idle') e.efficiency = Math.min(1.05, Math.round((e.efficiency + 0.003) * 1000) / 1000);
    }

    refreshContractBoard();

    if (--state.hirePoolRefresh <= 0) {
      state.hirePool = genHirePool();
      state.hirePoolRefresh = 3;
    }

    if (state.bureau.funds < 0 && state.bureau.funds >= DATA.CREDIT_LIMIT) {
      log(`Operating on state credit: ₽${fmtNum(state.bureau.funds)}. The Bank tolerates up to ₽${fmtNum(DATA.CREDIT_LIMIT)}.`, 'bad');
    }

    checkEndStates();
    save();

    const report = { events: state._report.slice().reverse(), delta: state.bureau.funds - fundsBefore };
    state._report = null;
    return report;
  }

  /* ---------- finances preview (for dashboard) ---------- */

  function monthlyEstimate() {
    const salaries = state.staff.reduce((s, e) => s + e.salary, 0);
    const coverage = maintenanceCoverage();
    const maintIncome = state.fleet.reduce((s, a) => s + fleetIncome(a, coverage), 0);
    const protoBurn = state.projects.reduce((s, p) => {
      const w = Math.min(projectMonthlyWork(p.id), p.work - p.progress);
      return s + Math.round(p.protoCost * w / p.work);
    }, 0);
    return { salaries, overhead: DATA.OVERHEAD, maintIncome, protoBurn,
             net: maintIncome - salaries - DATA.OVERHEAD - protoBurn };
  }

  /* ---------- persistence ---------- */

  function save() {
    try {
      const { _report, ...clean } = state;
      localStorage.setItem(SAVE_KEY, JSON.stringify(clean));
    } catch (e) { /* storage unavailable; play session-only */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      state = JSON.parse(raw);
      state._report = null;
      // migrate pre-combat v2 saves
      for (const k of ['victories', 'lossesCombat', 'targets', 'tonnage']) state.stats[k] ??= 0;
      for (const a of state.fleet) a.combat ??= { victories: 0, losses: 0, targets: 0, tonnage: 0, conflicts: [] };
      return state;
    } catch (e) { return null; }
  }

  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  /* number formatting shared with UI */
  function fmtNum(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return {
    get state() { return state; },
    newGame, load, reset, endMonth,
    calcPerformance, evaluateBid, unlockedComponents,
    techNode, isResearched, nodeAvailable,
    createDesign, deleteDesign, submitBid, withdrawBid,
    hire, fire, assign, startResearch, retireAircraft,
    assignedTo, projectMonthlyWork, researchMonthlyWork,
    maintenanceCapacity, maintenanceDemand, maintenanceCoverage, fleetIncome,
    monthlyEstimate, eraTier, fmtNum, activeConflicts,
  };
})();
