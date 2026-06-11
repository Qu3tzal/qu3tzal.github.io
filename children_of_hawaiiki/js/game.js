"use strict";

// Global game state. All plain data so it can be saved as JSON.
let G = null;

const JOB_NAMES = ["fisher", "farmer", "woodcutter", "builder", "scout", "navigator"];

function newGame() {
  G = {
    phase: "island", // island | voyage | end
    turn: 1,
    legIndex: 0,
    pop: 12,
    food: 45,
    wood: 12,
    knowledge: 5,
    morale: 65,
    jobs: { fisher: 0, farmer: 0, woodcutter: 0, builder: 0, scout: 0, navigator: 0 },
    canoe: { progress: 0, required: C.CANOE_POINTS },
    island: makeHomeland(),
    candidates: genCandidates(0),
    scoutTarget: 0,
    voyage: null,
    end: null, // {won, reason}
    legacy: { settled: 0, islands: ["Hawaiki"], crewLost: 0 },
    log: [],
    pendingEvent: null, // {kind:'island'|'voyage', id}
  };
  log("Your people land their canoes on the shore of Hawaiki, the homeland of legend.", "info");
  log("Feed them, raise a great voyaging canoe, and learn the stars. Hawaiʻi waits far beyond the horizon.", "info");
  saveGame();
}

function makeHomeland() {
  return {
    name: "Hawaiki",
    type: "high",
    fertility: 1.0,
    fish: 1.0,
    fishCap: 8,
    popCap: 28,
    forestMax: 120,
    forestStock: 110,
    drought: 0,
    final: false,
    shapeSeed: rint(1, 1e9),
  };
}

function genCandidates(legIndex) {
  const leg = LEGS[legIndex];
  const out = [];
  for (let i = 0; i < leg.count; i++) {
    if (leg.final) {
      out.push({
        name: "Hawaiʻi", final: true,
        dist: leg.base,
        fertility: 1.4, fish: 1.3, fishCap: 12, popCap: 40, forestMax: 160,
        type: "volcanic",
        dirHint: "beneath Hōkūleʻa, the star of gladness, when it stands overhead",
        scouted: 0, tier: 0, estDist: null,
        shapeSeed: rint(1, 1e9),
      });
      continue;
    }
    const forestMax = rint(35, 160);
    out.push({
      name: makeName(), final: false,
      dist: leg.base + rfloat(-leg.spread, leg.spread),
      fertility: rfloat(0.5, 1.4),
      fish: rfloat(0.6, 1.5),
      fishCap: rint(4, 12),
      popCap: rint(18, 34),
      forestMax,
      type: forestMax < 60 ? "atoll" : (forestMax > 120 ? "volcanic" : "high"),
      dirHint: DIRECTIONS[rint(0, DIRECTIONS.length - 1)],
      scouted: 0, tier: 0, estDist: null,
      shapeSeed: rint(1, 1e9),
    });
  }
  // Guarantee at least one candidate where a canoe can be rebuilt
  if (!leg.final && !out.some(c => c.forestMax >= 70)) {
    out[0].forestMax = rint(80, 140);
    out[0].type = out[0].forestMax > 120 ? "volcanic" : "high";
  }
  return out;
}

function log(text, cls) {
  G.log.push({ turn: G.turn, text, cls: cls || "info" });
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}

function idleCount() {
  let s = 0;
  for (const j of JOB_NAMES) s += G.jobs[j];
  return G.pop - s;
}

function adjustJob(job, delta) {
  if (delta > 0 && idleCount() <= 0) return;
  if (delta < 0 && G.jobs[job] <= 0) return;
  G.jobs[job] += delta;
}

// After deaths, shed workers from the largest jobs until assignments fit
function clampJobs() {
  while (idleCount() < 0) {
    let big = JOB_NAMES[0];
    for (const j of JOB_NAMES) if (G.jobs[j] > G.jobs[big]) big = j;
    if (G.jobs[big] <= 0) break;
    G.jobs[big]--;
  }
}

