"use strict";

// Tuning constants
const C = {
  CANOE_POINTS: 80,       // build points for the great voyaging canoe
  CANOE_WOOD_PER_PT: 0.6, // wood consumed per build point
  BUILD_RATE: 1.7,        // points per builder per moon
  FISH_RATE: 2.3,
  FARM_RATE: 2.0,
  WOOD_RATE: 1.9,
  SCOUT_RATE: 2.2,
  KNOW_RATE: 1.1,
  KNOW_CAP: 100,
  TIERS: [8, 20, 40],     // scout points needed for lore tiers 1..3
  TIER_ERR: [0.35, 0.22, 0.12, 0.04], // distance uncertainty by tier
  CREW_MAX: 18,
  SEA_EAT: 0.5,           // food per crew member per day at sea (lines and rain help)
  EVENT_CHANCE: 0.26,
  VOY_EVENT_CHANCE: 0.30,
  REGROW: 1.6,            // forest regrowth per moon
};

// Voyage legs: base distance in days of fair sailing
const LEGS = [
  { base: 8,  spread: 2, count: 3 },
  { base: 12, spread: 3, count: 3 },
  { base: 16, spread: 4, count: 2 },
  { base: 21, spread: 4, count: 3 },
  { base: 30, spread: 0, count: 1, final: true },
];

const NAME_SYLLABLES = ["ra","ka","ta","ma","nu","hi","va","mo","po","tu","ke","la","ho","na","ri","fa","pa","ngi","te","o","u","ai"];
const NAME_SUFFIX = ["", "", " Nui", " Iti", " Roa"];

const DIRECTIONS = [
  "beneath the rising of Matariki, the little eyes of heaven",
  "toward the path where Antares climbs from the sea",
  "where the long-tailed cuckoo flies when the season turns",
  "under the setting of the Southern Cross",
  "toward the sun's cradle at midsummer dawn",
  "where the swells bend around unseen land",
];

// Flavor adjectives for scouted quality hints
function qualityWord(v) {
  if (v >= 1.2) return "rich";
  if (v >= 0.9) return "fair";
  if (v >= 0.7) return "thin";
  return "poor";
}

// Seeded PRNG (mulberry32) for stable island shapes
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function rfloat(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function makeName() {
  let n = NAME_SYLLABLES[rint(0, NAME_SYLLABLES.length - 1)];
  const len = rint(2, 3);
  for (let i = 1; i < len; i++) n += NAME_SYLLABLES[rint(0, NAME_SYLLABLES.length - 1)];
  n = n[0].toUpperCase() + n.slice(1);
  return n + NAME_SUFFIX[rint(0, NAME_SUFFIX.length - 1)];
}
