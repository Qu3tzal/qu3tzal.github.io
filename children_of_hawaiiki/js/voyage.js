"use strict";

// One day of sailing. Called by the UI; halts when an event needs a choice.
function sailDay() {
  const v = G.voyage;
  if (!v || v.done || G.pendingEvent || G.phase !== "voyage") return;
  v.day++;
  v.weather = "fair";

  // Wayfinding: knowledge and scouted lore keep the canoe on course
  const p = clamp(0.5 + G.knowledge / 250 + v.dest.tier * 0.06, 0, 0.97);
  let speed = rfloat(0.75, 1.45);
  if (Math.random() > p) {
    speed *= 0.35;
    G.morale = clamp(G.morale - 3, 0, 100);
    vlog("Clouds hide the stars; the navigator frowns and the canoe wanders.", "bad");
  }
  v.progress += speed;

  // Provisions
  v.food -= v.crew * C.SEA_EAT;
  if (v.food <= 0) {
    v.food = 0;
    v.hungry++;
    if (v.hungry > 1) {
      const deaths = Math.min(v.crew, 1 + Math.floor(v.crew * 0.06));
      v.crew -= deaths;
      G.pop = v.crew;
      G.legacy.crewLost += deaths;
      G.morale = clamp(G.morale - 10, 0, 100);
      vlog(`Hunger takes ${deaths} of the crew. The sea receives them with old prayers.`, "bad");
      if (v.crew <= 0) { gameOver(false, "sea"); return; }
    } else {
      vlog("The last of the provisions is gone. Only rainwater and what the lines catch.", "bad");
    }
  } else {
    v.hungry = 0;
  }

  // Landfall?
  if (v.progress >= v.dist) {
    v.done = true;
    arrive();
    return;
  }

  // Signs of land near the end of the crossing
  if (v.dist - v.progress < 2.5 && Math.random() < 0.6) {
    vlog("Land-signs! Drifting fronds, and noddies flying low at dusk.", "good");
  }

  if (v.day > 1 && Math.random() < C.VOY_EVENT_CHANCE) {
    fireVoyageEvent();
  }
  saveGame();
}

function vlog(text, cls) {
  G.log.push({ turn: G.voyage ? "d" + G.voyage.day : G.turn, text, cls: cls || "info" });
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}

function arrive() {
  const v = G.voyage;
  const d = v.dest;
  if (d.final) {
    G.legacy.settled += v.crew;
    G.legacy.islands.push(d.name);
    gameOver(true, "hawaii");
    return;
  }
  // Settle the new island
  G.legIndex++;
  G.island = {
    name: d.name,
    type: d.type,
    fertility: d.fertility,
    fish: d.fish,
    fishCap: d.fishCap,
    popCap: d.popCap,
    forestMax: d.forestMax,
    forestStock: Math.round(d.forestMax * 0.9),
    drought: 0,
    final: false,
    shapeSeed: d.shapeSeed,
  };
  G.pop = v.crew;
  G.food = Math.floor(v.food) + 10; // landing forage: crabs, coconuts, shellfish
  G.wood = 5; // what was lashed to the deck, plus driftwood on the strand
  G.morale = clamp(G.morale + 12, 0, 100);
  // The crossing wears the canoe; storms wear it more
  const wear = clamp(0.45 + v.storms * 0.06, 0.45, 0.75);
  G.canoe.progress = Math.round(G.canoe.required * (1 - wear));
  for (const j of JOB_NAMES) G.jobs[j] = 0;
  G.candidates = genCandidates(G.legIndex);
  G.scoutTarget = 0;
  G.voyage = null;
  G.phase = "island";
  G.legacy.islands.push(d.name);
  G.turn++;
  log(`Landfall! After ${v.day} days at sea, your people wade ashore on ${d.name}. The canoe needs repair before it sails again.`, "good");
  saveGame();
}

// ---------- Voyage events ----------