function moraleFactor() {
  return 0.7 + (G.morale / 100) * 0.6;
}

function forestFactor(isl) {
  return 0.35 + 0.65 * (isl.forestStock / isl.forestMax);
}

// Per-moon yield estimates shown in the UI
function yields() {
  const isl = G.island, J = G.jobs, mf = moraleFactor();
  const fishN = Math.min(J.fisher, isl.fishCap) + Math.max(0, J.fisher - isl.fishCap) * 0.35;
  const fert = isl.fertility * (isl.drought > 0 ? 0.5 : 1);
  return {
    fish: fishN * C.FISH_RATE * isl.fish * mf,
    farm: J.farmer * C.FARM_RATE * fert * mf,
    wood: Math.min(J.woodcutter * C.WOOD_RATE * forestFactor(isl) * mf, isl.forestStock),
    build: J.builder * C.BUILD_RATE * mf,
    scoutPts: J.scout * (C.SCOUT_RATE + G.knowledge * 0.015),
    know: J.navigator * C.KNOW_RATE,
  };
}

function endTurn() {
  if (G.phase !== "island" || G.pendingEvent) return;
  const isl = G.island, J = G.jobs;
  const y = yields();

  // Production
  G.food += y.fish + y.farm;
  G.wood += y.wood;
  isl.forestStock = clamp(isl.forestStock - y.wood * 0.55 + C.REGROW, 0, isl.forestMax);

  // Build / repair the great canoe (limited by wood on hand)
  if (J.builder > 0 && G.canoe.progress < G.canoe.required) {
    const want = Math.min(y.build, G.canoe.required - G.canoe.progress);
    const canAfford = G.wood / C.CANOE_WOOD_PER_PT;
    const done = Math.min(want, canAfford);
    G.canoe.progress += done;
    G.wood -= done * C.CANOE_WOOD_PER_PT;
    if (done < want - 0.01) log("The builders idle: not enough wood for the great canoe.", "bad");
    if (G.canoe.progress >= G.canoe.required - 0.01) {
      G.canoe.progress = G.canoe.required;
      log("The great voyaging canoe stands ready on the beach! The tohunga blesses her hulls.", "good");
    }
  }

  // Scouting
  if (J.scout > 0 && G.candidates[G.scoutTarget]) {
    const c = G.candidates[G.scoutTarget];
    c.scouted += y.scoutPts;
    const newTier = tierOf(c);
    if (newTier > c.tier) {
      c.tier = newTier;
      revealTier(c);
    }
  }

  // Navigators study the stars
  G.knowledge = clamp(G.knowledge + y.know, 0, C.KNOW_CAP);

  // Eat
  G.food -= G.pop;
  if (G.food < 0) {
    const deficit = -G.food;
    G.food = 0;
    G.morale = clamp(G.morale - 9, 0, 100);
    const deaths = Math.min(G.pop, Math.ceil(deficit / 6));
    if (deaths > 0) {
      G.pop -= deaths;
      clampJobs();
      log(`Famine. ${deaths} of your people ${deaths > 1 ? "die" : "dies"} of hunger.`, "bad");
    } else {
      log("The food baskets are empty. Hunger gnaws at the village.", "bad");
    }
    if (G.pop <= 0) { gameOver(false, "starved"); return; }
  } else if (G.food > G.pop * 1.5) {
    // Plenty: spirits lift, families grow
    G.morale = clamp(G.morale + 2, 0, 100);
    if (G.pop < G.island.popCap && Math.random() < Math.min(0.5, G.pop * 0.035)) {
      G.pop++;
      log("A child is born to the village.", "good");
    }
  }

  // Morale drifts toward its resting point
  G.morale = clamp(G.morale + (60 - G.morale) * 0.04, 0, 100);

  if (isl.drought > 0) {
    isl.drought--;
    if (isl.drought === 0) log("Rain returns at last. The taro pits drink deep.", "good");
  }

  if (Math.random() < C.EVENT_CHANCE) fireIslandEvent();

  G.turn++;
  saveGame();
}

