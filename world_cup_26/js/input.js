"use strict";
// Keyboard input. Uses e.code (physical position) so WASD works on
// QWERTY and AZERTY alike. Arrows also always work.

WC.Input = (function () {
  var held = {};
  var pressed = {};   // edge-triggered, cleared when consumed

  var MOVE = {
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
  };
  var ACTION = {
    pass: ["Space", "KeyK"],
    shoot: ["KeyX", "KeyL"],
    switch: ["KeyC"],
    sprint: ["ShiftLeft", "ShiftRight"],
    confirm: ["Enter", "Space"],
    back: ["Escape"],
    pause: ["Escape", "KeyP"],
    mute: ["KeyM"],
    // manager mode
    panel: ["Tab", "KeyE"],
    rally: ["KeyR"],
    ffwd: ["KeyF"],
  };

  var GAME_CODES = {};
  Object.keys(MOVE).forEach(function (k) { MOVE[k].forEach(function (c) { GAME_CODES[c] = 1; }); });
  Object.keys(ACTION).forEach(function (k) { ACTION[k].forEach(function (c) { GAME_CODES[c] = 1; }); });

  function anyHeld(codes) {
    for (var i = 0; i < codes.length; i++) if (held[codes[i]]) return true;
    return false;
  }
  function anyPressed(codes) {
    for (var i = 0; i < codes.length; i++) if (pressed[codes[i]]) return true;
    return false;
  }
  function consume(codes) {
    var hit = anyPressed(codes);
    for (var i = 0; i < codes.length; i++) delete pressed[codes[i]];
    return hit;
  }

  var api = {
    onFirstKey: null, // hook for audio unlock

    init: function () {
      window.addEventListener("keydown", function (e) {
        if (GAME_CODES[e.code]) e.preventDefault();
        if (api.onFirstKey) { api.onFirstKey(); api.onFirstKey = null; }
        if (!held[e.code]) pressed[e.code] = true;
        held[e.code] = true;
      });
      window.addEventListener("keyup", function (e) { delete held[e.code]; });
      window.addEventListener("blur", function () { held = {}; pressed = {}; });
    },

    // match-style input snapshot; edges consumed
    matchInput: function () {
      var mx = (anyHeld(MOVE.right) ? 1 : 0) - (anyHeld(MOVE.left) ? 1 : 0);
      var my = (anyHeld(MOVE.down) ? 1 : 0) - (anyHeld(MOVE.up) ? 1 : 0);
      return {
        mx: mx, my: my,
        sprint: anyHeld(ACTION.sprint),
        passDown: consume(ACTION.pass),
        shootDown: consume(ACTION.shoot),
        switchDown: consume(ACTION.switch),
      };
    },

    // menu edges
    menu: function () {
      return {
        up: consume(MOVE.up),
        down: consume(MOVE.down),
        left: consume(MOVE.left),
        right: consume(MOVE.right),
        confirm: consume(ACTION.confirm),
        back: consume(ACTION.back),
      };
    },

    pausePressed: function () { return consume(ACTION.pause); },
    mutePressed: function () { return consume(ACTION.mute); },
    panelPressed: function () { return consume(ACTION.panel); },
    rallyPressed: function () { return consume(ACTION.rally); },
    ffwdPressed: function () { return consume(ACTION.ffwd); },
    clearEdges: function () { pressed = {}; },
  };
  return api;
})();
