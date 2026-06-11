"use strict";
// Players and ball: state + movement integration. Decisions live in ai.js,
// rules in match.js. No DOM/canvas here so Node can run the sim headless.

(function () {
  var C = WC.CONST, U = WC.U;

  // form = formation slot {role, fx, fy}; person = squad entry or null (arcade)
  WC.makePlayer = function (team, slot, dir, form, person) {
    return {
      team: team,          // 0 = left-attacking-right, 1 = right-attacking-left
      slot: slot,
      form: form,
      role: form.role,
      dir: dir,            // +1 attacks toward the right goal, -1 toward left
      isGK: form.role === "GK",
      person: person || null,
      x: 0, y: 0,
      vx: 0, vy: 0,
      facing: dir > 0 ? 0 : Math.PI,
      speedMult: 1,        // recomputed per frame in manager mode (stamina etc.)
      variant: 1 + Math.floor(Math.random() * 10), // sprite skin/hair
      // transient state
      moveX: 0, moveY: 0,  // desired direction, unit-ish (AI or input writes this)
      sprinting: false,
      tackleCd: 0,
      lungeT: 0,
      kickLock: 0,         // can't touch the ball right after kicking it
      stealImmune: 0,
      celebrateT: 0,
      saveCd: 0,           // GK: one dive roll per shot
    };
  };

  // formation anchor in field coords, shifted by team mentality (manager mode)
  WC.homePos = function (match, p) {
    var F = C.FIELD, f = p.form;
    var fx = f.fx;
    if (!p.isGK && match && match.mentalityShift) fx += match.mentalityShift(p.team);
    fx = U.clamp(fx, 0.02, 0.62);
    var x = p.dir > 0 ? F.left + fx * F.w : F.right - fx * F.w;
    return { x: x, y: F.top + f.fy * F.h };
  };

  WC.makeBall = function () {
    return {
      x: C.FIELD.cx, y: C.FIELD.cy,
      vx: 0, vy: 0,
      owner: null,
      lastTouchTeam: 0,
      spin: 0,             // visual rotation
      shadow: 0,           // 0..1 airtime feel for shots (visual only)
    };
  };

  WC.stepPlayer = function (p, dt) {
    var maxV = (p.isGK ? C.PLAYER.gkSpeed : C.PLAYER.speed) * p.speedMult;
    if (p.sprinting) maxV *= C.PLAYER.sprint;
    if (p.lungeT > 0) maxV *= C.TACKLE.lungeBoost;

    var want = U.norm(p.moveX, p.moveY);
    var tvx = want.x * maxV, tvy = want.y * maxV;
    var ax = tvx - p.vx, ay = tvy - p.vy;
    var al = U.len(ax, ay);
    var maxA = C.PLAYER.accel * dt;
    if (al > maxA && al > 1e-9) { ax = ax / al * maxA; ay = ay / al * maxA; }
    p.vx += ax; p.vy += ay;
    p.x += p.vx * dt; p.y += p.vy * dt;

    if (U.len(p.vx, p.vy) > 20) p.facing = Math.atan2(p.vy, p.vx);

    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.lungeT = Math.max(0, p.lungeT - dt);
    p.kickLock = Math.max(0, p.kickLock - dt);
    p.stealImmune = Math.max(0, p.stealImmune - dt);
    p.celebrateT = Math.max(0, p.celebrateT - dt);
    p.saveCd = Math.max(0, p.saveCd - dt);

    // keep players on the grass (small grace margin outside lines)
    var F = C.FIELD, m = 8;
    p.x = U.clamp(p.x, F.left - m, F.right + m);
    p.y = U.clamp(p.y, F.top - m, F.bottom + m);
  };

  WC.stepBall = function (ball, dt) {
    if (ball.owner) {
      // soft-stick the ball ahead of the carrier
      var p = ball.owner;
      var lead = C.BALL.dribbleLead;
      var tx = p.x + Math.cos(p.facing) * lead;
      var ty = p.y + Math.sin(p.facing) * lead;
      var k = 1 - Math.pow(0.0001, dt); // very strong lerp
      ball.x += (tx - ball.x) * k;
      ball.y += (ty - ball.y) * k;
      ball.vx = p.vx; ball.vy = p.vy;
      ball.spin += U.len(p.vx, p.vy) * dt * 0.05;
    } else {
      var f = U.decay(C.BALL.halfLife, dt);
      ball.vx *= f; ball.vy *= f;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.spin += U.len(ball.vx, ball.vy) * dt * 0.05;
      ball.shadow = Math.max(0, ball.shadow - dt * 1.6);
      if (U.len(ball.vx, ball.vy) < 4) { ball.vx = 0; ball.vy = 0; }
    }
  };

  // separate overlapping players a bit so crowds don't stack
  WC.separatePlayers = function (players, dt) {
    var R = C.PLAYER.r * 1.8;
    var F = C.FIELD;
    for (var i = 0; i < players.length; i++) {
      for (var j = i + 1; j < players.length; j++) {
        var a = players[i], b = players[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = U.len(dx, dy);
        if (d < R && d > 1e-3) {
          var push = (R - d) * 0.5 * Math.min(1, dt * 14);
          dx /= d; dy /= d;
          a.x = U.clamp(a.x - dx * push, F.left - 8, F.right + 8);
          a.y = U.clamp(a.y - dy * push, F.top - 8, F.bottom + 8);
          b.x = U.clamp(b.x + dx * push, F.left - 8, F.right + 8);
          b.y = U.clamp(b.y + dy * push, F.top - 8, F.bottom + 8);
        }
      }
    }
  };
})();