function tierOf(c) {
  let t = 0;
  for (let i = 0; i < C.TIERS.length; i++) if (c.scouted >= C.TIERS[i]) t = i + 1;
  return t;
}

function revealTier(c) {
  if (c.tier >= 1 && c.estDist == null) {
    c.estDist = c.dist * rfloat(0.85, 1.15);
    log(`Scouts return: there is land ${c.dirHint}. They name it ${c.name}, perhaps ${Math.round(c.estDist)} days' sail.`, "good");
  }
  if (c.tier === 2) {
    log(`Scouts watch the birds and clouds over ${c.name}: ${qualityWord(c.fish)} fishing, ${qualityWord(c.fertility)} soil, ${c.forestMax >= 70 ? "tall forest" : "little timber"}.`, "good");
  }
  if (c.tier === 3) {
    log(`The way to ${c.name} is sung into memory: ${Math.round(c.dist)} days under known stars. The crossing will be surer.`, "good");
  }
}

function holdFestival() {
  const cost = G.pop;
  if (G.phase !== "island" || G.food < cost) return;
  G.food -= cost;
  G.morale = clamp(G.morale + 16, 0, 100);
  log("Drums and shared feasting late into the night. The people's hearts are strong.", "good");
  saveGame();
}

function canoeReady() {
  return G.canoe.progress >= G.canoe.required - 0.01;
}

function depart(destIndex, crew, provisions) {
  const dest = G.candidates[destIndex];
  if (!dest || !canoeReady() || G.phase !== "island") return;
  crew = Math.max(1, Math.min(Math.floor(crew), G.pop, C.CREW_MAX));
  provisions = clamp(Math.floor(provisions), 0, Math.floor(G.food));

  const stayed = G.pop - crew;
  if (stayed > 0) {
    G.legacy.settled += stayed;
    log(`${stayed} of your people remain to keep the fires of ${G.island.name} burning.`, "info");
  }
  G.food -= provisions;

  const err = C.TIER_ERR[dest.tier];
  G.voyage = {
    dest,
    day: 0,
    progress: 0,
    dist: dest.dist * rfloat(1 - err, 1 + err),
    food: provisions,
    crew,
    storms: 0,
    hungry: 0,
    weather: "fair",
    done: false,
  };
  G.pop = crew;
  G.phase = "voyage";
  log(`The great canoe slides into the swell, bound for ${dest.tier > 0 ? dest.name : "an unknown land"}. ${crew} souls aboard.`, "info");
  saveGame();
}

function gameOver(won, reason) {
  G.phase = "end";
  G.end = { won, reason };
  saveGame();
}

// ---------- Island events ----------

