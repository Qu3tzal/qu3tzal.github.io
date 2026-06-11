"use strict";
// The 16 selectable nations. kit = primary shirt color, alt = away shirt used
// when both kits would look alike. Ratings 0-99 nudge AI speed & decisions.

WC.TEAMS = [
  { id: "USA", name: "United States", flag: "flag_US",     kit: "#F2F2F2", alt: "#1F2C5C", att: 78, def: 77, spd: 82 },
  { id: "MEX", name: "Mexico",        flag: "flag_MX",     kit: "#0E7A3C", alt: "#F2F2F2", att: 79, def: 76, spd: 80 },
  { id: "CAN", name: "Canada",        flag: "flag_CA",     kit: "#D52B1E", alt: "#F2F2F2", att: 75, def: 74, spd: 81 },
  { id: "BRA", name: "Brazil",        flag: "flag_BR",     kit: "#F8D22A", alt: "#2A5CAA", att: 92, def: 84, spd: 89 },
  { id: "ARG", name: "Argentina",     flag: "flag_AR",     kit: "#8EC4E8", alt: "#2B3A67", att: 93, def: 86, spd: 85 },
  { id: "FRA", name: "France",        flag: "flag_FR",     kit: "#2E4FA0", alt: "#F2F2F2", att: 91, def: 87, spd: 88 },
  { id: "ENG", name: "England",       flag: "flag_GB_ENG", kit: "#F7F7F7", alt: "#7A1E2B", att: 88, def: 85, spd: 84 },
  { id: "ESP", name: "Spain",         flag: "flag_ES",     kit: "#C8102E", alt: "#F2E16A", att: 90, def: 86, spd: 83 },
  { id: "GER", name: "Germany",       flag: "flag_DE",     kit: "#FAFAFA", alt: "#2E5E4E", att: 86, def: 84, spd: 82 },
  { id: "POR", name: "Portugal",      flag: "flag_PT",     kit: "#9B1B30", alt: "#2E7D5B", att: 88, def: 82, spd: 84 },
  { id: "NED", name: "Netherlands",   flag: "flag_NL",     kit: "#F36C21", alt: "#1F2C5C", att: 85, def: 84, spd: 82 },
  { id: "ITA", name: "Italy",         flag: "flag_IT",     kit: "#2D8FD8", alt: "#F2F2F2", att: 83, def: 86, spd: 80 },
  { id: "JPN", name: "Japan",         flag: "flag_JP",     kit: "#2B3F9E", alt: "#F2F2F2", att: 82, def: 80, spd: 85 },
  { id: "MAR", name: "Morocco",       flag: "flag_MA",     kit: "#C1272D", alt: "#1B6B4C", att: 81, def: 85, spd: 84 },
  { id: "CRO", name: "Croatia",       flag: "flag_HR",     kit: "#E04646", alt: "#2B3A67", att: 83, def: 82, spd: 79 },
  { id: "BEL", name: "Belgium",       flag: "flag_BE",     kit: "#C8353B", alt: "#333333", att: 82, def: 80, spd: 79 },
];

WC.teamById = function (id) {
  for (var i = 0; i < WC.TEAMS.length; i++) if (WC.TEAMS[i].id === id) return WC.TEAMS[i];
  return null;
};

// Pick shirt colors for a match: away switches to alt kit on a clash, and the
// keepers get whichever spare color stands out from both outfield kits.
WC.resolveKits = function (teamA, teamB) {
  var kitA = teamA.kit;
  var kitB = teamB.kit;
  if (WC.U.colorDist(kitA, kitB) < 210) kitB = teamB.alt;
  if (WC.U.colorDist(kitA, kitB) < 210) kitA = teamA.alt;

  var gkPalette = ["#E7C217", "#E76F2E", "#29B6A8", "#8E6BC1", "#69D84F"];
  function pickGk(avoid) {
    var best = gkPalette[0], bestD = -1;
    for (var i = 0; i < gkPalette.length; i++) {
      var d = Math.min.apply(null, avoid.map(function (k) { return WC.U.colorDist(gkPalette[i], k); }));
      if (d > bestD) { bestD = d; best = gkPalette[i]; }
    }
    return best;
  }
  var gkA = pickGk([kitA, kitB]);
  var gkB = pickGk([kitA, kitB, gkA]);
  return { kits: [kitA, kitB], gkKits: [gkA, gkB] };
};

// Weighted result for AI-vs-AI bracket games (no draws - knockout football).
WC.simulateResult = function (teamA, teamB) {
  var ra = teamA.att * 0.6 + teamA.def * 0.4;
  var rb = teamB.att * 0.6 + teamB.def * 0.4;
  function goals(offDelta) {
    var lambda = Math.max(0.25, 1.35 + offDelta / 18);
    var g = 0, p = Math.exp(-lambda), acc = p, r = Math.random();
    while (r > acc && g < 6) { g++; p = p * lambda / g; acc += p; }
    return g;
  }
  var ga = goals(ra - rb), gb = goals(rb - ra);
  if (ga === gb) { // sudden death, weighted coin
    if (Math.random() < ra / (ra + rb)) ga++; else gb++;
  }
  return { a: ga, b: gb };
};
