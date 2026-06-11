"use strict";
// Per-player decision making. Writes p.moveX/moveY/sprinting and calls
// match.doPass / doShoot / tryTackle. Humans bypass this for the controlled
// player; everyone else (both teams) runs through here every frame.
// Manager-mode hooks (mentality, pressing, per-person ratings) come from
// match.* helpers and default to arcade behavior.

(function () {
  var C = WC.CONST, U = WC.U;

  // ---- shared helpers ----------------------------------------------------

  WC.attackGoal = function (p) {
    var F = C.FIELD;
    return { x: p.dir > 0 ? F.right : F.left, y: F.cy };
  };
  WC.ownGoal = function (p) {
    var F = C.FIELD;
    return { x: p.dir > 0 ? F.left : F.right, y: F.cy };
  };

  function seek(p, x, y) {
    p.moveX = x - p.x;
    p.moveY = y - p.y;
    var d = U.len(p.moveX, p.moveY);
    if (d < 6) { p.moveX = 0; p.moveY = 0; } // close enough, settle
  }

  // how clear is the lane from passer to mate?
  function laneOpenness(match, passer, mate) {
    var open = 70;
    for (var i = 0; i < match.players.length; i++) {
      var o = match.players[i];
      if (o.team === passer.team) continue;
      var d = U.segDist(o.x, o.y, passer.x, passer.y, mate.x, mate.y);
      if (d < open) open = d;
    }
    return open;
  }

  // Best teammate to pass to, given a desired direction (may be 0,0).
  WC.choosePassTarget = function (match, passer, wdx, wdy) {
    var want = U.norm(wdx, wdy);
    var hasWant = (want.x !== 0 || want.y !== 0);
    var best = null, bestScore = -1e9;
    for (var i = 0; i < match.players.length; i++) {
      var m = match.players[i];
      if (m.team !== passer.team || m === passer) continue;
      var d = U.dist(passer.x, passer.y, m.x, m.y);
      if (d < 24) continue;
      var dir = U.norm(m.x - passer.x, m.y - passer.y);
      var align = hasWant ? (dir.x * want.x + dir.y * want.y) : 0;
      var fwd = (m.x - passer.x) * passer.dir; // progress toward goal
      var open = laneOpenness(match, passer, m);
      var score = align * 120
        + open * 1.4
        - (open < 18 ? (18 - open) * 7 : 0) // blocked lane, almost never
        + U.clamp(fwd, -60, 90) * 0.5
        - Math.abs(d - 170) * 0.18
        - (m.isGK ? 70 : 0);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  };

  // score of the best available pass, used by AI to decide *whether* to pass
  function bestPassOption(match, p) {
    var best = null, bestScore = -1e9;
    for (var i = 0; i < match.players.length; i++) {
      var m = match.players[i];
      if (m.team !== p.team || m === p || m.isGK) continue;
      var d = U.dist(p.x, p.y, m.x, m.y);
      if (d < 40 || d > 380) continue;
      var goal = WC.attackGoal(p);
      var myGoalDist = U.dist(p.x, p.y, goal.x, goal.y);
      var mateGoalDist = U.dist(m.x, m.y, goal.x, goal.y);
      var open = laneOpenness(match, p, m);
      var score = open * 1.5
        - (open < 18 ? (18 - open) * 7 : 0)
        + U.clamp(myGoalDist - mateGoalDist, -80, 120) * 0.7
        + nearestOppDist(match, m) * 0.8; // mate in space is good
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { mate: best, score: bestScore };
  }

  function nearestOpp(match, p) {
    var best = null, bd = 1e9;
    for (var i = 0; i < match.players.length; i++) {
      var o = match.players[i];
      if (o.team === p.team) continue;
      var d = U.dist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return { p: best, d: bd };
  }
  function nearestOppDist(match, p) { return nearestOpp(match, p).d; }

  // teammates of `team` ranked by distance to a point
  function rankByDist(match, team, x, y, skipGK) {
    var arr = [];
    for (var i = 0; i < match.players.length; i++) {
      var p = match.players[i];
      if (p.team !== team) continue;
      if (skipGK && p.isGK) continue;
      arr.push({ p: p, d: U.dist(p.x, p.y, x, y) });
    }
    arr.sort(function (a, b) { return a.d - b.d; });
    return arr;
  }

  // formation anchor shifted with the ball; defenders stay goal-side
  function shiftedHome(match, p) {
    var F = C.FIELD, b = match.ball;
    var h = WC.homePos(match, p);
    var pull = p.role === "DF" ? 0.30 : p.role === "MF" ? 0.36 : 0.42;
    var x = h.x + (b.x - F.cx) * pull;
    var y = h.y + (b.y - F.cy) * 0.28;
    // defenders never push past the center line area
    if (p.role === "DF") {
      if (p.dir > 0) x = Math.min(x, F.cx + 40); else x = Math.max(x, F.cx - 40);
    }
    return { x: U.clamp(x, F.left + 14, F.right - 14), y: U.clamp(y, F.top + 12, F.bottom - 12) };
  }

  // ---- main entry --------------------------------------------------------

  WC.aiUpdate = function (match, p, dt) {
    p.sprinting = false;
    var b = match.ball;

    if (p.isGK) return gkLogic(match, p, dt);
    if (b.owner === p) return carrierLogic(match, p, dt);
    if (b.owner && b.owner.team === p.team) return supportLogic(match, p, dt);
    if (b.owner) return defendLogic(match, p, dt);
    return looseBallLogic(match, p, dt);
  };

  // ---- behaviors ---------------------------------------------------------

  function carrierLogic(match, p, dt) {
    var goal = WC.attackGoal(p);
    var F = C.FIELD;
    var dGoal = U.dist(p.x, p.y, goal.x, goal.y);
    var opp = nearestOpp(match, p);
    var pressured = opp.d < 58;
    var attMult = match.attOf(p);
    var urge = match.urgeAtt(p.team); // mentality: shoot more when attacking

    // shoot?
    var angleOk = Math.abs(p.y - F.cy) < C.GOAL.halfMouth + 95 || dGoal < 130;
    if (dGoal < 270 && angleOk) {
      var shootUrge = (1 - dGoal / 300) * 2.6 * attMult * urge;
      if (pressured) shootUrge *= 1.8;
      if (dGoal < 120) shootUrge += 2.5;
      if (U.chance(shootUrge * dt)) { match.doShoot(p, 0); return; }
    }

    // pass?
    var passUrge = pressured ? 1.9 : 0.25;
    if (Math.abs(p.y - F.cy) > F.h * 0.36 && dGoal < 260) passUrge += 1.4; // bad angle, cross it
    if (U.chance(passUrge * dt)) {
      var opt = bestPassOption(match, p);
      if (opt.mate && (pressured || opt.score > 40)) { match.doPass(p, opt.mate); return; }
    }

    // dribble toward goal, swerving around the nearest opponent
    var tx = goal.x - p.dir * 30;
    var ty = U.lerp(p.y, goal.y, 0.35);
    var dirToT = U.norm(tx - p.x, ty - p.y);
    if (opp.p && opp.d < 80) {
      var toOpp = U.norm(opp.p.x - p.x, opp.p.y - p.y);
      var ahead = dirToT.x * toOpp.x + dirToT.y * toOpp.y;
      if (ahead > 0.25) {
        // steer perpendicular, side chosen consistently per player
        var side = (p.slot % 2 === 0) ? 1 : -1;
        if (p.y < F.top + 70) side = 1; else if (p.y > F.bottom - 70) side = -1;
        dirToT = U.norm(dirToT.x - toOpp.y * side * 1.2, dirToT.y + toOpp.x * side * 1.2);
      }
    }
    p.moveX = dirToT.x; p.moveY = dirToT.y;
    p.sprinting = opp.d > 70 && dGoal > 180;
  }

  function supportLogic(match, p, dt) {
    var carrier = match.ball.owner;
    var F = C.FIELD;
    var h = shiftedHome(match, p);
    var tx = h.x, ty = h.y;
    if (p.role === "FW") {
      // push ahead of the ball into a lane
      tx = U.clamp(carrier.x + p.dir * 110, F.left + 24, F.right - 24);
      var laneY = WC.homePos(match, p).y;
      ty = U.lerp(laneY, match.ball.y, 0.25);
      // don't crowd the carrier
      if (U.dist(tx, ty, carrier.x, carrier.y) < 80) ty += (p.y > carrier.y ? 60 : -60);
    } else if (p.role === "MF") {
      // offer a link option just behind/level with the ball
      tx = U.clamp(carrier.x + p.dir * 30, F.left + 20, F.right - 20);
      ty = U.lerp(WC.homePos(match, p).y, match.ball.y, 0.35);
      if (U.dist(tx, ty, carrier.x, carrier.y) < 70) tx -= p.dir * 60;
    }
    // drift away from tight marking to get open
    var opp = nearestOpp(match, p);
    if (opp.p && opp.d < 42) {
      var away = U.norm(p.x - opp.p.x, p.y - opp.p.y);
      tx += away.x * 50; ty += away.y * 50;
    }
    seek(p, U.clamp(tx, F.left + 14, F.right - 14), U.clamp(ty, F.top + 12, F.bottom - 12));
    p.sprinting = p.role === "FW" && (carrier.x - F.cx) * p.dir > 0;
  }

  function defendLogic(match, p, dt) {
    var carrier = match.ball.owner;
    var rank = rankByDist(match, p.team, carrier.x, carrier.y, true);
    var myRank = 0;
    for (var i = 0; i < rank.length; i++) if (rank[i].p === p) { myRank = i; break; }
    var own = WC.ownGoal(p);
    var pressN = match.pressCount(p.team);

    if (myRank < pressN) {
      // press the carrier
      seek(p, carrier.x + carrier.vx * 0.12, carrier.y + carrier.vy * 0.12);
      p.sprinting = U.dist(p.x, p.y, carrier.x, carrier.y) > 60;
      match.tryTackle(p, match.defOf(p));
    } else if (myRank === pressN) {
      // cover goal-side between carrier and our goal
      var d = U.norm(own.x - carrier.x, own.y - carrier.y);
      seek(p, carrier.x + d.x * 70, carrier.y + d.y * 70);
      p.sprinting = (carrier.x - p.x) * p.dir < -40; // they're behind us, recover!
      match.tryTackle(p, match.defOf(p));
    } else {
      var h = shiftedHome(match, p);
      var tx = h.x, ty = h.y;
      // defenders loosely track the nearest opposing forward
      if (p.role === "DF") {
        var mark = null, md = 120;
        for (i = 0; i < match.players.length; i++) {
          var o = match.players[i];
          if (o.team === p.team || o.isGK || o.role === "DF") continue;
          var dd = U.dist(p.x, p.y, o.x, o.y);
          if (dd < md) { md = dd; mark = o; }
        }
        if (mark) { tx = (tx + mark.x) / 2; ty = (ty + mark.y) / 2; }
      }
      seek(p, tx, ty);
    }
  }

  function looseBallLogic(match, p, dt) {
    var b = match.ball;
    var px = b.x + b.vx * 0.22, py = b.y + b.vy * 0.22;
    var rank = rankByDist(match, p.team, px, py, true);
    var myRank = rank.findIndex(function (r) { return r.p === p; });
    if (myRank <= 1) {
      seek(p, px, py);
      p.sprinting = U.dist(p.x, p.y, px, py) > 70;
      match.tryTackle(p, 1); // also handles 50/50 lunges near a rolling ball
    } else {
      var h = shiftedHome(match, p);
      seek(p, h.x, h.y);
    }
  }

  function gkLogic(match, p, dt) {
    var F = C.FIELD, b = match.ball;
    var lineX = p.dir > 0 ? F.left + 13 : F.right - 13;
    var boxEdge = p.dir > 0 ? F.left + C.BOX.penW : F.right - C.BOX.penW;
    var inMyBox = (p.dir > 0 ? b.x < boxEdge : b.x > boxEdge) &&
      Math.abs(b.y - F.cy) < C.BOX.penHalfH;

    if (b.owner === p) {
      // distribute: hold briefly, then play it out
      seek(p, lineX + p.dir * 26, F.cy);
      if (p.gkHoldT === undefined) p.gkHoldT = 0;
      p.gkHoldT += dt;
      if (p.gkHoldT > 0.65) {
        p.gkHoldT = 0;
        var opt = bestPassOption(match, p);
        var mate = opt.mate || WC.choosePassTarget(match, p, p.dir, 0);
        if (mate) match.doPass(p, mate);
        else match.doShoot(p, 0); // boot it clear
      }
      return;
    }
    p.gkHoldT = 0;

    var ballComing = (b.vx * p.dir) < -120; // moving toward my goal
    if (!b.owner && inMyBox && (U.len(b.vx, b.vy) < 240 || ballComing)) {
      // claim or block it
      seek(p, b.x + b.vx * 0.1, b.y + b.vy * 0.1);
      p.sprinting = true;
      return;
    }
    // hold the line, tracking the ball
    var ty = U.clamp(b.y + b.vy * 0.08, F.cy - C.GOAL.halfMouth + 8, F.cy + C.GOAL.halfMouth - 8);
    seek(p, lineX, ty);
  }

  // ---- restart helpers (AI taker behavior handled in match.js) -----------

  WC.aiRestartKick = function (match, taker) {
    var kind = match.restart ? match.restart.kind : "kickoff";
    if (kind === "corner") {
      // aim for a forward arriving in the box
      var goal = WC.attackGoal(taker);
      var best = null, bd = 1e9;
      for (var i = 0; i < match.players.length; i++) {
        var m = match.players[i];
        if (m.team !== taker.team || m === taker || m.isGK) continue;
        var d = U.dist(m.x, m.y, goal.x, goal.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) { match.doPass(taker, best); return; }
    }
    var opt = bestPassOption(match, taker);
    var mate = opt.mate || WC.choosePassTarget(match, taker, taker.dir, 0);
    if (mate) match.doPass(taker, mate);
    else match.doShoot(taker, 0);
  };
})();