const ISLAND_EVENTS = {
  cyclone: {
    weight: 1, auto: true,
    fire() {
      G.food = Math.max(0, Math.floor(G.food * 0.8));
      G.canoe.progress = Math.max(0, G.canoe.progress - 8);
      G.morale = clamp(G.morale - 10, 0, 100);
      log("A cyclone tears across the island. Stores are spoiled and lashings on the great canoe are torn loose.", "bad");
    },
  },
  fishrun: {
    weight: 1.2, auto: true,
    fire() {
      const gain = Math.round(G.pop * 1.5);
      G.food += gain;
      log(`A great run of fish fills the lagoon. +${gain} food.`, "good");
    },
  },
  drought: {
    weight: 0.8, auto: true,
    cond: () => G.island.drought === 0,
    fire() {
      G.island.drought = 3;
      log("The rains fail. The taro pits crack and dry — harvests will be thin for a while.", "bad");
    },
  },
  kinfolk: {
    weight: 0.7, auto: true,
    fire() {
      G.knowledge = clamp(G.knowledge + 4, 0, C.KNOW_CAP);
      G.morale = clamp(G.morale + 5, 0, 100);
      if (G.pop + 2 <= G.island.popCap) {
        G.pop += 2;
        log("A canoe of kinfolk arrives from a far shore, bringing two more hands and tales of distant stars.", "good");
      } else {
        G.food += 12;
        log("A canoe of kinfolk visits, trading dried fish and tales of distant stars before sailing on.", "good");
      }
    },
  },
  breadfruit: {
    weight: 1, auto: true,
    fire() {
      const gain = Math.round(G.pop * 1.2);
      G.food += gain;
      log(`The breadfruit trees hang heavy. +${gain} food.`, "good");
    },
  },
  rats: {
    weight: 0.9, auto: true,
    cond: () => G.food > 20,
    fire() {
      const loss = Math.floor(G.food * 0.15);
      G.food -= loss;
      log(`Rats gnaw into the storage pits. -${loss} food.`, "bad");
    },
  },
  scoutlost: {
    weight: 0.7, auto: true,
    cond: () => G.jobs.scout > 0,
    fire() {
      G.pop--;
      G.jobs.scout--;
      G.morale = clamp(G.morale - 8, 0, 100);
      log("A scouting canoe does not return. The reef heron cries for one of your own.", "bad");
      if (G.pop <= 0) gameOver(false, "starved");
    },
  },
  elder: {
    weight: 0.5, auto: true,
    cond: () => G.knowledge > 15,
    fire() {
      G.knowledge = clamp(G.knowledge - 5, 0, C.KNOW_CAP);
      G.morale = clamp(G.morale - 5, 0, 100);
      log("An old navigator dies in the night. Some of the star-songs die with him.", "bad");
    },
  },
  whale: {
    weight: 0.5, auto: false,
    title: "A Whale on the Sand",
    text: "At dawn a great whale lies stranded on the reef flat, still breathing. The village gathers. Some sharpen knives; the old priest speaks of Tangaroa's messenger.",
    options: [
      {
        label: "Take the gift of meat",
        hint: "A mountain of food, but the omen weighs on some hearts.",
        apply() {
          const gain = Math.round(G.pop * 3);
          G.food += gain;
          G.morale = clamp(G.morale - 4, 0, 100);
          log(`The whale feeds the village for weeks. +${gain} food.`, "good");
        },
      },
      {
        label: "Labor to return it to the sea",
        hint: "No meat, but the priest says the sea will remember.",
        apply() {
          G.morale = clamp(G.morale + 8, 0, 100);
          G.knowledge = clamp(G.knowledge + 3, 0, C.KNOW_CAP);
          log("With ropes and rollers and the rising tide, the whale swims free. The people sing of it.", "good");
        },
      },
    ],
  },
};

function fireIslandEvent() {
  const pool = [];
  for (const id in ISLAND_EVENTS) {
    const ev = ISLAND_EVENTS[id];
    if (ev.cond && !ev.cond()) continue;
    pool.push({ id, w: ev.weight });
  }
  let total = 0;
  for (const p of pool) total += p.w;
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) {
      const ev = ISLAND_EVENTS[p.id];
      if (ev.auto) ev.fire();
      else G.pendingEvent = { kind: "island", id: p.id };
      return;
    }
  }
}

function resolvePendingEvent(optIndex) {
  if (!G.pendingEvent) return;
  const reg = G.pendingEvent.kind === "island" ? ISLAND_EVENTS : VOYAGE_EVENTS;
  const ev = reg[G.pendingEvent.id];
  G.pendingEvent = null;
  ev.options[optIndex].apply();
  saveGame();
}

// ---------- Save / load ----------

const SAVE_KEY = "polynesia_save_v1";

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* private mode etc. */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.island || data.phase === "end") return false;
    G = data;
    return true;
  } catch (e) { return false; }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
