"use strict";
// Match: rules, possession, restarts, clock. Pure logic - rendering reads
// from it, audio listens to match.events. Supports two shapes:
//   arcade  - 5v5, a human drives one player (humanTeam 0)
//   manager - 11v11 AI vs AI, the user coaches team `managed` (tactics,
//             subs, rally, knocks) and the opponent has an AI coach.

(function () {
  var C = WC.CONST, U = WC.U;

  // input snapshot shape: {mx,my (move dir -1..1), sprint, passDown, shootDown, switchDown}
  WC.Match = function (teamA, teamB, opts) {
    opts = opts || {};
    this.teams = [teamA, teamB];
    this.mode = opts.mode || "friendly";          // 'friendly' | 'cup'
    this.humanTeam = (opts.humanTeam === undefined) ? 0 : opts.humanTeam; // null = AI/manager
    this.managed = (opts.managed === undefined) ? null : opts.managed;    // manager mode team idx
    this.isManager = this.managed !== null;

    var kits = WC.resolveKits(teamA, teamB);
    this.kits = kits.kits;
    this.gkKits = kits.gkKits;

    var defForm = WC.FORM_ARCADE;
    this.formations = opts.formations || [defForm, defForm];
    this.formationNames = opts.formationNames || [null, null];
    this.squads = opts.squads || [null, null];    // starting XI aligned to formation slots
    this.fullSquads = opts.fullSquads || this.squads; // XI + bench (for coaches)
    this.teamSize = this.formations[0].length;

    this.tactics = opts.tactics || [
      { mentality: "balanced", pressing: "normal" },
      { mentality: "balanced", pressing: "normal" },
    ];

    this.players = [];
    for (var t = 0; t < 2; t++) {
      var spdMult = 0.93 + (this.teams[t].spd / 99) * 0.14;
      for (var s = 0; s < this.teamSize; s++) {
        var person = this.squads[t] ? this.squads[t][s] : null;
        var p = WC.makePlayer(t, s, t === 0 ? 1 : -1, this.formations[t][s], person);
        p.baseSpeedMult = spdMult * U.rand(0.97, 1.03);
        p.speedMult = p.baseSpeedMult;
        var home = WC.homePos(this, p);
        p.x = home.x; p.y = home.y;
        this.players.push(p);
      }
    }
    this.ball = WC.makeBall();

    this.score = [0, 0];
    this.half = 1;
    this.clock = 0;             // real seconds within current half
    this.extraTime = false;
    this.over = false;
    this.winner = null;         // 0 | 1 once over (friendly can stay null on draw)

    this.state = "SETUP";
    this.stateT = 0;
    this.restart = { kind: "kickoff", team: 0, x: C.FIELD.cx, y: C.FIELD.cy, taker: null };
    this.controlled = -1;
    this.events = [];
    this.lastScorer = null;
    this.goalFlash = 0;

    // manager-mode state
    this.subsUsed = [0, 0];
    this.maxSubs = 5;
    this.rally = [{ t: 0, cd: 0 }, { t: 0, cd: 0 }];
    this.stats = { poss: [0, 0], shots: [0, 0], onTarget: [0, 0] };
    this.coachT = 0;            // opponent coach thinking timer
    this.speedMult = 1;         // fast-forward (manager view)

    this._setupRestart();
  };

  var M = WC.Match.prototype;

  M.emit = function (type, data) { this.events.push({ type: type, data: data || {} }); };

  M.displayClock = function () {
    var frac = U.clamp(this.clock / C.TIME.halfReal, 0, 1);
    var min = frac * C.TIME.halfDisplayMin + (this.half === 2 ? 45 : 0);
    if (this.extraTime) min = 90;
    return Math.floor(min);
  };

  M.teamOf = function (p) { return this.teams[p.team]; };
  M.gk = function (team) { return this.players[team * this.teamSize]; };

  // ---- tactics / ratings hooks (defaults = arcade behavior) --------------

  M.mentalityShift = function (team) {
    if (!this.isManager) return 0;
    var m = this.tactics[team].mentality;
    return m === "attacking" ? 0.07 : m === "defensive" ? -0.06 : 0;
  };

  M.urgeAtt = function (team) {
    if (!this.isManager) return 1;
    var m = this.tactics[team].mentality;
    return m === "attacking" ? 1.3 : m === "defensive" ? 0.82 : 1;
  };

  M.pressCount = function (team) {
    if (!this.isManager) return 1;
    var pr = this.tactics[team].pressing;
    var n = pr === "high" ? 3 : pr === "low" ? 1 : 2;
    if (this.rally[team].t > 0) n += 1;
    return n;
  };

  // formation affinity: players play better/worse in systems they (dis)like
  M.formBonus = function (p) {
    if (!p.person) return 0;
    var fname = this.formationNames[p.team];
    if (!fname) return 0;
    if (p.person.likes === fname) return 4;
    if (p.person.hates === fname) return -4;
    return 0;
  };

  M.attOf = function (p) {
    var r = p.person ? p.person.att + this.formBonus(p) : this.teams[p.team].att;
    var mult = 0.82 + (U.clamp(r, 1, 99) / 99) * 0.30;
    if (p.person && p.person.stamina < 40) mult *= 0.92;
    return mult;
  };

  M.defOf = function (p) {
    var r = p.person ? p.person.def + this.formBonus(p) : this.teams[p.team].def;
    var mult = 0.82 + (U.clamp(r, 1, 99) / 99) * 0.30;
    if (p.person && p.person.stamina < 40) mult *= 0.92;
    return mult;
  };

  M.rallyTeam = function (team) {
    var r = this.rally[team];
    if (r.cd > 0 || this.state === "FULLTIME") return false;
    r.t = 18;
    r.cd = 75;
    this.emit("rally", { team: team });
    return true;
  };

  // swap a fielded player's person for a bench person (manager mode)
  M.substitute = function (team, playerIdx, personIn) {
    if (this.subsUsed[team] >= this.maxSubs) return false;
    var p = this.players[playerIdx];
    if (!p || p.team !== team || !personIn) return false;
    var out = p.person;
    if (out) out.onField = false;
    personIn.onField = true;
    p.person = personIn;
    p.variant = 1 + Math.floor(Math.random() * 10);
    p.stealImmune = 0; p.tackleCd = 0; p.lungeT = 0;
    this.subsUsed[team]++;
    if (this.ball.owner === p) this.ball.owner = p; // person swaps, body stays
    this.emit("sub", { team: team, out: out, inP: personIn });
    return true;
  };

  // ---- restarts ----------------------------------------------------------

  M._fwSlot = function (team) {
    var f = this.formations[team];
    for (var i = f.length - 1; i >= 0; i--) if (f[i].role === "FW") return i;
    return f.length - 1;
  };

  M._setupRestart = function () {
    var r = this.restart;
    this.state = "SETUP";
    this.stateT = 0;
    this.ball.owner = null;
    this.ball.vx = 0; this.ball.vy = 0;
    this.ball.x = r.x; this.ball.y = r.y;
    this.ball.shadow = 0;

    // pick the taker
    if (r.kind === "goalkick") {
      r.taker = this.gk(r.team);
    } else if (r.kind === "kickoff") {
      r.taker = this.players[r.team * this.teamSize + this._fwSlot(r.team)];
    } else {
      var best = null, bd = 1e9;
      for (var i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        if (p.team !== r.team || p.isGK) continue;
        var d = U.dist(p.x, p.y, r.x, r.y);
        if (d < bd) { bd = d; best = p; }
      }
      r.taker = best;
    }
    this._computeSetupTargets();
  };

  M._computeSetupTargets = function () {
    var r = this.restart, F = C.FIELD;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var h = WC.homePos(this, p);
      var tx = h.x, ty = h.y;

      if (p === r.taker) {
        // stand just "behind" the ball relative to attack direction
        tx = r.x - p.dir * 12;
        ty = r.y + (r.kind === "kickin" ? (r.y < F.cy ? 10 : -10) : 0);
      } else if (r.kind === "kickoff") {
        // own half only
        if (p.team === 0) tx = Math.min(h.x, F.cx - 30);
        else tx = Math.max(h.x, F.cx + 30);
      } else if (r.kind === "corner") {
        var atkGoalX = r.taker.dir > 0 ? F.right : F.left;
        var crash = p.role === "FW" || (p.role === "MF" && p.slot % 2 === 0);
        if (p.team === r.team && crash && !p.isGK) {
          // attackers crash the box
          tx = atkGoalX - r.taker.dir * U.rand(55, 110);
          ty = F.cy + (p.slot % 2 === 0 ? -1 : 1) * U.rand(20, 70);
        } else if (p.team !== r.team && (p.role === "DF" || p.role === "MF") && !p.isGK) {
          tx = atkGoalX + (r.taker.dir > 0 ? -1 : 1) * U.rand(35, 90);
          ty = F.cy + (p.slot % 2 === 0 ? 1 : -1) * U.rand(15, 65);
        }
      } else {
        // shift loosely toward the ball side
        tx = h.x + (r.x - F.cx) * 0.25;
        ty = h.y + (r.y - F.cy) * 0.25;
      }
      p.setupX = U.clamp(tx, F.left + 10, F.right - 10);
      p.setupY = U.clamp(ty, F.top + 10, F.bottom - 10);
    }
  };

  M._restartStandoff = function () {
    // opponents keep their distance from the restart spot
    var r = this.restart, F = C.FIELD;
    var minD = r.kind === "kickoff" ? C.BOX.circleR : 75;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team === r.team) continue;
      var d = U.dist(p.x, p.y, r.x, r.y);
      if (d < minD && d > 1e-3) {
        var n = U.norm(p.x - r.x, p.y - r.y);
        // clamped into the field: near corners the full radius isn't possible
        p.x = U.clamp(r.x + n.x * minD, F.left + 10, F.right - 10);
        p.y = U.clamp(r.y + n.y * minD, F.top + 10, F.bottom - 10);
      }
      if (r.kind === "kickoff") {
        // and stay in their own half
        if (p.team === 0) p.x = Math.min(p.x, C.FIELD.cx - 14);
        else p.x = Math.max(p.x, C.FIELD.cx + 14);
      }
    }
  };

  // ---- actions -----------------------------------------------------------

  M.doPass = function (passer, mate) {
    var b = this.ball;
    if (b.owner !== passer || !mate) return;
    var d = U.dist(b.x, b.y, mate.x, mate.y);
    var t = d / C.BALL.passSpeed;
    var lx = mate.x + mate.vx * t * 0.8;
    var ly = mate.y + mate.vy * t * 0.8;
    var dir = U.norm(lx - b.x, ly - b.y);
    var spd = Math.min(C.BALL.passSpeed + d * 0.25, 620);
    b.vx = dir.x * spd; b.vy = dir.y * spd;
    b.owner = null;
    b.lastTouchTeam = passer.team;
    passer.kickLock = C.TACKLE.kickLockout;
    this.passTarget = mate;
    this.emit("kick", { power: 0.5 });
    if (this.state === "WAIT") this._endRestart();
    if (this.humanTeam === passer.team) this._control(mate); // arcade pre-switch
  };

  M.doShoot = function (shooter, aimBias) {
    var b = this.ball;
    if (b.owner !== shooter) return;
    var goal = WC.attackGoal(shooter);
    var d = U.dist(b.x, b.y, goal.x, goal.y);
    var opp = 1e9;
    for (var i = 0; i < this.players.length; i++) {
      var o = this.players[i];
      if (o.team !== shooter.team) opp = Math.min(opp, U.dist(o.x, o.y, shooter.x, shooter.y));
    }
    // lateral error: distance, pressure and shooting angle all hurt accuracy
    var acc = this.attOf(shooter); // 0.82..1.12
    var spread = (10 + d * 0.13 + (opp < 40 ? 26 : 0) + Math.abs(b.y - goal.y) * 0.22) / acc;
    var ty = goal.y + (aimBias || 0) * (C.GOAL.halfMouth - 10) + U.noise() * spread * 1.9;
    var dir = U.norm(goal.x - b.x, ty - b.y);
    var spd = C.BALL.shotSpeed * U.rand(0.92, 1.06);
    if (d > 330) spd *= 0.9; // long-range floats
    b.vx = dir.x * spd; b.vy = dir.y * spd;
    b.owner = null;
    b.lastTouchTeam = shooter.team;
    b.shadow = 1;
    shooter.kickLock = C.TACKLE.kickLockout;
    this.passTarget = null;
    this.stats.shots[shooter.team]++;
    this.emit("kick", { power: 1 });
    if (this.state === "WAIT") this._endRestart();
  };

  M.tryTackle = function (p, defMult) {
    var b = this.ball;
    if (!b.owner || b.owner.team === p.team) return;
    if (p.tackleCd > 0 || b.owner.stealImmune > 0) return;
    var reach = C.TACKLE.radius + (p.lungeT > 0 ? 6 : 0);
    if (U.dist(p.x, p.y, b.x, b.y) > reach) return;
    p.tackleCd = C.TACKLE.cooldown;
    var prob = 0.62 * (defMult || 1) + (p.lungeT > 0 ? 0.22 : 0);
    if (U.chance(U.clamp(prob, 0.2, 0.95))) {
      var victim = b.owner;
      victim.tackleCd = 0.7;
      if (U.chance(0.45)) {
        // clean steal
        this._gainPossession(p);
      } else {
        // knock it loose ahead of the tackler
        b.owner = null;
        b.lastTouchTeam = p.team;
        var n = U.norm(Math.cos(p.facing), Math.sin(p.facing));
        b.vx = n.x * 200 + U.noise() * 60;
        b.vy = n.y * 200 + U.noise() * 60;
        p.kickLock = 0.12;
      }
      this.emit("tackle");
    }
  };

  M.humanLunge = function (p) {
    if (p.tackleCd > 0 || p.lungeT > 0) return;
    p.lungeT = C.TACKLE.lungeTime;
    this.tryTackle(p, 1.25);
  };

  M._gainPossession = function (p) {
    var b = this.ball;
    b.owner = p;
    b.lastTouchTeam = p.team;
    b.shadow = 0;
    p.stealImmune = C.TACKLE.stealImmunity;
    p.gkHoldT = 0;
    this.passTarget = null; // any possession kills the pending pass (interceptions too)
    if (this.humanTeam === p.team) this._control(p);
  };

  M._control = function (p) {
    if (p.isGK) return;
    var idx = this.players.indexOf(p);
    if (idx !== this.controlled) {
      this.controlled = idx;
      this.emit("switch");
    }
  };

  // ---- per-frame update ----------------------------------------------------

  M.update = function (dt, input) {
    dt = Math.min(dt, 0.05) * (this.speedMult || 1);
    this.stateT += dt;
    this.goalFlash = Math.max(0, this.goalFlash - dt);
    input = input || WC.Match.NULL_INPUT;

    if (this.isManager) this._managerTick(dt);

    switch (this.state) {
      case "SETUP": this._updateSetup(dt); break;
      case "WAIT": this._updateWait(dt, input); break;
      case "PLAY": this._updatePlay(dt, input); break;
      case "GOAL":
        this._celebrate(dt);
        if (this.stateT > C.TIME.goalCelebration) this._afterGoal();
        break;
      case "HALFTIME":
        if (this.stateT > C.TIME.halfTimePause) {
          this.half = 2;
          this.clock = 0;
          this.restart = { kind: "kickoff", team: 1, x: C.FIELD.cx, y: C.FIELD.cy, taker: null };
          this._setupRestart();
          this.emit("whistle");
        }
        break;
      case "FULLTIME": break;
    }
  };

  // stamina, rally timers, knocks, the opponent coach
  M._managerTick = function (dt) {
    for (var t = 0; t < 2; t++) {
      var r = this.rally[t];
      r.t = Math.max(0, r.t - dt);
      r.cd = Math.max(0, r.cd - dt);
    }
    var inPlay = this.state === "PLAY";
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var person = p.person;
      if (!person) continue;
      if (inPlay) {
        var drain = 0.30 + (p.sprinting ? 0.55 : 0)
          + (this.tactics[p.team].pressing === "high" ? 0.10 : 0)
          + (this.rally[p.team].t > 0 ? 0.35 : 0);
        if (p.isGK) drain *= 0.25;
        person.stamina = Math.max(0, person.stamina - drain * dt);

        // tired legs pick up knocks
        if (!person.knock && U.chance(dt * 0.0008 * (1.6 - person.stamina / 100))) {
          person.knock = 1;
          person.knockT = 0;
          this.emit("knock", { team: p.team, person: person, idx: i });
        }
        if (person.knock === 1) {
          person.knockT += dt;
          if (person.knockT > 40 && U.chance(dt * 0.02)) {
            person.knock = 2;
            this.emit("knockWorse", { team: p.team, person: person, idx: i });
          }
        }
      }
      // effective speed: pace, stamina, knocks, rally
      var pace = 0.90 + (U.clamp(person.pac + this.formBonus(p), 1, 99) / 99) * 0.20;
      var stam = 0.78 + 0.22 * (person.stamina / 100);
      var knock = person.knock === 2 ? 0.55 : person.knock === 1 ? 0.8 : 1;
      var rally = this.rally[p.team].t > 0 ? 1.07 : 1;
      if (p.isGK) { stam = Math.max(stam, 0.95); knock = 1; }
      p.speedMult = p.baseSpeedMult * pace * stam * knock * rally;
    }

    // opponent coach thinks every couple of seconds
    this.coachT += dt;
    if (this.coachT > 2 && !this.over) {
      this.coachT = 0;
      var oppT = this.managed === 0 ? 1 : 0;
      this._coachAI(oppT);
    }
  };

  M._coachAI = function (t) {
    var min = this.displayClock();
    var diff = this.score[t] - this.score[1 - t];

    // mentality reacts to the scoreline late on
    if (min >= 70 && diff < 0) this.tactics[t].mentality = "attacking";
    else if (min >= 75 && diff > 0) this.tactics[t].mentality = "defensive";

    if (this.subsUsed[t] >= this.maxSubs) return;
    var squad = this.fullSquads[t];
    if (!squad) return;

    // sub off knocked players, then the most tired from 60'
    var worstIdx = -1, worstScore = 1e9;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team !== t || p.isGK || !p.person) continue;
      var s = p.person.stamina - (p.person.knock ? 60 : 0);
      if (s < worstScore) { worstScore = s; worstIdx = i; }
    }
    if (worstIdx < 0) return;
    var out = this.players[worstIdx];
    var needSub = out.person.knock || (min >= 60 && out.person.stamina < 42);
    if (!needSub) return;

    // freshest compatible bench player
    var bench = squad.filter(function (q) { return !q.onField && !q.knock && q.role === out.person.role; });
    if (!bench.length) bench = squad.filter(function (q) { return !q.onField && !q.knock && q.role !== "GK"; });
    if (!bench.length) return;
    bench.sort(function (a, b) { return b.stamina - a.stamina; });
    this.substitute(t, worstIdx, bench[0]);
    // rally when chasing the game
    if (diff < 0 && min > 65) this.rallyTeam(t);
  };

  M._updateSetup = function (dt) {
    var r = this.restart;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.sprinting = false;
      p.moveX = p.setupX - p.x; p.moveY = p.setupY - p.y;
      if (U.len(p.moveX, p.moveY) < 5) { p.moveX = 0; p.moveY = 0; }
      WC.stepPlayer(p, dt);
    }
    this._restartStandoff();
    var takerClose = U.dist(r.taker.x, r.taker.y, r.x, r.y) < 26;
    if ((takerClose && this.stateT > 0.45) || this.stateT > C.TIME.restartSetupMax) {
      this.state = "WAIT";
      this.stateT = 0;
      this.ball.owner = r.taker;
      r.taker.facing = r.taker.dir > 0 ? 0 : Math.PI;
      if (this.humanTeam === r.team) this._control(r.taker);
      if (r.kind === "kickoff") this.emit("whistle");
    }
  };

  M._updateWait = function (dt, input) {
    var r = this.restart;
    // everyone keeps drifting to their spots; taker holds still
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.sprinting = false;
      if (p === r.taker) { p.moveX = 0; p.moveY = 0; }
      else {
        p.moveX = p.setupX - p.x; p.moveY = p.setupY - p.y;
        if (U.len(p.moveX, p.moveY) < 5) { p.moveX = 0; p.moveY = 0; }
      }
      WC.stepPlayer(p, dt);
    }
    this._restartStandoff();
    WC.stepBall(this.ball, dt);

    var isHuman = this.humanTeam === r.team;
    if (isHuman) {
      if (input.passDown) { this.doPass(r.taker, WC.choosePassTarget(this, r.taker, input.mx, input.my)); }
      else if (input.shootDown) { this.doShoot(r.taker, input.my); }
      else if (this.stateT > 7) WC.aiRestartKick(this, r.taker); // anti-stall
    } else if (this.stateT > C.TIME.aiRestartDelay) {
      WC.aiRestartKick(this, r.taker);
    }
  };

  M._endRestart = function () {
    this.state = "PLAY";
    this.stateT = 0;
  };

  M._updatePlay = function (dt, input) {
    var b = this.ball;

    // clock (frozen during golden goal - it's sudden death)
    if (!this.extraTime) {
      this.clock += dt;
      if (this.clock >= C.TIME.halfReal) return this._endHalf();
    }

    // possession stat
    if (b.owner) this.stats.poss[b.owner.team] += dt;

    // decisions
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (i === this.controlled && this.humanTeam === p.team) {
        this._humanControl(p, input);
      } else {
        WC.aiUpdate(this, p, dt);
      }
    }

    // physics
    for (i = 0; i < this.players.length; i++) WC.stepPlayer(this.players[i], dt);
    WC.separatePlayers(this.players, dt);
    WC.stepBall(b, dt);

    // carrier can't dribble the ball over the goal line / out of play
    if (b.owner) {
      var F = C.FIELD;
      b.x = U.clamp(b.x, F.left + 2, F.right - 2);
      b.y = U.clamp(b.y, F.top + 2, F.bottom - 2);
    } else {
      this._loosePhysics(dt);
    }

    this._autoSwitch();
  };

  M._humanControl = function (p, input) {
    p.moveX = input.mx; p.moveY = input.my;
    p.sprinting = !!input.sprint;
    var owns = this.ball.owner === p;
    if (input.passDown) {
      if (owns) this.doPass(p, WC.choosePassTarget(this, p, input.mx, input.my));
      else this.humanLunge(p);
    }
    if (input.shootDown) {
      if (owns) this.doShoot(p, input.my * 0.8);
      else this.humanLunge(p);
    }
    if (input.switchDown && !owns) this._cycleControl();
    // passive tackle: walking right into the ball can win it too
    if (!owns) this.tryTackle(p, 0.55);
  };

  M._cycleControl = function () {
    var b = this.ball;
    var best = -1, bd = 1e9;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team !== this.humanTeam || p.isGK || i === this.controlled) continue;
      var d = U.dist(p.x, p.y, b.x, b.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) { this.controlled = best; this.emit("switch"); }
  };

  M._autoSwitch = function () {
    if (this.humanTeam === null || this.humanTeam === undefined) return;
    var b = this.ball;
    if (b.owner && b.owner.team === this.humanTeam) { this._control(b.owner); return; }
    if (this.passTarget && this.passTarget.team === this.humanTeam) return; // receiver already chosen
    var cur = this.players[this.controlled];
    var best = null, bd = 1e9;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team !== this.humanTeam || p.isGK) continue;
      var d = U.dist(p.x, p.y, b.x, b.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (!cur || cur.team !== this.humanTeam || cur.isGK) { this._control(best); return; }
    var curD = U.dist(cur.x, cur.y, b.x, b.y);
    if (bd < curD * 0.8) this._control(best);
  };

  // loose ball: collection, saves, posts, goals, out of bounds
  M._loosePhysics = function (dt) {
    var b = this.ball, F = C.FIELD;
    var spd = U.len(b.vx, b.vy);

    // 1) goal / posts / out
    if (this._checkGoalAndBounds()) return;

    // 1b) goalkeeper dive on shots flying at his goal
    if (spd > 300) this._gkSaveCheck(spd);

    // 2) collection (nearest eligible player first)
    var cands = [];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.kickLock > 0) continue;
      var inOwnBox = this._inBox(p.team, b.x, b.y);
      var r = C.PLAYER.controlR + (p.isGK && inOwnBox ? 11 : 0);
      var d = U.dist(p.x, p.y, b.x, b.y);
      if (d < r) cands.push({ p: p, d: d });
    }
    if (!cands.length) return;
    cands.sort(function (a, c) { return a.d - c.d; });
    var taker = cands[0].p;

    // the intended receiver can kill fast passes; everyone else body-blocks
    var hot = (taker === this.passTarget) ? 1e9 : 520;
    if (spd > hot && !taker.isGK) {
      // too hot to control: body block, ball deflects on
      b.vx = b.vx * 0.32 + U.noise() * 70;
      b.vy = b.vy * 0.32 + U.noise() * 70;
      b.lastTouchTeam = taker.team;
      taker.kickLock = 0.25;
      this.emit("block");
      return;
    }
    if (taker.isGK && spd > 380) {
      // diving save: parry or hold
      this.emit("save");
      this.stats.onTarget[1 - taker.team]++;
      if (U.chance(0.45)) {
        var side = b.y < F.cy ? -1 : 1;
        b.vx = -b.vx * 0.25 + taker.dir * 60;
        b.vy = side * U.rand(140, 240);
        b.lastTouchTeam = taker.team;
        taker.kickLock = 0.3;
        return;
      }
    }
    var wasOpp = this.passTarget && this.passTarget.team !== taker.team;
    this._gainPossession(taker);
    if (wasOpp) this.emit("intercept");
  };

  // Dive reflex: if the ball's path passes near the keeper, roll a save.
  // One roll per shot (saveCd) - on success he catches or parries wide.
  M._gkSaveCheck = function (spd) {
    var b = this.ball, F = C.FIELD;
    var defTeam = b.vx < 0 ? 0 : 1; // which goal is under threat
    var gk = this.gk(defTeam);
    if (gk.saveCd > 0) return;
    if (gk === b.owner) return;
    var gx = defTeam === 0 ? F.left : F.right;
    if (Math.abs(gk.x - gx) > 85) return;                  // keeper way off his line
    if ((gx - b.x) * b.vx <= 0) return;                    // not moving toward that goal
    if (Math.abs(b.x - gx) > C.BOX.penW + 30) return;      // too far out, track it instead
    var n = U.norm(b.vx, b.vy);
    var approach = Math.abs((gk.x - b.x) * n.y - (gk.y - b.y) * n.x);
    // reach scales with the goal so big and small pitches save alike
    var reach = C.GOAL.halfMouth * (C.GOAL.reachK + (1 - Math.min(1, spd / 900)) * 0.145);
    if (approach > reach) return;
    gk.saveCd = 0.55;
    var defMult = gk.person
      ? 0.9 + (U.clamp(gk.person.def, 1, 99) / 99) * 0.2
      : 0.9 + (this.teams[defTeam].def / 99) * 0.2;
    var prob = (C.GOAL.saveBase - (approach / reach) * 0.32) * defMult;
    this.stats.onTarget[1 - defTeam]++;
    if (!U.chance(U.clamp(prob, 0.3, 0.93))) return;       // beaten!
    this.emit("save");
    b.lastTouchTeam = defTeam;
    var side = b.y < gk.y ? -1 : 1;
    if (Math.abs(b.y - gk.y) < 4) side = U.chance(0.5) ? 1 : -1;
    var away = defTeam === 0 ? 1 : -1; // direction out of the goal, into the field
    if (U.chance(0.18)) {
      // tipped behind, safely outside the post - corner coming up
      var tipY = F.cy + side * (C.GOAL.halfMouth + U.rand(16, 60));
      var dir2 = U.norm((gx - away * 10) - b.x, tipY - b.y);
      b.vx = dir2.x * 330; b.vy = dir2.y * 330;
      gk.kickLock = 0.3;
    } else if (U.chance(0.3)) {
      // punched wide into play
      b.vx = away * U.rand(60, 140);
      b.vy = side * U.rand(240, 380);
      gk.kickLock = 0.3;
    } else {
      this._gainPossession(gk);
      gk.x = U.clamp(gk.x, F.left + 10, F.right - 10);
    }
  };

  M._inBox = function (team, x, y) {
    var F = C.FIELD;
    var gx = team === 0 ? F.left : F.right;
    var inX = team === 0 ? (x < F.left + C.BOX.penW) : (x > F.right - C.BOX.penW);
    return inX && Math.abs(y - F.cy) < C.BOX.penHalfH && Math.abs(x - gx) < C.BOX.penW + 1;
  };

  M._checkGoalAndBounds = function () {
    var b = this.ball, F = C.FIELD, G = C.GOAL;

    // post bounces (4 posts)
    var posts = [
      { x: F.left, y: F.cy - G.halfMouth }, { x: F.left, y: F.cy + G.halfMouth },
      { x: F.right, y: F.cy - G.halfMouth }, { x: F.right, y: F.cy + G.halfMouth },
    ];
    for (var i = 0; i < posts.length; i++) {
      var dx = b.x - posts[i].x, dy = b.y - posts[i].y;
      var d = U.len(dx, dy);
      if (d < G.postR + C.BALL.r && d > 1e-3) {
        var n = { x: dx / d, y: dy / d };
        var dot = b.vx * n.x + b.vy * n.y;
        if (dot < 0) {
          b.vx -= 2 * dot * n.x; b.vy -= 2 * dot * n.y;
          b.vx *= 0.55; b.vy *= 0.55;
          this.emit("post");
        }
      }
    }

    var inMouthY = Math.abs(b.y - F.cy) < G.halfMouth - C.BALL.r * 0.3;

    // left goal line
    if (b.x < F.left - C.BALL.r) {
      if (inMouthY && b.x > F.left - G.depth - 4) return this._goal(1), true;
      return this._outEndLine(0, b.y), true;
    }
    // right goal line
    if (b.x > F.right + C.BALL.r) {
      if (inMouthY && b.x < F.right + G.depth + 4) return this._goal(0), true;
      return this._outEndLine(1, b.y), true;
    }
    // side lines
    if (b.y < F.top - C.BALL.r || b.y > F.bottom + C.BALL.r) {
      var team = 1 - b.lastTouchTeam;
      this.restart = {
        kind: "kickin", team: team,
        x: U.clamp(b.x, F.left + 24, F.right - 24),
        y: b.y < F.cy ? F.top + 4 : F.bottom - 4,
        taker: null,
      };
      this.emit("out");
      this._setupRestart();
      return true;
    }
    return false;
  };

  // defendingTeam owns the goal at that end (team 0 defends left)
  M._outEndLine = function (defendingTeam, y) {
    var F = C.FIELD;
    var gx = defendingTeam === 0 ? F.left : F.right;
    // near miss rumble
    if (Math.abs(y - F.cy) < C.GOAL.halfMouth + 46) this.emit("ooh");

    if (this.ball.lastTouchTeam === defendingTeam) {
      // corner for the attackers
      var atk = 1 - defendingTeam;
      this.restart = {
        kind: "corner", team: atk,
        x: gx + (defendingTeam === 0 ? 6 : -6),
        y: y < F.cy ? F.top + 6 : F.bottom - 6,
        taker: null,
      };
    } else {
      this.restart = {
        kind: "goalkick", team: defendingTeam,
        x: defendingTeam === 0 ? F.left + C.BOX.sixW : F.right - C.BOX.sixW,
        y: F.cy,
        taker: null,
      };
    }
    this.emit("out");
    this._setupRestart();
  };

  M._goal = function (scoringTeam) {
    var b = this.ball;
    this.score[scoringTeam]++;
    this.stats.onTarget[scoringTeam]++;
    this.lastScorer = scoringTeam;
    this.goalFlash = 1;
    this.state = "GOAL";
    this.stateT = 0;
    // ball rests in the net
    b.vx *= 0.1; b.vy *= 0.1;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team === scoringTeam && !p.isGK) p.celebrateT = C.TIME.goalCelebration;
    }
    this.emit("goal", { team: scoringTeam });
  };

  M._celebrate = function (dt) {
    // scorers jump about, everyone else trudges home
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.celebrateT > 0) {
        p.moveX = Math.cos(this.stateT * 6 + p.slot) * 0.6;
        p.moveY = Math.sin(this.stateT * 5 + p.slot * 2) * 0.6;
      } else {
        var h = WC.homePos(this, p);
        p.moveX = h.x - p.x; p.moveY = h.y - p.y;
        if (U.len(p.moveX, p.moveY) < 8) { p.moveX = 0; p.moveY = 0; }
      }
      p.sprinting = false;
      WC.stepPlayer(p, dt);
    }
    var f = U.decay(0.4, dt);
    this.ball.vx *= f; this.ball.vy *= f;
    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt;
  };

  M._afterGoal = function () {
    if (this.extraTime) return this._fullTime(this.lastScorer);
    var conceding = 1 - this.lastScorer;
    this.restart = { kind: "kickoff", team: conceding, x: C.FIELD.cx, y: C.FIELD.cy, taker: null };
    this._setupRestart();
  };

  M._endHalf = function () {
    if (this.half === 1) {
      this.state = "HALFTIME";
      this.stateT = 0;
      this.ball.owner = null;
      this.emit("halftime");
      return;
    }
    // full time (half 2)
    if (this.score[0] !== this.score[1]) {
      return this._fullTime(this.score[0] > this.score[1] ? 0 : 1);
    }
    if (this.mode === "cup") {
      // golden goal - next goal wins
      this.extraTime = true;
      this.emit("golden");
      return;
    }
    this._fullTime(null); // friendly draw
  };

  M._fullTime = function (winner) {
    this.state = "FULLTIME";
    this.stateT = 0;
    this.over = true;
    this.winner = winner;
    this.ball.owner = null;
    this.emit("fulltime");
  };

  WC.Match.NULL_INPUT = { mx: 0, my: 0, sprint: false, passDown: false, shootDown: false, switchDown: false };
})();
