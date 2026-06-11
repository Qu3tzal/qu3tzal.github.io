"use strict";
// Menu screens + game flow state machine. main.js calls WC.Screens.update/draw.

WC.Screens = (function () {
  var C = WC.CONST, U = WC.U, R, A;

  var G = {
    screen: "title",
    demo: null,           // background AI match on the title screen
    mode: "cup",
    playerTeam: null,
    oppTeam: null,
    match: null,
    paused: false,
    fullTimeT: 0,
    cup: null,            // {teams:[8], rounds:[[pair..]], round, alive}
    titleSel: 0,
    selGrid: 0,           // cursor index in team select
    selPhase: 0,          // friendly: 0 = your team, 1 = opponent
    resultT: 0,
  };

  function goto(screen) {
    G.screen = screen;
    WC.Input.clearEdges();
    R.clearFx();
    G.resultT = 0;
  }

  // ---- cup logic -----------------------------------------------------------

  function newCup(playerTeam) {
    var pool = WC.TEAMS.filter(function (t) { return t !== playerTeam; });
    // shuffle, take 7
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var teams = [playerTeam].concat(pool.slice(0, 7));
    // scatter the player into a random QF slot
    var slot = Math.floor(Math.random() * 8);
    var tmp2 = teams[0]; teams[0] = teams[slot]; teams[slot] = tmp2;

    var qf = [];
    for (i = 0; i < 4; i++) qf.push({ a: teams[i * 2], b: teams[i * 2 + 1], sa: null, sb: null, winner: null });
    return { teams: teams, rounds: [qf, [], []], round: 0, alive: true, champion: null };
  }

  function playerPair(cup) {
    var r = cup.rounds[cup.round];
    for (var i = 0; i < r.length; i++) {
      if (r[i].a === G.playerTeam || r[i].b === G.playerTeam) return r[i];
    }
    return null;
  }

  // sim every unplayed AI match of the current round, then build the next
  function resolveRound(cup) {
    var r = cup.rounds[cup.round];
    r.forEach(function (m) {
      if (m.winner) return;
      var res = WC.simulateResult(m.a, m.b);
      m.sa = res.a; m.sb = res.b;
      m.winner = res.a > res.b ? m.a : m.b;
    });
    if (cup.round === 2) {
      cup.champion = r[0].winner;
      return;
    }
    var next = [];
    for (var i = 0; i < r.length; i += 2) {
      next.push({ a: r[i].winner, b: r[i + 1].winner, sa: null, sb: null, winner: null });
    }
    cup.rounds[cup.round + 1] = next;
    cup.round++;
  }

  var ROUND_NAMES = ["QUARTER-FINAL", "SEMI-FINAL", "FINAL"];

  // ---- match wiring ----------------------------------------------------------

  function startMatch(teamA, teamB, mode) {
    G.match = new WC.Match(teamA, teamB, { mode: mode, humanTeam: 0 });
    G.paused = false;
    G.fullTimeT = 0;
    goto("match");
    R.addBanner(mode === "cup" ? ROUND_NAMES[G.cup.round] : "FRIENDLY",
      teamA.name + "  vs  " + teamB.name, "#ffd75e", 2.4);
  }

  function processEvents(match) {
    for (var i = 0; i < match.events.length; i++) {
      var e = match.events[i];
      switch (e.type) {
        case "kick":
          A.kick(e.data.power || 0.5);
          R.kickFlecks(match.ball.x, match.ball.y, 4);
          break;
        case "whistle": A.whistle(); break;
        case "goal": {
          var t = match.teams[e.data.team];
          A.goal();
          R.shake(8);
          R.addBanner("GOAL!", t.name + "  " + match.score[0] + " - " + match.score[1] + "  ", match.kits[e.data.team], 2.2);
          R.confettiBurst([match.kits[e.data.team], "#ffffff", "#ffd75e"], 50);
          break;
        }
        case "save": A.save(); break;
        case "block": A.block(); break;
        case "tackle": A.tackle(); R.kickFlecks(match.ball.x, match.ball.y, 6); break;
        case "post": A.post(); R.shake(4); break;
        case "ooh": A.ooh(); break;
        case "out": A.ui(); break;
        case "halftime": A.whistleEnd(); R.addBanner("HALF-TIME", "", "#9fb0d0", 2.2); break;
        case "golden": A.uiBig(); R.addBanner("GOLDEN GOAL", "next goal wins it all", "#ffd75e", 2.6); break;
        case "fulltime": {
          A.whistleEnd();
          var s = match.score;
          var msg = s[0] === s[1] ? "DRAW" : (match.winner === 0 ? match.teams[0].name + " WIN!" : match.teams[1].name + " WIN!");
          R.addBanner("FULL-TIME", msg + "   " + s[0] + " - " + s[1], "#ffd75e", 3);
          break;
        }
        case "sub": {
          var sd = e.data;
          A.ui();
          R.addBanner("SUBSTITUTION", (sd.out ? sd.out.name + "  ▶  " : "") + sd.inP.name +
            "  (" + match.teams[sd.team].id + ")", "#9fb0d0", 1.6);
          break;
        }
        case "knock": {
          var kd = e.data;
          A.tackle();
          if (kd.team === match.managed) {
            match.speedMult = 1; // drop out of fast-forward for the decision
            R.addBanner("KNOCK!", kd.person.name + " is hurt - TAB to manage, or gamble on him", "#ffaa33", 2.8);
          } else {
            R.addBanner("KNOCK", kd.person.name + " (" + match.teams[kd.team].id + ") is limping", "#9fb0d0", 1.4);
          }
          break;
        }
        case "knockWorse": {
          var kw = e.data;
          A.ooh();
          if (kw.team === match.managed) {
            R.addBanner("HE CAN'T RUN IT OFF", kw.person.name + " is now badly hampered", "#ff6b57", 2.6);
          }
          break;
        }
        case "rally": {
          A.uiBig();
          A.ooh();
          R.addBanner("RALLY!", match.teams[e.data.team].name + " push forward", match.kits[e.data.team], 1.6);
          break;
        }
        case "switch": break;
        case "intercept": break;
      }
    }
    match.events.length = 0;
  }

  // ---- screen: title ---------------------------------------------------------

  var TITLE_ITEMS = ["WORLD CUP", "MANAGER CUP", "FRIENDLY MATCH"];

  function updateTitle(dt) {
    if (!G.demo || G.demo.over) {
      var a = U.pick(WC.TEAMS), b = a;
      while (b === a) b = U.pick(WC.TEAMS);
      G.demo = new WC.Match(a, b, { mode: "friendly", humanTeam: null });
    }
    G.demo.update(dt, null);
    G.demo.events.length = 0;

    var m = WC.Input.menu();
    if (m.up) { G.titleSel = (G.titleSel + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length; A.ui(); }
    if (m.down) { G.titleSel = (G.titleSel + 1) % TITLE_ITEMS.length; A.ui(); }
    if (m.confirm) {
      A.uiBig();
      G.mode = G.titleSel === 0 ? "cup" : G.titleSel === 1 ? "manager" : "friendly";
      G.selPhase = 0;
      G.selGrid = WC.TEAMS.indexOf(G.playerTeam) >= 0 ? WC.TEAMS.indexOf(G.playerTeam) : 0;
      goto("select");
    }
  }

  function drawTitle() {
    R.drawMatch(G.demo, { dim: true, hud: false });
    var cx = C.W / 2;

    R.text("★ 2026 ★", cx, 118, 20, "#7fd3ff");
    R.text("WORLD CUP 26", cx + 3, 173, 64, "#1a2238");
    R.text("WORLD CUP 26", cx, 170, 64, "#ffd75e");
    R.text("ARCADE FOOTBALL  •  USA - MEXICO - CANADA", cx, 218, 14, "#c8d4ee");

    for (var i = 0; i < TITLE_ITEMS.length; i++) {
      var y = 330 + i * 56;
      var sel = i === G.titleSel;
      R.roundRect(cx - 160, y - 22, 320, 44, 10, sel ? "rgba(255,215,94,0.92)" : "rgba(13,17,28,0.8)");
      R.text(TITLE_ITEMS[i], cx, y + 1, 20, sel ? "#1a2238" : "#dfe7f7");
      if (sel) {
        R.text("▶", cx - 140, y + 1, 16, "#1a2238");
      }
    }

    R.text("ARROWS / WASD move • ENTER select • M mute", cx, 552, 13, "#8fa0c0");
    R.text("Kenney sprites • CC0", cx, 576, 11, "#5a6680");
  }

  // ---- screen: team select -----------------------------------------------------

  var GRID_COLS = 4;

  function updateSelect(dt) {
    var m = WC.Input.menu();
    var n = WC.TEAMS.length;
    if (m.left) { G.selGrid = (G.selGrid + n - 1) % n; A.ui(); }
    if (m.right) { G.selGrid = (G.selGrid + 1) % n; A.ui(); }
    if (m.up) { G.selGrid = (G.selGrid + n - GRID_COLS) % n; A.ui(); }
    if (m.down) { G.selGrid = (G.selGrid + GRID_COLS) % n; A.ui(); }
    if (m.back) { A.ui(); goto("title"); return; }
    if (m.confirm) {
      var team = WC.TEAMS[G.selGrid];
      A.uiBig();
      if (G.mode === "friendly" && G.selPhase === 0) {
        G.playerTeam = team;
        G.selPhase = 1;
        if (WC.TEAMS[G.selGrid] === G.playerTeam) G.selGrid = (G.selGrid + 1) % n;
        return;
      }
      if (G.mode === "friendly") {
        if (team === G.playerTeam) { A.ui(); return; } // can't play yourself
        G.oppTeam = team;
        startMatch(G.playerTeam, G.oppTeam, "friendly");
        return;
      }
      // cup / manager cup
      G.playerTeam = team;
      G.cup = newCup(team);
      if (G.mode === "manager") G.career = newCareer(team);
      goto("bracket");
    }
  }

  function drawSelect() {
    var ctx = R.ctx();
    ctx.fillStyle = "#141a2b";
    ctx.fillRect(0, 0, C.W, C.H);
    var cx = C.W / 2;

    var heading = G.mode === "cup" ? "CHOOSE YOUR NATION"
      : (G.selPhase === 0 ? "CHOOSE YOUR NATION" : "CHOOSE YOUR OPPONENT");
    R.text(heading, cx, 48, 30, "#ffd75e");
    if (G.mode === "friendly" && G.selPhase === 1) {
      R.text("playing as " + G.playerTeam.name, cx, 80, 14, "#8fd3a0");
    }

    var cellW = 150, cellH = 86, gapX = 24, gapY = 18;
    var gridW = GRID_COLS * cellW + (GRID_COLS - 1) * gapX;
    var x0 = cx - gridW / 2, y0 = 110;

    for (var i = 0; i < WC.TEAMS.length; i++) {
      var t = WC.TEAMS[i];
      var col = i % GRID_COLS, row = Math.floor(i / GRID_COLS);
      var x = x0 + col * (cellW + gapX), y = y0 + row * (cellH + gapY);
      var sel = i === G.selGrid;
      var isTaken = G.mode === "friendly" && G.selPhase === 1 && t === G.playerTeam;

      R.roundRect(x, y, cellW, cellH, 10,
        sel ? "rgba(255,215,94,0.95)" : (isTaken ? "rgba(40,46,66,0.5)" : "rgba(28,34,54,0.95)"));
      R.drawFlag(t.flag, x + 10, y + 10, 36);
      R.text(t.id, x + 58, y + 28, 19, sel ? "#1a2238" : "#ffffff", "left");

      // rating bars
      var stats = [t.att, t.def, t.spd];
      for (var s = 0; s < 3; s++) {
        var bx = x + 10, by = y + 56 + s * 9, bw = cellW - 20;
        ctx.fillStyle = sel ? "rgba(26,34,56,0.25)" : "rgba(255,255,255,0.12)";
        ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = ["#ff7058", "#58a8ff", "#7ee07e"][s];
        ctx.fillRect(bx, by, bw * ((stats[s] - 55) / 45), 5);
      }
    }

    var cur = WC.TEAMS[G.selGrid];
    R.text(cur.name.toUpperCase(), cx, 548, 22, "#ffffff");
    R.text("ATT " + cur.att + "   DEF " + cur.def + "   SPD " + cur.spd + "      ENTER confirm • ESC back", cx, 576, 13, "#8fa0c0");
  }

  // ---- screen: bracket -----------------------------------------------------------

  function updateBracket(dt) {
    var m = WC.Input.menu();
    var cup = G.cup;

    if (!cup.alive || cup.champion) {
      if (m.confirm || m.back) {
        A.uiBig();
        if (cup.champion === G.playerTeam) goto("champion");
        else goto("title");
      }
      return;
    }
    if (m.confirm) {
      if (G.mode === "manager") { A.uiBig(); goto("squad"); return; }
      var pair = playerPair(cup);
      var opp = pair.a === G.playerTeam ? pair.b : pair.a;
      startMatch(G.playerTeam, opp, "cup");
    }
    if (m.back) { A.ui(); goto("title"); }
  }

  function drawBracket() {
    var ctx = R.ctx();
    ctx.fillStyle = "#141a2b";
    ctx.fillRect(0, 0, C.W, C.H);
    var cup = G.cup;

    R.text("ROAD TO THE FINAL", C.W / 2, 44, 28, "#ffd75e");

    var colX = [70, 390, 660];
    var colW = 220;
    var names = ["QUARTER-FINALS", "SEMI-FINALS", "FINAL"];

    for (var r = 0; r < 3; r++) {
      R.text(names[r], colX[r] + colW / 2, 92, 14, "#8fa0c0");
      var pairs = cup.rounds[r];
      var slots = r === 0 ? 4 : r === 1 ? 2 : 1;
      for (var i = 0; i < slots; i++) {
        var areaH = 440 / slots;
        var y = 116 + i * areaH + areaH / 2 - 34;
        var pr = pairs[i];
        drawPairCell(colX[r], y, colW, pr, r === cup.round && pr && !pr.winner);
      }
    }

    // champion chip
    if (cup.champion) {
      R.text("★ CHAMPIONS ★", 870, 270, 13, "#ffd75e");
      R.drawFlag(cup.champion.flag, 850, 285, 40);
      R.text(cup.champion.id, 870, 345, 18, "#ffffff");
    }

    var msg;
    if (cup.champion === G.playerTeam) msg = "YOU ARE WORLD CHAMPIONS!  ENTER continue";
    else if (cup.champion) msg = "Eliminated... " + cup.champion.name + " lift the trophy.  ENTER back to title";
    else if (!cup.alive) msg = "ENTER continue";
    else if (G.mode === "manager") msg = ROUND_NAMES[cup.round] + ":  ENTER prepare your squad  •  ESC quit";
    else msg = ROUND_NAMES[cup.round] + ":  ENTER play your match  •  ESC quit";
    R.text(msg, C.W / 2, 576, 14, "#c8d4ee");
  }

  function drawPairCell(x, y, w, pr, isNext) {
    var ctx = R.ctx();
    R.roundRect(x, y, w, 68, 8, "rgba(28,34,54,0.95)");
    if (!pr) return;
    var rows = [
      { t: pr.a, s: pr.sa },
      { t: pr.b, s: pr.sb },
    ];
    for (var k = 0; k < 2; k++) {
      var t = rows[k].t;
      var yy = y + 8 + k * 30;
      if (!t) continue;
      var mine = t === G.playerTeam;
      if (mine) R.roundRect(x + 4, yy - 3, w - 8, 28, 5, "rgba(255,215,94,0.18)");
      R.drawFlag(t.flag, x + 10, yy, 24);
      R.text(t.id, x + 44, yy + 12, 15, pr.winner === t ? "#ffd75e" : (mine ? "#ffe9a8" : "#dfe7f7"), "left");
      if (rows[k].s !== null) {
        R.text(String(rows[k].s), x + w - 18, yy + 12, 16, pr.winner === t ? "#ffd75e" : "#9fb0d0");
      }
    }
    if (isNext && (pr.a === G.playerTeam || pr.b === G.playerTeam)) {
      ctx.strokeStyle = "#ffd75e";
      ctx.lineWidth = 2;
      R.roundRect(x, y, w, 68, 8, null);
      ctx.stroke();
    }
  }

  // ---- screen: match ----------------------------------------------------------

  function updateMatch(dt) {
    var match = G.match;

    if (WC.Input.pausePressed() && !match.over) { G.paused = !G.paused; A.ui(); }
    if (G.paused) {
      var m = WC.Input.menu();
      if (m.confirm) { G.paused = false; A.ui(); }
      var inp = WC.Input.matchInput();
      if (inp.shootDown) { // X quits from pause
        A.ui();
        if (G.mode === "cup") forfeitMatch();
        G.match = null;
        goto(G.mode === "cup" ? "bracket" : "title");
      }
      return;
    }

    var input = WC.Input.matchInput();
    match.update(dt, input);
    processEvents(match);

    if (match.over) {
      G.fullTimeT += dt;
      var mm = WC.Input.menu();
      if (G.fullTimeT > 2.8 || mm.confirm) {
        finishMatch();
      }
    }
  }

  function forfeitMatch() {
    // quitting a cup match counts as a loss
    var pair = playerPair(G.cup);
    if (pair) {
      pair.sa = pair.a === G.playerTeam ? 0 : 3;
      pair.sb = pair.b === G.playerTeam ? 0 : 3;
      pair.winner = pair.a === G.playerTeam ? pair.b : pair.a;
      G.cup.alive = false;
      resolveRoundsToEnd();
    }
  }

  function resolveRoundsToEnd() {
    while (!G.cup.champion) resolveRound(G.cup);
  }

  function finishMatch() {
    var match = G.match;
    if (G.mode === "friendly") {
      goto("title");
      G.match = null;
      return;
    }
    var cup = G.cup;
    var pair = playerPair(cup);
    var iAmA = pair.a === G.playerTeam;
    pair.sa = iAmA ? match.score[0] : match.score[1];
    pair.sb = iAmA ? match.score[1] : match.score[0];
    pair.winner = match.winner === 0 ? G.playerTeam : (iAmA ? pair.b : pair.a);

    if (pair.winner !== G.playerTeam) {
      cup.alive = false;
      resolveRoundsToEnd();
    } else {
      resolveRound(cup);
    }
    G.match = null;
    goto("bracket");
  }

  function drawMatchScreen() {
    R.drawMatch(G.match, { hud: true });
    if (G.paused) {
      var ctx = R.ctx();
      ctx.fillStyle = "rgba(10,13,24,0.7)";
      ctx.fillRect(0, 0, C.W, C.H);
      R.text("PAUSED", C.W / 2, C.H / 2 - 20, 42, "#ffffff");
      R.text("ENTER resume  •  X quit match", C.W / 2, C.H / 2 + 30, 15, "#9fb0d0");
    }
    if (G.match.over) {
      R.text("ENTER continue", C.W / 2, C.H - 50, 14, "#ffd75e");
    }
  }

  // ---- screen: champion ---------------------------------------------------------

  var champT = 0;
  function updateChampion(dt) {
    champT += dt;
    if (Math.random() < dt * 2) {
      R.confettiBurst([G.playerTeam.kit, "#ffd75e", "#ffffff", G.playerTeam.alt], 30);
    }
    R.updateFx(dt);
    var m = WC.Input.menu();
    if (m.confirm || m.back) { A.uiBig(); goto("title"); }
  }

  function drawChampion() {
    var ctx = R.ctx();
    var cx = C.W / 2;
    var grad = ctx.createLinearGradient(0, 0, 0, C.H);
    grad.addColorStop(0, "#1a2342");
    grad.addColorStop(1, "#0d1120");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, C.W, C.H);

    drawTrophy(cx, 340, 1 + Math.sin(champT * 2) * 0.02);

    R.text("WORLD CHAMPIONS", cx, 90, 44, "#ffd75e");
    R.drawFlag(G.playerTeam.flag, cx - 30, 120, 60);
    R.text(G.playerTeam.name.toUpperCase(), cx, 215, 26, "#ffffff");
    R.text("WORLD CUP 26", cx, 500, 16, "#c8d4ee");
    R.text("ENTER back to title", cx, 560, 13, "#8fa0c0");

    // draw confetti on top
    ctx.save();
    drawParticlesPublic();
    ctx.restore();
  }

  function drawParticlesPublic() {
    // champion screen renders fx outside drawMatch; reuse render's particle pass
    R.drawMatchParticlesOnly();
  }

  function drawTrophy(cx, cy, scale) {
    var ctx = R.ctx();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    var gold = "#ffd75e", dark = "#c9a430";

    // bowl
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-55, -60);
    ctx.bezierCurveTo(-55, 10, -20, 35, 0, 35);
    ctx.bezierCurveTo(20, 35, 55, 10, 55, -60);
    ctx.closePath();
    ctx.fill();
    // handles
    ctx.strokeStyle = gold;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(-62, -38, 22, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(62, -38, 22, Math.PI * 1.5, Math.PI * 0.5); ctx.stroke();
    // stem + base
    ctx.fillStyle = dark;
    ctx.fillRect(-9, 35, 18, 30);
    ctx.fillStyle = gold;
    ctx.fillRect(-35, 65, 70, 14);
    ctx.fillStyle = dark;
    ctx.fillRect(-42, 79, 84, 12);
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(-38, -52, 9, 60);
    ctx.restore();
  }

  // ====================== MANAGER MODE ======================

  var FORM_NAMES = ["4-4-2", "4-3-3", "5-3-2"];
  var MENTALITIES = ["defensive", "balanced", "attacking"];
  var PRESSINGS = ["low", "normal", "high"];

  function newCareer(team) {
    var squad = WC.buildSquad(team.id);
    var formationName = "4-3-3";
    var xi = WC.pickXI(squad, WC.FORMATIONS_11[formationName], formationName);
    return {
      squad: squad,
      formationName: formationName,
      tactics: { mentality: "balanced", pressing: "normal" },
      xi: xi,
    };
  }

  function syncOnField(career) {
    career.squad.forEach(function (q) { q.onField = false; });
    career.xi.forEach(function (q) { if (q) q.onField = true; });
  }

  function benchOf(career) {
    return career.squad.filter(function (q) { return career.xi.indexOf(q) < 0; });
  }

  // ---- screen: squad (lineup + tactics prep) -------------------------------

  var SQ = { zone: "xi", idx: 0, swapFrom: -1, toast: "", toastT: 0 };
  var SQ_ZONES = ["xi", "settings", "start", "bench"];

  function sqToast(msg) { SQ.toast = msg; SQ.toastT = 2.2; }

  function updateSquad(dt) {
    SQ.toastT = Math.max(0, SQ.toastT - dt);
    var m = WC.Input.menu();
    var career = G.career;
    var zoneItems = { xi: 11, settings: 3, start: 1, bench: benchOf(career).length };

    if (m.up || m.down) {
      var zi = SQ_ZONES.indexOf(SQ.zone);
      zi = (zi + (m.down ? 1 : SQ_ZONES.length - 1)) % SQ_ZONES.length;
      SQ.zone = SQ_ZONES[zi];
      SQ.idx = 0;
      A.ui();
    }
    if (m.left || m.right) {
      var n = zoneItems[SQ.zone];
      if (SQ.zone === "settings") {
        cycleSetting(SQ.idx, m.right ? 1 : -1);
      } else if (n > 0) {
        SQ.idx = (SQ.idx + (m.right ? 1 : n - 1)) % n;
        A.ui();
      }
    }
    if (SQ.zone === "settings" && (m.up || m.down)) SQ.idx = 0;

    if (m.back) {
      if (SQ.swapFrom >= 0) { SQ.swapFrom = -1; A.ui(); return; }
      goto("bracket");
      return;
    }
    if (!m.confirm) return;

    if (SQ.zone === "start") { startManagerMatch(); return; }
    if (SQ.zone === "settings") { cycleSetting(SQ.idx, 1); return; }

    if (SQ.zone === "xi") {
      if (SQ.swapFrom >= 0) {
        // swap two XI slots (re-position players)
        var a = career.xi[SQ.swapFrom], b = career.xi[SQ.idx];
        if (formSlot(SQ.idx).role === "GK" && a.role !== "GK") { sqToast("Only a goalkeeper can play in goal"); return; }
        if (formSlot(SQ.swapFrom).role === "GK" && b.role !== "GK") { sqToast("Only a goalkeeper can play in goal"); return; }
        career.xi[SQ.swapFrom] = b; career.xi[SQ.idx] = a;
        SQ.swapFrom = -1;
        A.uiBig();
      } else {
        SQ.swapFrom = SQ.idx;
        A.ui();
      }
      return;
    }
    if (SQ.zone === "bench") {
      var bench = benchOf(career);
      var pIn = bench[SQ.idx];
      if (!pIn) return;
      if (SQ.swapFrom >= 0) {
        if (formSlot(SQ.swapFrom).role === "GK" && pIn.role !== "GK") { sqToast("Only a goalkeeper can play in goal"); return; }
        if (pIn.knock === 2) { sqToast(pIn.name + " is injured"); return; }
        career.xi[SQ.swapFrom] = pIn;
        syncOnField(career);
        SQ.swapFrom = -1;
        A.uiBig();
      } else {
        sqToast("Pick the XI slot to replace first (select a pitch player)");
      }
    }
  }

  function formSlot(i) { return WC.FORMATIONS_11[G.career.formationName][i]; }

  function cycleSetting(idx, dir) {
    var career = G.career;
    A.ui();
    if (idx === 0) {
      var fi = (FORM_NAMES.indexOf(career.formationName) + dir + FORM_NAMES.length) % FORM_NAMES.length;
      career.formationName = FORM_NAMES[fi];
      career.xi = WC.pickXI(career.squad, WC.FORMATIONS_11[career.formationName], career.formationName);
      syncOnField(career);
      sqToast("Best XI re-picked for " + career.formationName);
    } else if (idx === 1) {
      var mi = (MENTALITIES.indexOf(career.tactics.mentality) + dir + 3) % 3;
      career.tactics.mentality = MENTALITIES[mi];
    } else {
      var pi = (PRESSINGS.indexOf(career.tactics.pressing) + dir + 3) % 3;
      career.tactics.pressing = PRESSINGS[pi];
    }
  }

  function selectedPerson() {
    if (SQ.zone === "xi") return G.career.xi[SQ.idx];
    if (SQ.zone === "bench") return benchOf(G.career)[SQ.idx];
    return G.career.xi[0];
  }

  function drawSquad() {
    var ctx = R.ctx();
    var career = G.career;
    ctx.fillStyle = "#141a2b";
    ctx.fillRect(0, 0, C.W, C.H);

    var pair = playerPair(G.cup);
    var opp = pair ? (pair.a === G.playerTeam ? pair.b : pair.a) : null;
    R.drawFlag(G.playerTeam.flag, 30, 14, 34);
    R.text(G.playerTeam.name.toUpperCase() + "  —  " + ROUND_NAMES[G.cup.round] +
      (opp ? "  vs " + opp.name : ""), 76, 32, 21, "#ffd75e", "left");

    // mini pitch
    var px = 30, py = 70, pw = 545, ph = 330;
    ctx.fillStyle = "#3a8d52";
    R.roundRect(px, py, pw, ph, 8, "#3a8d52");
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 8, py + 8, pw - 16, ph - 16);
    ctx.beginPath(); ctx.moveTo(px + pw / 2, py + 8); ctx.lineTo(px + pw / 2, py + ph - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(px + 8, py + ph / 2 - 70, 56, 140);
    ctx.strokeRect(px + pw - 64, py + ph / 2 - 70, 56, 140);

    // XI chips at formation spots
    var form = WC.FORMATIONS_11[career.formationName];
    for (var i = 0; i < 11; i++) {
      var slot = form[i];
      var q = career.xi[i];
      var cxp = px + 30 + (slot.fx / 0.5) * (pw - 130);
      var cyp = py + 24 + slot.fy * (ph - 60);
      drawChip(cxp, cyp, q, slot,
        SQ.zone === "xi" && SQ.idx === i,
        SQ.swapFrom === i);
    }

    // settings row
    var settings = [
      ["FORMATION", career.formationName],
      ["MENTALITY", career.tactics.mentality.toUpperCase()],
      ["PRESSING", career.tactics.pressing.toUpperCase()],
    ];
    for (i = 0; i < 3; i++) {
      var sx = 30 + i * 187, sy = 418;
      var sel = SQ.zone === "settings" && SQ.idx === i;
      R.roundRect(sx, sy, 175, 46, 8, sel ? "rgba(255,215,94,0.95)" : "rgba(28,34,54,0.95)");
      R.text(settings[i][0], sx + 87, sy + 13, 10, sel ? "#5c4a12" : "#8fa0c0");
      R.text("◀  " + settings[i][1] + "  ▶", sx + 87, sy + 32, 13, sel ? "#1a2238" : "#ffffff");
    }

    // start button
    var stSel = SQ.zone === "start";
    R.roundRect(140, 488, 320, 50, 10, stSel ? "rgba(111,220,111,0.95)" : "rgba(28,34,54,0.95)");
    R.text("▶  START MATCH", 300, 513, 19, stSel ? "#10301a" : "#dfe7f7");

    // detail card for highlighted player
    var person = selectedPerson();
    if (person) {
      var aff = person.likes === career.formationName ? 4 : person.hates === career.formationName ? -4 : 0;
      R.drawPlayerCard(630, 70, 200, person, { affinity: aff, flag: G.playerTeam.flag });
    }

    // bench list
    R.text("BENCH", 855, 80, 13, "#8fa0c0", "left");
    var bench = benchOf(career);
    for (i = 0; i < bench.length; i++) {
      var q2 = bench[i];
      var by = 96 + i * 34;
      var bsel = SQ.zone === "bench" && SQ.idx === i;
      R.roundRect(845, by, 100, 30, 6, bsel ? "rgba(255,215,94,0.95)" : "rgba(28,34,54,0.95)");
      var col = bsel ? "#1a2238" : (q2.knock === 2 ? "#ff6b57" : "#dfe7f7");
      R.text(q2.pos, 856, by + 10, 9, bsel ? "#5c4a12" : "#8fa0c0", "left");
      R.text(String(q2.ovr), 932, by + 10, 11, col, "right");
      var nm = q2.name.length > 12 ? q2.name.slice(0, 12) + "…" : q2.name;
      R.text(nm, 856, by + 22, 9, col, "left");
      ctx.fillStyle = R.staminaColor(q2.stamina);
      ctx.fillRect(845, by + 28, 100 * (q2.stamina / 100), 2);
    }

    // hints + toast
    var hint = SQ.swapFrom >= 0
      ? "Choose who comes in (XI or bench)  •  ESC cancel"
      : "ARROWS navigate (up/down = sections)  •  ENTER select/swap  •  ESC back";
    R.text(hint, C.W / 2, 568, 12, "#8fa0c0");
    if (SQ.toastT > 0) {
      R.roundRect(C.W / 2 - 240, 540, 480, 22, 6, "rgba(255,215,94,0.92)");
      R.text(SQ.toast, C.W / 2, 551, 12, "#1a2238");
    }
  }

  function drawChip(x, y, q, slot, selected, marked) {
    var ctx = R.ctx();
    var w = 96, h = 36;
    var bg = selected ? "rgba(255,215,94,0.97)" : marked ? "rgba(111,220,111,0.92)" : "rgba(13,17,28,0.88)";
    R.roundRect(x - w / 2, y - h / 2, w, h, 6, bg);
    if (q) {
      var mismatch = q.role !== slot.role;
      var col = selected || marked ? "#1a2238" : "#ffffff";
      R.text(String(q.ovr), x - w / 2 + 14, y - 8, 12, col);
      R.text(q.pos, x - w / 2 + 14, y + 6, 8, mismatch ? "#ff6b57" : (selected || marked ? "#5c4a12" : "#8fa0c0"));
      var nm = q.name.length > 11 ? q.name.slice(0, 11) + "…" : q.name;
      R.text(nm, x + 8, y - 2, 9, col);
      ctx.fillStyle = R.staminaColor(q.stamina);
      ctx.fillRect(x - w / 2 + 28, y + 8, (w - 36) * (q.stamina / 100), 3);
      if (q.knock) R.text("+", x + w / 2 - 8, y - 8, 12, q.knock === 2 ? "#ff4444" : "#ffaa33");
    }
  }

  // ---- manager match --------------------------------------------------------

  var MP = { open: false, zone: "tactics", idx: 0, subFrom: -1 };

  function startManagerMatch() {
    var career = G.career;
    // a hurt starter can't begin the match
    for (var i = 0; i < 11; i++) {
      if (career.xi[i] && career.xi[i].knock === 2) { sqToast(career.xi[i].name + " is injured - replace him"); return; }
    }
    syncOnField(career);
    var pair = playerPair(G.cup);
    var opp = pair.a === G.playerTeam ? pair.b : pair.a;

    var oppSquad = WC.buildSquad(opp.id);
    var oppForm = U.pick(FORM_NAMES);
    var oppXI = WC.pickXI(oppSquad, WC.FORMATIONS_11[oppForm], oppForm);
    oppXI.forEach(function (q) { if (q) q.onField = true; });

    WC.setPitch("manager");
    R.refreshPitch();
    G.match = new WC.Match(G.playerTeam, opp, {
      mode: "cup", humanTeam: null, managed: 0,
      formations: [WC.FORMATIONS_11[career.formationName], WC.FORMATIONS_11[oppForm]],
      formationNames: [career.formationName, oppForm],
      squads: [career.xi, oppXI],
      fullSquads: [career.squad, oppSquad],
      tactics: [career.tactics, { mentality: "balanced", pressing: "normal" }],
    });
    G.paused = false;
    G.fullTimeT = 0;
    MP.open = false; MP.subFrom = -1; MP.zone = "tactics"; MP.idx = 0;
    goto("mmatch");
    R.addBanner(ROUND_NAMES[G.cup.round], G.playerTeam.name + " (" + career.formationName + ")  vs  " +
      opp.name + " (" + oppForm + ")", "#ffd75e", 2.6);
  }

  function leaveManagerMatch(target) {
    WC.setPitch("arcade");
    R.refreshPitch();
    G.match = null;
    goto(target);
  }

  function updateMMatch(dt) {
    var match = G.match;

    if ((WC.Input.panelPressed() || (!MP.open && WC.Input.pausePressed())) && !match.over) {
      MP.open = !MP.open;
      MP.subFrom = -1;
      A.ui();
    }
    if (MP.open && !match.over) { updatePanel(); return; }

    if (WC.Input.rallyPressed() && !match.over) {
      if (!match.rallyTeam(0)) R.addBanner("RALLY NOT READY", Math.ceil(match.rally[0].cd) + "s to go", "#8fa0c0", 1.1);
    }
    if (WC.Input.ffwdPressed()) {
      match.speedMult = match.speedMult > 1 ? 1 : 2.5;
      A.ui();
    }

    match.update(dt, null);
    processEvents(match);

    if (match.over) {
      G.fullTimeT += dt;
      var mm = WC.Input.menu();
      if (G.fullTimeT > 3 && mm.confirm) finishManagerMatch();
    }
  }

  function fieldedOf(match, team) {
    var arr = [];
    for (var i = 0; i < match.players.length; i++) {
      if (match.players[i].team === team) arr.push({ idx: i, p: match.players[i] });
    }
    return arr;
  }

  function updatePanel() {
    var match = G.match;
    var m = WC.Input.menu();
    var bench = match.fullSquads[0].filter(function (q) { return !q.onField && q.knock !== 2; });
    var rosterN = match.teamSize + bench.length;

    if (m.back) {
      if (MP.subFrom >= 0) MP.subFrom = -1;
      else MP.open = false;
      A.ui();
      return;
    }
    if (m.up || m.down) {
      A.ui();
      if (MP.zone === "tactics") {
        if (m.down && MP.idx >= 2) { MP.zone = "roster"; MP.idx = 0; }
        else MP.idx = U.clamp(MP.idx + (m.down ? 1 : -1), 0, 2);
      } else {
        if (m.up && MP.idx === 0) { MP.zone = "tactics"; MP.idx = 2; }
        else MP.idx = U.clamp(MP.idx + (m.down ? 1 : -1), 0, rosterN - 1);
      }
    }
    if (MP.zone === "tactics" && (m.left || m.right)) {
      var dir = m.right ? 1 : -1;
      var tac = match.tactics[0];
      A.ui();
      if (MP.idx === 0) tac.mentality = MENTALITIES[(MENTALITIES.indexOf(tac.mentality) + dir + 3) % 3];
      else if (MP.idx === 1) tac.pressing = PRESSINGS[(PRESSINGS.indexOf(tac.pressing) + dir + 3) % 3];
      // keep career in sync so the next match starts from here
      G.career.tactics.mentality = tac.mentality;
      G.career.tactics.pressing = tac.pressing;
    }
    if (!m.confirm) return;

    if (MP.zone === "tactics" && MP.idx === 2) { // rally row
      if (!match.rallyTeam(0)) R.addBanner("RALLY NOT READY", Math.ceil(match.rally[0].cd) + "s to go", "#8fa0c0", 1.1);
      else { MP.open = false; }
      return;
    }
    if (MP.zone !== "roster") return;

    if (MP.idx < match.teamSize) {
      // picked a fielded player
      var fp = fieldedOf(match, 0)[MP.idx];
      if (fp.p.isGK && MP.subFrom < 0) {
        // allow subbing the GK too - find bench GK at confirm time
      }
      MP.subFrom = fp.idx;
      A.ui();
    } else {
      var q = bench[MP.idx - match.teamSize];
      if (!q) return;
      if (MP.subFrom < 0) { R.addBanner("PICK WHO COMES OFF", "select a fielded player first", "#8fa0c0", 1.2); return; }
      var outP = match.players[MP.subFrom];
      if (outP.isGK && q.role !== "GK") { R.addBanner("NEEDS A GOALKEEPER", "", "#8fa0c0", 1.2); return; }
      if (match.substitute(0, MP.subFrom, q)) {
        MP.subFrom = -1;
        MP.open = false;
        A.uiBig();
      } else {
        R.addBanner("NO SUBS LEFT", "", "#8fa0c0", 1.2);
      }
    }
  }

  function drawMMatch() {
    var match = G.match;
    R.drawMatch(match, { hud: true });

    if (MP.open && !match.over) drawPanel();

    if (match.over && G.fullTimeT > 1.2) {
      // full-time stats card
      var cx = C.W / 2;
      R.roundRect(cx - 240, 150, 480, 280, 12, "rgba(10,13,24,0.93)");
      R.text("FULL-TIME", cx, 180, 26, "#ffd75e");
      R.text(match.teams[0].id + "  " + match.score[0] + " - " + match.score[1] + "  " + match.teams[1].id, cx, 220, 30, "#ffffff");
      var pa = match.stats.poss[0] + match.stats.poss[1] || 1;
      var rows = [
        ["Possession", Math.round(match.stats.poss[0] / pa * 100) + "%", Math.round(match.stats.poss[1] / pa * 100) + "%"],
        ["Shots", match.stats.shots[0], match.stats.shots[1]],
        ["On target", match.stats.onTarget[0], match.stats.onTarget[1]],
        ["Subs used", match.subsUsed[0], match.subsUsed[1]],
      ];
      for (var i = 0; i < rows.length; i++) {
        var ry = 268 + i * 30;
        R.text(String(rows[i][1]), cx - 150, ry, 16, "#ffffff");
        R.text(rows[i][0], cx, ry, 13, "#8fa0c0");
        R.text(String(rows[i][2]), cx + 150, ry, 16, "#ffffff");
      }
      R.text("ENTER continue", cx, 405, 13, "#ffd75e");
    }
  }

  function drawPanel() {
    var ctx = R.ctx();
    var match = G.match;
    ctx.fillStyle = "rgba(10,13,24,0.78)";
    ctx.fillRect(0, 0, C.W, C.H);

    R.text("MANAGEMENT  —  " + match.displayClock() + "'", C.W / 2, 38, 22, "#ffd75e");

    // left: tactics
    var tac = match.tactics[0];
    var lx = 70, ly = 80;
    var rows = [
      ["MENTALITY", tac.mentality.toUpperCase()],
      ["PRESSING", tac.pressing.toUpperCase()],
      ["RALLY", match.rally[0].t > 0 ? "ACTIVE!" : match.rally[0].cd > 0 ? Math.ceil(match.rally[0].cd) + "s" : "READY"],
    ];
    for (var i = 0; i < rows.length; i++) {
      var sel = MP.zone === "tactics" && MP.idx === i;
      var ry = ly + i * 56;
      R.roundRect(lx, ry, 280, 46, 8, sel ? "rgba(255,215,94,0.95)" : "rgba(28,34,54,0.95)");
      R.text(rows[i][0], lx + 14, ry + 14, 10, sel ? "#5c4a12" : "#8fa0c0", "left");
      R.text((i < 2 ? "◀  " : "") + rows[i][1] + (i < 2 ? "  ▶" : ""), lx + 14, ry + 32, 14, sel ? "#1a2238" : "#ffffff", "left");
    }
    R.text("SUBS USED  " + match.subsUsed[0] + " / " + match.maxSubs, lx, ly + 188, 13, "#8fa0c0", "left");
    R.text("Mentality shifts your lines up or down.", lx, ly + 230, 11, "#67738f", "left");
    R.text("High pressing wins the ball but burns fitness.", lx, ly + 250, 11, "#67738f", "left");
    R.text("Rally: +pace +aggression for 18s (75s cooldown).", lx, ly + 270, 11, "#67738f", "left");

    // right: roster
    var rx = 430, ry0 = 72;
    R.text("ON THE PITCH", rx, ry0 - 8, 11, "#8fa0c0", "left");
    var fielded = fieldedOf(match, 0);
    var bench = match.fullSquads[0].filter(function (q) { return !q.onField && q.knock !== 2; });
    for (i = 0; i < fielded.length; i++) {
      drawRosterRow(rx, ry0 + 6 + i * 27, fielded[i].p.person, fielded[i].p.form.role,
        MP.zone === "roster" && MP.idx === i,
        MP.subFrom === fielded[i].idx);
    }
    var by0 = ry0 + 6 + fielded.length * 27 + 18;
    R.text("BENCH", rx, by0 - 8, 11, "#8fa0c0", "left");
    for (i = 0; i < bench.length; i++) {
      drawRosterRow(rx, by0 + 6 + i * 27, bench[i], bench[i].role,
        MP.zone === "roster" && MP.idx === match.teamSize + i, false);
    }

    R.text(MP.subFrom >= 0 ? "Now pick the bench player who comes on  •  ESC cancel"
      : "ARROWS navigate  •  ◀▶ change tactic  •  ENTER pick/sub  •  TAB close",
      C.W / 2, 578, 12, "#8fa0c0");
  }

  function drawRosterRow(x, y, person, slotRole, selected, marked) {
    var ctx = R.ctx();
    if (!person) return;
    var w = 460;
    R.roundRect(x, y, w, 24, 5, selected ? "rgba(255,215,94,0.95)" : marked ? "rgba(111,220,111,0.9)" : "rgba(28,34,54,0.92)");
    var col = selected || marked ? "#1a2238" : "#ffffff";
    R.text(person.pos, x + 8, y + 12, 9, selected || marked ? "#5c4a12" : "#8fa0c0", "left");
    R.text(person.name, x + 44, y + 12, 11, col, "left");
    R.text(String(person.ovr), x + w - 116, y + 12, 11, col, "right");
    ctx.fillStyle = R.staminaColor(person.stamina);
    ctx.fillRect(x + w - 104, y + 8, 70 * (person.stamina / 100), 8);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + w - 104, y + 8, 70, 8);
    if (person.knock) R.text(person.knock === 2 ? "INJ" : "KNOCK", x + w - 8, y + 12, 9, person.knock === 2 ? "#ff4444" : "#ffaa33", "right");
  }

  function finishManagerMatch() {
    var match = G.match;
    var cup = G.cup;
    var pair = playerPair(cup);
    var iAmA = pair.a === G.playerTeam;
    pair.sa = iAmA ? match.score[0] : match.score[1];
    pair.sb = iAmA ? match.score[1] : match.score[0];
    pair.winner = match.winner === 0 ? G.playerTeam : (iAmA ? pair.b : pair.a);

    // recovery between rounds: legs rest, knocks heal
    G.career.squad.forEach(function (q) {
      q.stamina = Math.min(100, q.stamina + 42);
      q.knock = 0; q.knockT = 0;
    });

    if (pair.winner !== G.playerTeam) {
      cup.alive = false;
      resolveRoundsToEnd();
    } else {
      resolveRound(cup);
    }
    leaveManagerMatch("bracket");
  }

  // ---- dispatch -------------------------------------------------------------

  var TABLE = {
    title: { update: updateTitle, draw: drawTitle },
    select: { update: updateSelect, draw: drawSelect },
    bracket: { update: updateBracket, draw: drawBracket },
    match: { update: updateMatch, draw: drawMatchScreen },
    squad: { update: updateSquad, draw: drawSquad },
    mmatch: { update: updateMMatch, draw: drawMMatch },
    champion: { update: updateChampion, draw: drawChampion },
  };

  return {
    boot: function () {
      R = WC.Render;
      A = WC.Audio;
    },
    // dev shortcut: jump straight to a screen
    // (#match, #action, #select, #bracket, #champion, #squad, #maction, #mpanel)
    debugJump: function (hash) {
      G.playerTeam = WC.teamById("FRA");
      if (hash === "#select") { G.mode = "cup"; goto("select"); }
      else if (hash === "#bracket") { G.cup = newCup(G.playerTeam); goto("bracket"); }
      else if (hash === "#champion") {
        goto("champion");
        R.confettiBurst([G.playerTeam.kit, "#ffd75e", "#ffffff"], 120);
        for (var i = 0; i < 90; i++) R.updateFx(1 / 30);
        R.confettiBurst([G.playerTeam.kit, "#ffd75e", "#ffffff"], 80);
      }
      else if (hash === "#match" || hash === "#action") {
        G.mode = "friendly";
        startMatch(WC.teamById("FRA"), WC.teamById("BRA"), "friendly");
        if (hash === "#action") { // fast-forward into open play
          for (var k = 0; k < 14 * 60; k++) G.match.update(1 / 60, null);
          G.match.events.length = 0;
          R.clearFx();
        }
      }
      else if (hash === "#squad" || hash === "#maction" || hash === "#mpanel") {
        G.mode = "manager";
        G.cup = newCup(G.playerTeam);
        G.career = newCareer(G.playerTeam);
        if (hash === "#squad") { goto("squad"); return; }
        startManagerMatch();
        for (var k2 = 0; k2 < 30 * 60; k2++) G.match.update(1 / 60, null);
        G.match.events.length = 0;
        R.clearFx();
        if (hash === "#mpanel") { MP.open = true; MP.zone = "roster"; MP.idx = 3; }
      }
    },
    update: function (dt) {
      if (WC.Input.mutePressed()) WC.Audio.toggleMute();
      TABLE[G.screen].update(dt);
      if (G.screen !== "champion") R.updateFx(dt);
    },
    draw: function () { TABLE[G.screen].draw(); },
    state: G,
  };
})();
