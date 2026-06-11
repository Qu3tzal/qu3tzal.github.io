"use strict";
WC.U = {
  clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  dist: function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
  len: function (x, y) { return Math.sqrt(x * x + y * y); },
  angTo: function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

  // normalized vector (zero-safe)
  norm: function (x, y) {
    var l = Math.sqrt(x * x + y * y);
    if (l < 1e-6) return { x: 0, y: 0 };
    return { x: x / l, y: y / l };
  },

  angDiff: function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  // exponential approach: fraction remaining after dt given half-life
  decay: function (halfLife, dt) { return Math.pow(0.5, dt / halfLife); },

  rand: function (lo, hi) { return lo + Math.random() * (hi - lo); },
  randInt: function (lo, hi) { return Math.floor(WC.U.rand(lo, hi + 1)); },
  chance: function (p) { return Math.random() < p; },
  pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  // roughly normal noise in [-1,1]
  noise: function () { return (Math.random() + Math.random() + Math.random()) / 1.5 - 1; },

  // min perpendicular distance from point p to segment a-b
  segDist: function (px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 < 1e-6) return WC.U.dist(px, py, ax, ay);
    var t = WC.U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return WC.U.dist(px, py, ax + t * dx, ay + t * dy);
  },

  hexToRgb: function (hex) {
    var h = hex.replace("#", "");
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16),
    };
  },

  rgbToHex: function (r, g, b) {
    function c(v) { v = Math.round(WC.U.clamp(v, 0, 255)); return (v < 16 ? "0" : "") + v.toString(16); }
    return "#" + c(r) + c(g) + c(b);
  },

  shade: function (hex, mult) {
    var c = WC.U.hexToRgb(hex);
    return WC.U.rgbToHex(c.r * mult, c.g * mult, c.b * mult);
  },

  colorDist: function (hexA, hexB) {
    var a = WC.U.hexToRgb(hexA), b = WC.U.hexToRgb(hexB);
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  },
};
