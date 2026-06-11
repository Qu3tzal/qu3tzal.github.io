"use strict";
// All drawing. The pitch (grass, lines, stands, crowd) is pre-rendered once;
// per-frame work is sprites, HUD, banners and particles.

WC.Render = (function () {
  var C = WC.CONST, U = WC.U;
  var canvas, ctx;
  var pitchLayer;
  var shakeMag = 0;
  var banners = [];    // {text, sub, color, t, dur}
  var particles = [];  // {x,y,vx,vy,life,maxLife,color,r,grav,sway}
  var FONT = '"Arial Black", "Segoe UI", sans-serif';

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    prerenderPitch();
  }

  // ---- pitch -------------------------------------------------------------

  function prerenderPitch() {
    var F = C.FIELD, G = C.GOAL, B = C.BOX;
    pitchLayer = document.createElement("canvas");
    pitchLayer.width = C.W; pitchLayer.height = C.H;
    var g = pitchLayer.getContext("2d");

    // stands + crowd dots
    g.fillStyle = "#23283a";
    g.fillRect(0, 0, C.W, C.H);
    for (var i = 0; i < 1700; i++) {
      var ang = Math.random();
      var x, y;
      // keep dots in the outer band
      do {
        x = Math.random() * C.W; y = Math.random() * C.H;
      } while (x > 30 && x < C.W - 30 && y > 30 && y < C.H - 30);
      var shades = ["#5a637f", "#717c9c", "#46506b", "#8d97b5", "#c0586a", "#5f8fc0", "#c9b169"];
      g.fillStyle = shades[Math.floor(Math.random() * shades.length)];
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(x, y, 3, 3);
    }
    g.globalAlpha = 1;

    // green apron
    g.fillStyle = "#2e7c46";
    g.fillRect(34, 34, C.W - 68, C.H - 68);

    // grass with mowing stripes
    g.fillStyle = "#4aab63";
    g.fillRect(F.left - 12, F.top - 12, F.w + 24, F.h + 24);
    g.fillStyle = "#52b56b";
    var stripeW = F.w / 10;
    for (i = 0; i < 10; i += 2) {
      g.fillRect(F.left + i * stripeW, F.top - 12, stripeW, F.h + 24);
    }

    // lines
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = 3;
    g.strokeRect(F.left, F.top, F.w, F.h);
    g.beginPath(); g.moveTo(F.cx, F.top); g.lineTo(F.cx, F.bottom); g.stroke();
    g.beginPath(); g.arc(F.cx, F.cy, B.circleR, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath(); g.arc(F.cx, F.cy, 4, 0, Math.PI * 2); g.fill();

    [0, 1].forEach(function (side) {
      var sgn = side === 0 ? 1 : -1;
      var gx = side === 0 ? F.left : F.right;
      // penalty box
      g.strokeRect(
        side === 0 ? gx : gx - B.penW,
        F.cy - B.penHalfH, B.penW, B.penHalfH * 2);
      // six yard box
      g.strokeRect(
        side === 0 ? gx : gx - B.sixW,
        F.cy - B.sixHalfH, B.sixW, B.sixHalfH * 2);
      // spot
      g.beginPath(); g.arc(gx + sgn * B.spot, F.cy, 3, 0, Math.PI * 2); g.fill();
      // the "D"
      g.beginPath();
      var a = Math.acos((B.penW - B.spot) / 62);
      if (side === 0) g.arc(gx + B.spot, F.cy, 62, -a, a);
      else g.arc(gx - B.spot, F.cy, 62, Math.PI - a, Math.PI + a);
      g.stroke();
      // corner arcs
      g.beginPath(); g.arc(gx, F.top, 11, side === 0 ? 0 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI); g.stroke();
      g.beginPath(); g.arc(gx, F.bottom, 11, side === 0 ? -Math.PI / 2 : Math.PI, side === 0 ? 0 : Math.PI * 1.5); g.stroke();

      // goal: net + frame behind the line
      var nx = side === 0 ? gx - G.depth : gx;
      g.fillStyle = "rgba(235,240,255,0.20)";
      g.fillRect(nx, F.cy - G.halfMouth, G.depth, G.halfMouth * 2);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 1;
      for (var k = 1; k < 5; k++) {
        var lx = nx + (G.depth / 5) * k;
        g.beginPath(); g.moveTo(lx, F.cy - G.halfMouth); g.lineTo(lx, F.cy + G.halfMouth); g.stroke();
      }
      for (k = 1; k < 10; k++) {
        var ly = F.cy - G.halfMouth + (G.halfMouth * 2 / 10) * k;
        g.beginPath(); g.moveTo(nx, ly); g.lineTo(nx + G.depth, ly); g.stroke();
      }
      g.strokeStyle = "#f4f6fb";
      g.lineWidth = 3.5;
      g.strokeRect(nx, F.cy - G.halfMouth, G.depth, G.halfMouth * 2);
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = 3;
      g.fillStyle = "rgba(255,255,255,0.92)";
    });
  }

  // ---- effects -----------------------------------------------------------

  function addBanner(text, sub, color, dur) {
    banners.push({ text: text, sub: sub || "", color: color || "#ffffff", t: 0, dur: dur || 2.2 });
  }

  function shake(mag) { shakeMag = Math.max(shakeMag, mag); }

  function kickFlecks(x, y, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: U.rand(-60, 60), vy: U.rand(-80, -10),
        life: U.rand(0.25, 0.5), maxLife: 0.5,
        color: U.chance(0.5) ? "#3a8f52" : "#cfe8d4",
        r: U.rand(1, 2.5), grav: 320, sway: 0,
      });
    }
  }

  function confettiBurst(colors, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: U.rand(0, C.W), y: U.rand(-C.H * 0.4, 0),
        vx: U.rand(-25, 25), vy: U.rand(60, 150),
        life: U.rand(2.5, 5), maxLife: 5,
        color: U.pick(colors),
        r: U.rand(2, 4), grav: 8, sway: U.rand(1.5, 4),
      });
    }
  }

  function updateFx(dt) {
    shakeMag = Math.max(0, shakeMag - dt * 26);
    for (var i = banners.length - 1; i >= 0; i--) {
      banners[i].t += dt;
      if (banners[i].t > banners[i].dur) banners.splice(i, 1);
    }
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt + (p.sway ? Math.sin(p.life * 5) * p.sway : 0);
      p.y += p.vy * dt;
    }
  }

  function clearFx() { banners.length = 0; particles.length = 0; shakeMag = 0; }

  // ---- match frame ---------------------------------------------------------

  function drawMatch(match, opts) {
    opts = opts || {};
    var F = C.FIELD;

    ctx.save();
    if (shakeMag > 0.2) {
      ctx.translate(U.rand(-shakeMag, shakeMag), U.rand(-shakeMag, shakeMag));
    }
    ctx.drawImage(pitchLayer, 0, 0);

    // goal flash
    if (match.goalFlash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (match.goalFlash * 0.35) + ")";
      ctx.fillRect(0, 0, C.W, C.H);
    }

    // restart spot marker
    if ((match.state === "SETUP" || match.state === "WAIT") && match.restart.kind !== "kickoff") {
      var rr = 10 + Math.sin(Date.now() / 150) * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(match.restart.x, match.restart.y, rr, 0, Math.PI * 2); ctx.stroke();
    }

    // ball shadow
    var b = match.ball;
    var air = b.shadow || 0;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(b.x + 3 + air * 6, b.y + 4 + air * 8, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // player shadows
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (var i = 0; i < match.players.length; i++) {
      var p = match.players[i];
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 5, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // team rings under every player keep sides readable from above
    var hasCtl = match.controlled >= 0 && match.humanTeam !== null;
    for (i = 0; i < match.players.length; i++) {
      var rp = match.players[i];
      if (hasCtl && i === match.controlled) continue;
      ctx.strokeStyle = rp.isGK ? match.gkKits[rp.team] : match.kits[rp.team];
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y + 3, 13, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (hasCtl) {
      var cp = match.players[match.controlled];
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(cp.x, cp.y + 3, 14, 9, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // players, sorted by y so lower ones draw on top
    var sorted = match.players.slice().sort(function (a, c) { return a.y - c.y; });
    for (i = 0; i < sorted.length; i++) drawPlayer(match, sorted[i]);

    // manager mode: flag hurt players
    if (match.isManager) {
      for (i = 0; i < match.players.length; i++) {
        var kp = match.players[i];
        if (kp.person && kp.person.knock) {
          ctx.fillStyle = kp.person.knock === 2 ? "#ff4444" : "#ffaa33";
          ctx.font = "bold 13px " + FONT;
          ctx.textAlign = "center";
          ctx.fillText("+", kp.x, kp.y - 24);
        }
      }
    }

    // ball
    var ballImg = WC.Assets.img("ball");
    var bs = 1 + air * 0.5;
    ctx.save();
    ctx.translate(b.x, b.y - air * 7);
    ctx.rotate(b.spin);
    var bw = ballImg.width * bs, bh = ballImg.height * bs;
    ctx.drawImage(ballImg, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();

    // controlled marker triangle
    if (match.controlled >= 0 && match.humanTeam !== null && !opts.dim) {
      var cp2 = match.players[match.controlled];
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(cp2.x, cp2.y - 30);
      ctx.lineTo(cp2.x - 6, cp2.y - 39);
      ctx.lineTo(cp2.x + 6, cp2.y - 39);
      ctx.closePath();
      ctx.fill();
    }

    drawParticles();
    ctx.restore(); // shake

    if (opts.hud) drawHud(match);
    if (opts.dim) {
      ctx.fillStyle = "rgba(16,20,33,0.72)";
      ctx.fillRect(0, 0, C.W, C.H);
    }
    drawBanners(match);
  }

  function drawPlayer(match, p) {
    var kit = p.isGK ? match.gkKits[p.team] : match.kits[p.team];
    var spr = WC.Assets.playerSprite(p.variant, kit);
    var sc = C.PLAYER.spriteScale;
    var bob = 0;
    if (p.celebrateT > 0) bob = -Math.abs(Math.sin(p.celebrateT * 13)) * 7;
    if (p.lungeT > 0) sc *= 1.12;

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.facing + Math.PI / 2); // sprites face "up"
    ctx.drawImage(spr, -spr.width * sc / 2, -spr.height * sc / 2, spr.width * sc, spr.height * sc);
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = U.clamp(p.life / (p.maxLife * 0.4), 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD -----------------------------------------------------------------

  function drawHud(match) {
    var ta = match.teams[0], tb = match.teams[1];

    // score bar
    var bw = 350, bx = C.W / 2 - bw / 2, by = 6, bh = 36;
    roundRect(bx, by, bw, bh, 9, "rgba(13,17,28,0.88)");

    // kit chips
    ctx.fillStyle = match.kits[0];
    ctx.fillRect(bx + 8, by + 9, 5, bh - 18);
    ctx.fillStyle = match.kits[1];
    ctx.fillRect(bx + bw - 13, by + 9, 5, bh - 18);

    drawFlag(ta.flag, bx + 20, by + 5, 26);
    drawFlag(tb.flag, bx + bw - 46, by + 5, 26);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ta.id, bx + 52, by + bh / 2 + 1);
    ctx.textAlign = "right";
    ctx.fillText(tb.id, bx + bw - 52, by + bh / 2 + 1);
    ctx.textAlign = "center";
    ctx.font = "bold 21px " + FONT;
    ctx.fillText(match.score[0] + " - " + match.score[1], bx + bw / 2, by + bh / 2 + 1);

    // clock
    var label = match.extraTime ? "ET" : (match.half === 1 ? "1ST" : "2ND");
    roundRect(C.W / 2 + bw / 2 + 10, by, 96, bh, 9, "rgba(13,17,28,0.88)");
    ctx.font = "bold 16px " + FONT;
    ctx.fillStyle = "#ffd75e";
    ctx.fillText(match.displayClock() + "'", C.W / 2 + bw / 2 + 36, by + bh / 2 + 1);
    ctx.fillStyle = "#9fb0d0";
    ctx.font = "bold 11px " + FONT;
    ctx.fillText(label, C.W / 2 + bw / 2 + 76, by + bh / 2 + 1);

    // contextual hint bar
    var hint = null;
    if (match.state === "WAIT" && match.humanTeam === match.restart.team) {
      var kindName = { kickoff: "KICK-OFF", kickin: "KICK-IN", corner: "CORNER", goalkick: "GOAL KICK" }[match.restart.kind];
      hint = kindName + "  -  SPACE pass   X shoot";
    } else if (match.state === "PLAY") {
      hint = "SPACE pass/tackle   X shoot   SHIFT sprint   C switch";
    }
    if (hint && match.humanTeam !== null) {
      ctx.font = "bold 12px " + FONT;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      roundRect(C.W / 2 - 230, C.H - 26, 460, 20, 6, "rgba(13,17,28,0.62)");
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(hint, C.W / 2, C.H - 16);
    }

    // manager dugout bar
    if (match.isManager) {
      var r = match.rally[match.managed];
      var rallyTxt = r.t > 0 ? "RALLY!" : r.cd > 0 ? "R rally " + Math.ceil(r.cd) + "s" : "R rally READY";
      var txt = "TAB manage    " + rallyTxt + "    F speed x" + (match.speedMult > 1 ? "2.5" : "1") +
        "    SUBS " + match.subsUsed[match.managed] + "/" + match.maxSubs;
      roundRect(C.W / 2 - 250, C.H - 28, 500, 22, 6, "rgba(13,17,28,0.72)");
      ctx.font = "bold 12px " + FONT;
      ctx.fillStyle = r.t > 0 ? "#ffd75e" : "rgba(255,255,255,0.9)";
      ctx.textAlign = "center";
      ctx.fillText(txt, C.W / 2, C.H - 17);
    }
  }

  function drawBanners(match) {
    for (var i = 0; i < banners.length; i++) {
      var bn = banners[i];
      var prog = bn.t / bn.dur;
      var slide = 0;
      if (prog < 0.15) slide = (1 - prog / 0.15);
      if (prog > 0.85) slide = -((prog - 0.85) / 0.15);
      var cx = C.W / 2 - slide * C.W;
      var cy = C.H * 0.42;

      ctx.fillStyle = "rgba(10,13,24,0.82)";
      ctx.fillRect(0, cy - 44, C.W, 88);
      ctx.fillStyle = bn.color;
      ctx.fillRect(0, cy - 44, C.W, 4);
      ctx.fillRect(0, cy + 40, C.W, 4);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 42px " + FONT;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(bn.text, cx, cy - (bn.sub ? 10 : 0));
      if (bn.sub) {
        ctx.font = "bold 17px " + FONT;
        ctx.fillStyle = bn.color;
        ctx.fillText(bn.sub, cx, cy + 24);
      }
    }
  }

  // ---- shared bits for screens ----------------------------------------------

  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }

  function drawFlag(key, x, y, size) {
    var img = WC.Assets.img(key);
    if (img) ctx.drawImage(img, x, y, size, size);
  }

  function text(str, x, y, size, color, align) {
    ctx.font = "bold " + size + "px " + FONT;
    ctx.fillStyle = color || "#fff";
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  function staminaColor(s) {
    return s > 70 ? "#6fdc6f" : s > 40 ? "#ffce54" : "#ff6b57";
  }

  // FIFA-ish player card (vector only, no portraits). w ~ 190-220.
  function drawPlayerCard(x, y, w, person, opts) {
    opts = opts || {};
    var h = w * 1.28;
    var tier = person.ovr >= 84 ? ["#f3d877", "#caa53d", "#3a2f12"]
      : person.ovr >= 76 ? ["#dfe3ea", "#9aa3b2", "#252a33"]
      : ["#d9a06b", "#a06b3f", "#33220f"];

    // card body
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, tier[0]);
    grad.addColorStop(1, tier[1]);
    ctx.save();
    roundRect(x, y, w, h, 12, null);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    var dark = tier[2];
    var pad = w * 0.09;

    // OVR + POS top-left
    text(String(Math.round(person.ovr + (opts.affinity || 0))), x + pad + 14, y + pad + 14, Math.round(w * 0.17), dark, "center");
    text(person.pos, x + pad + 14, y + pad + 34, Math.round(w * 0.075), dark, "center");
    if (opts.affinity) {
      text(opts.affinity > 0 ? "▲" : "▼", x + pad + 38, y + pad + 10, Math.round(w * 0.07),
        opts.affinity > 0 ? "#1d7a1d" : "#a02020", "center");
    }
    // flag chip top-right
    if (opts.flag) drawFlag(opts.flag, x + w - pad - 26, y + pad - 2, 26);

    // divider + name
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + h * 0.40); ctx.lineTo(x + w - pad, y + h * 0.40);
    ctx.stroke();
    var nm = person.name.toUpperCase();
    text(nm, x + w / 2, y + h * 0.47, Math.round(w * (nm.length > 14 ? 0.062 : 0.075)), dark, "center");
    text(person.club, x + w / 2, y + h * 0.555, Math.round(w * 0.055), dark, "center");

    // stat row
    var stats = [["PAC", person.pac], ["ATT", person.att], ["DEF", person.def]];
    for (var i = 0; i < 3; i++) {
      var sx = x + w * (0.22 + i * 0.28);
      text(String(stats[i][1]), sx, y + h * 0.66, Math.round(w * 0.085), dark, "center");
      text(stats[i][0], sx, y + h * 0.725, Math.round(w * 0.05), dark, "center");
    }

    // formation affinity line
    var aff = [];
    if (person.likes) aff.push("♥ " + person.likes);
    if (person.hates) aff.push("✗ " + person.hates);
    if (aff.length) text(aff.join("   "), x + w / 2, y + h * 0.80, Math.round(w * 0.052), dark, "center");

    // stamina bar
    var bx = x + pad, bw = w - pad * 2, by = y + h * 0.875;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(bx, by, bw, 7);
    ctx.fillStyle = staminaColor(person.stamina);
    ctx.fillRect(bx, by, bw * (person.stamina / 100), 7);
    text("FITNESS " + Math.round(person.stamina), x + w / 2, by + 16, Math.round(w * 0.048), dark, "center");
    if (person.knock) {
      text(person.knock === 2 ? "INJURED" : "KNOCK", x + w - pad - 20, y + pad + 28, Math.round(w * 0.055), "#a02020", "center");
    }
    ctx.restore();
  }

  return {
    init: init,
    refreshPitch: prerenderPitch,
    ctx: function () { return ctx; },
    drawMatch: drawMatch,
    drawMatchParticlesOnly: drawParticles,
    drawPlayerCard: drawPlayerCard,
    staminaColor: staminaColor,
    addBanner: addBanner,
    shake: shake,
    kickFlecks: kickFlecks,
    confettiBurst: confettiBurst,
    updateFx: updateFx,
    clearFx: clearFx,
    roundRect: roundRect,
    drawFlag: drawFlag,
    text: text,
    FONT: FONT,
  };
})();
