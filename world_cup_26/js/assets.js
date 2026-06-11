"use strict";
// Decodes the embedded base64 images and builds kit-recolored player sprites.
// The Blue character set is the recolor source: its two shirt blues get
// remapped to any team color, everything else (skin, hair) is left alone.

WC.Assets = (function () {
  var U = WC.U;
  var images = {};          // raw Image objects by key
  var kitCache = {};        // canvas sprites by variant|color

  var SRC_MAIN = { r: 65, g: 159, b: 221 };   // #419FDD shirt
  var SRC_SHADE = { r: 45, g: 116, b: 163 };  // #2D74A3 shirt shadow

  function colorDist(r, g, b, c) {
    return Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b);
  }

  function load(onDone) {
    var keys = Object.keys(WC.ASSET_DATA);
    var left = keys.length;
    keys.forEach(function (k) {
      var img = new Image();
      img.onload = function () { if (--left === 0) onDone(); };
      img.onerror = function () { console.error("asset failed: " + k); if (--left === 0) onDone(); };
      img.src = WC.ASSET_DATA[k];
      images[k] = img;
    });
  }

  // returns a canvas with the variant sprite recolored to kitHex
  function playerSprite(variant, kitHex) {
    var key = variant + "|" + kitHex;
    if (kitCache[key]) return kitCache[key];

    var img = images["char" + variant];
    var cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    var cx = cv.getContext("2d");
    cx.drawImage(img, 0, 0);
    var data = cx.getImageData(0, 0, cv.width, cv.height);
    var px = data.data;

    var main = U.hexToRgb(kitHex);
    var shade = U.hexToRgb(U.shade(kitHex, 0.72));

    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      var r = px[i], g = px[i + 1], b = px[i + 2];
      var dm = colorDist(r, g, b, SRC_MAIN);
      var ds = colorDist(r, g, b, SRC_SHADE);
      if (dm < 70 || ds < 70) {
        var t = dm <= ds ? main : shade;
        px[i] = t.r; px[i + 1] = t.g; px[i + 2] = t.b;
      }
    }
    cx.putImageData(data, 0, 0);
    kitCache[key] = cv;
    return cv;
  }

  return {
    load: load,
    img: function (k) { return images[k]; },
    playerSprite: playerSprite,
  };
})();