const VOYAGE_EVENTS = {
  storm: {
    weight: 1.2,
    title: "Storm Rising",
    text: "The horizon to windward turns black, and the swell begins to heave. The steersman looks to the navigator.",
    options: [
      {
        label: "Run before the wind",
        hint: "Great speed — but the hulls and crew will be tested.",
        apply() {
          const v = G.voyage;
          v.progress += 1.6;
          v.storms++;
          v.weather = "storm";
          if (Math.random() < 0.3 && v.crew > 1) {
            v.crew--; G.pop = v.crew; G.legacy.crewLost++;
            G.morale = clamp(G.morale - 12, 0, 100);
            vlog("The canoe flies before the storm — but a wave sweeps one of the crew into the dark.", "bad");
          } else {
            vlog("The canoe flies before the storm like a frigate bird. A wild, fast night.", "good");
          }
        },
      },
      {
        label: "Lash down and ride it out",
        hint: "Lose a day, keep everyone aboard.",
        apply() {
          const v = G.voyage;
          v.progress = Math.max(0, v.progress - 0.5);
          v.storms++;
          v.weather = "storm";
          vlog("Sail down, everything lashed tight. The storm passes over a huddled, soaked, living crew.", "info");
        },
      },
    ],
  },
  doldrums: {
    weight: 1,
    title: "The Dead Calm",
    text: "The wind dies completely. The sail hangs slack and the sea turns to oiled glass.",
    options: [
      {
        label: "Out paddles, all hands",
        hint: "Keep moving, but hungry work.",
        apply() {
          const v = G.voyage;
          v.progress += 0.7;
          v.food = Math.max(0, v.food - v.crew * 0.4);
          vlog("The crew paddles through the glassy calm, chanting to keep the stroke.", "info");
        },
      },
      {
        label: "Rest and wait for wind",
        hint: "Save strength and food; drift a while.",
        apply() {
          G.morale = clamp(G.morale - 4, 0, 100);
          vlog("The canoe drifts. The crew mends cord and watches the horizon for cats-paws.", "info");
        },
      },
    ],
  },
  birds: {
    weight: 1,
    title: "Frigate Birds at Dusk",
    text: "A pair of frigate birds crosses the sky, flying steady toward the sunset. Birds fly to land at dusk — but is it your land?",
    options: [
      {
        label: "Follow the birds",
        hint: "Trust the old signs.",
        apply() {
          const v = G.voyage;
          v.dist = Math.max(v.progress + 1, v.dist - 1.5);
          vlog("The navigator bends the course after the birds. The sea feels different — nearer to something.", "good");
        },
      },
      {
        label: "Hold the star course",
        hint: "The birds may roost on some bare rock.",
        apply() {
          vlog("The canoe holds her line beneath the stars.", "info");
        },
      },
    ],
  },
  tuna: {
    weight: 1,
    title: "A Boiling of Tuna",
    text: "The sea ahead churns silver — a great school of tuna driving baitfish to the surface.",
    options: [
      {
        label: "Heave to and fish",
        hint: "Fill the food baskets; lose some way.",
        apply() {
          const v = G.voyage;
          const gain = Math.round(v.crew * 1.3);
          v.food += gain;
          v.progress = Math.max(0, v.progress - 0.5);
          vlog(`Lines fly and the deck runs silver. +${gain} food.`, "good");
        },
      },
      {
        label: "Sail on",
        hint: "Keep the wind while it serves.",
        apply() { vlog("The school boils astern and is gone.", "info"); },
      },
    ],
  },
  cloud: {
    weight: 0.8,
    title: "A Cloud Like Land",
    text: "Far off the bow stands a tall, unmoving cloud — the kind that gathers over high islands. Or it is only a cloud.",
    options: [
      {
        label: "Chase the cloud",
        hint: "It could be landfall — or a day thrown away.",
        apply() {
          const v = G.voyage;
          if (Math.random() < 0.5) {
            v.dist = Math.max(v.progress + 1, v.dist - 2);
            vlog("Beneath the cloud, the swell shortens and the water pales. Land is near!", "good");
          } else {
            v.progress = Math.max(0, v.progress - 1);
            G.morale = clamp(G.morale - 5, 0, 100);
            vlog("The cloud dissolves at dusk. Empty sea in every direction.", "bad");
          }
        },
      },
      {
        label: "Trust the stars",
        hint: "Knowledge steadies the crew.",
        apply() {
          if (G.knowledge >= 40) {
            G.morale = clamp(G.morale + 3, 0, 100);
            vlog("The navigator names the stars one by one, and the crew is calmed.", "good");
          } else {
            vlog("The canoe holds course, though eyes keep drifting to that cloud.", "info");
          }
        },
      },
    ],
  },
  lashing: {
    weight: 0.8,
    title: "The Lashings Groan",
    text: "A main lashing between hull and crossbeam has chafed through. The platform works and groans with every swell.",
    options: [
      {
        label: "Heave to and re-lash",
        hint: "Lose most of a day; sail safe.",
        apply() {
          const v = G.voyage;
          v.progress = Math.max(0, v.progress - 0.8);
          vlog("Half a day of cord-work in the swell. The canoe rides tight and true again.", "info");
        },
      },
      {
        label: "Press on",
        hint: "Risk the hull to keep the wind.",
        apply() {
          const v = G.voyage;
          if (Math.random() < 0.25 && v.crew > 2) {
            v.crew -= 2; G.pop = v.crew; G.legacy.crewLost += 2;
            v.progress = Math.max(0, v.progress - 1);
            G.morale = clamp(G.morale - 15, 0, 100);
            vlog("With a crack the crossbeam tears loose. Two of the crew are lost saving the hull.", "bad");
            if (v.crew <= 0) gameOver(false, "sea");
          } else {
            vlog("The lashing holds, barely. No one sleeps near the groaning beam.", "info");
          }
        },
      },
    ],
  },
  squall: {
    weight: 0.9,
    title: "Rain Squall",
    text: "A grey curtain of rain sweeps across the sea toward the canoe.",
    options: [
      {
        label: "Spread mats and catch water",
        hint: "Fresh water lifts every heart.",
        apply() {
          G.morale = clamp(G.morale + 5, 0, 100);
          G.voyage.food += 2;
          vlog("Sweet rainwater fills the gourds. The crew drinks deep and laughs.", "good");
        },
      },
      {
        label: "Use its wind",
        hint: "Ride the squall's edge for speed.",
        apply() {
          G.voyage.progress += 0.8;
          vlog("The canoe heels and surges on the squall wind.", "good");
        },
      },
    ],
  },
  chant: {
    weight: 0.7,
    title: "The Old Chants",
    text: "In the long night watch, the navigator begins the voyaging chants — the names of stars, the names of ancestors who crossed before.",
    options: [
      {
        label: "Let every voice join",
        apply() {
          G.morale = clamp(G.morale + 7, 0, 100);
          G.knowledge = clamp(G.knowledge + 1, 0, C.KNOW_CAP);
          vlog("The chant rolls over the dark water. Each soul aboard remembers why they sail.", "good");
        },
      },
    ],
  },
};

function fireVoyageEvent() {
  const pool = [];
  let total = 0;
  for (const id in VOYAGE_EVENTS) { pool.push(id); total += VOYAGE_EVENTS[id].weight; }
  let r = Math.random() * total;
  for (const id of pool) {
    r -= VOYAGE_EVENTS[id].weight;
    if (r <= 0) { G.pendingEvent = { kind: "voyage", id }; return; }
  }
}
