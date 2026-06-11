"use strict";
// Boot + game loop.

(function () {
  function start() {
    var canvas = document.getElementById("game");
    WC.Render.init(canvas);
    WC.Input.init();
    WC.Input.onFirstKey = function () { WC.Audio.unlock(); };
    WC.Screens.boot();
    if (location.hash) WC.Screens.debugJump(location.hash);

    fitCanvas(canvas);
    window.addEventListener("resize", function () { fitCanvas(canvas); });

    var last = performance.now();
    function frame(now) {
      // rAF timestamps can precede the boot-time now() - never go negative
      var dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      WC.Screens.update(dt);
      WC.Screens.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // scale the canvas to the window, keeping the 16:10 aspect
  function fitCanvas(canvas) {
    var scale = Math.min(window.innerWidth / WC.CONST.W, window.innerHeight / WC.CONST.H);
    scale = Math.min(scale, 1.6);
    canvas.style.width = Math.floor(WC.CONST.W * scale) + "px";
    canvas.style.height = Math.floor(WC.CONST.H * scale) + "px";
  }

  window.addEventListener("DOMContentLoaded", function () {
    var loadingEl = document.getElementById("loading");
    WC.Assets.load(function () {
      if (loadingEl) loadingEl.remove();
      start();
    });
  });
})();
