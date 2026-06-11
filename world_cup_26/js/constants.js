"use strict";
// Geometry & gameplay tuning. All sizes in canvas pixels, speeds in px/sec.
// Two pitch configs share one mutable object tree: WC.setPitch() swaps the
// values in place so every module's live references stay valid.

WC.CONST = (function () {
  var W = 960, H = 600;

  var C = {
    W: W, H: H,
    FIELD: {},   // filled by setPitch
    GOAL: {},
    BOX: {},

    PLAYER: {
      // mode-independent
      speed: 178,
      sprint: 1.34,
      accel: 1050,
      carrierMult: 0.875,
      gkSpeed: 165,
      // mode-dependent (setPitch)
      r: 11, controlR: 16, spriteScale: 1.6,
    },

    BALL: {
      passSpeed: 440,
      shotSpeed: 600,
      halfLife: 0.85,
      r: 6, dribbleLead: 15, // mode-dependent
    },

    TACKLE: {
      lungeBoost: 1.65,
      lungeTime: 0.22,
      cooldown: 0.85,
      stealImmunity: 0.55,
      kickLockout: 0.4,
      radius: 22, // mode-dependent
    },

    TIME: {
      halfReal: 65,
      halfDisplayMin: 45,
      goalCelebration: 2.4,
      halfTimePause: 2.6,
      restartSetupMax: 1.5,
      aiRestartDelay: 0.7,
    },

    MODE: "arcade",
  };

  return C;
})();

// 5-a-side arcade formation (x from own goal line, y across, as fractions)
WC.FORM_ARCADE = [
  { role: "GK", fx: 0.025, fy: 0.50 },
  { role: "DF", fx: 0.20,  fy: 0.30 },
  { role: "DF", fx: 0.20,  fy: 0.70 },
  { role: "FW", fx: 0.42,  fy: 0.34 },
  { role: "FW", fx: 0.42,  fy: 0.66 },
];

// 11-a-side formations for manager mode
WC.FORMATIONS_11 = {
  "4-4-2": [
    { role: "GK", fx: 0.02, fy: 0.50 },
    { role: "DF", fx: 0.13, fy: 0.16 },
    { role: "DF", fx: 0.11, fy: 0.38 },
    { role: "DF", fx: 0.11, fy: 0.62 },
    { role: "DF", fx: 0.13, fy: 0.84 },
    { role: "MF", fx: 0.28, fy: 0.15 },
    { role: "MF", fx: 0.26, fy: 0.40 },
    { role: "MF", fx: 0.26, fy: 0.60 },
    { role: "MF", fx: 0.28, fy: 0.85 },
    { role: "FW", fx: 0.42, fy: 0.38 },
    { role: "FW", fx: 0.42, fy: 0.62 },
  ],
  "4-3-3": [
    { role: "GK", fx: 0.02, fy: 0.50 },
    { role: "DF", fx: 0.13, fy: 0.16 },
    { role: "DF", fx: 0.11, fy: 0.38 },
    { role: "DF", fx: 0.11, fy: 0.62 },
    { role: "DF", fx: 0.13, fy: 0.84 },
    { role: "MF", fx: 0.27, fy: 0.28 },
    { role: "MF", fx: 0.24, fy: 0.50 },
    { role: "MF", fx: 0.27, fy: 0.72 },
    { role: "FW", fx: 0.43, fy: 0.18 },
    { role: "FW", fx: 0.45, fy: 0.50 },
    { role: "FW", fx: 0.43, fy: 0.82 },
  ],
  "5-3-2": [
    { role: "GK", fx: 0.02, fy: 0.50 },
    { role: "DF", fx: 0.15, fy: 0.12 },
    { role: "DF", fx: 0.11, fy: 0.31 },
    { role: "DF", fx: 0.10, fy: 0.50 },
    { role: "DF", fx: 0.11, fy: 0.69 },
    { role: "DF", fx: 0.15, fy: 0.88 },
    { role: "MF", fx: 0.28, fy: 0.28 },
    { role: "MF", fx: 0.26, fy: 0.50 },
    { role: "MF", fx: 0.28, fy: 0.72 },
    { role: "FW", fx: 0.43, fy: 0.38 },
    { role: "FW", fx: 0.43, fy: 0.62 },
  ],
};

// Swap the pitch/physics profile in place. Render.refreshPitch() must be
// called afterwards when a canvas exists.
WC.setPitch = function (mode) {
  var C = WC.CONST;
  C.MODE = mode;

  function field(w, h) {
    var F = C.FIELD;
    F.left = (C.W - w) / 2;
    F.right = (C.W + w) / 2;
    F.top = (C.H - h) / 2;
    F.bottom = (C.H + h) / 2;
    F.w = w; F.h = h;
    F.cx = C.W / 2; F.cy = C.H / 2;
  }

  if (mode === "manager") {
    // FIFA international pitch: 100m x 64m minimum, drawn to scale (x8.2 px/m)
    field(820, 525);
    var pxm = 820 / 100; // pixels per meter
    C.GOAL.halfMouth = (7.32 / 2) * (525 / 64) * 1.30; // slightly generous goal
    C.GOAL.depth = 20;
    C.GOAL.postR = 3.5;
    C.GOAL.reachK = 0.36;   // GK dive reach as a fraction of the mouth
    C.BOX.penW = 16.5 * pxm;
    C.BOX.penHalfH = (40.32 / 2) * (525 / 64);
    C.BOX.sixW = 5.5 * pxm;
    C.BOX.sixHalfH = (18.32 / 2) * (525 / 64);
    C.BOX.spot = 11 * pxm;
    C.BOX.circleR = 9.15 * pxm;
    C.PLAYER.r = 8.5;
    C.PLAYER.controlR = 13.5;
    C.PLAYER.spriteScale = 1.12;
    C.BALL.r = 5;
    C.BALL.dribbleLead = 12;
    C.TACKLE.radius = 19;
  } else {
    field(860, 500);
    C.GOAL.halfMouth = 62;
    C.GOAL.depth = 26;
    C.GOAL.postR = 4;
    C.GOAL.reachK = 0.44;
    C.GOAL.saveBase = 0.84;
    C.BOX.penW = 132;
    C.BOX.penHalfH = 132;
    C.BOX.sixW = 52;
    C.BOX.sixHalfH = 74;
    C.BOX.spot = 95;
    C.BOX.circleR = 72;
    C.PLAYER.r = 11;
    C.PLAYER.controlR = 16;
    C.PLAYER.spriteScale = 1.6;
    C.BALL.r = 6;
    C.BALL.dribbleLead = 15;
    C.TACKLE.radius = 22;
  }
};

WC.setPitch("arcade");
