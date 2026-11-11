/* Billiards app: menus, input (mouse and touch), the match loop and the HUD.
   Aim like carrom: press on the cue ball, pull back, let go. The further you pull, the harder the shot. */
(function () {
  "use strict";

  var cfg = window.BilliardConfig;
  var PH = window.BilliardPhysics;
  var RL = window.BilliardRules;
  var AI = window.BilliardAI;
  var RD = window.BilliardRender;
  var SND = window.BilliardSound;

  var W = cfg.width, H = cfg.height, M = cfg.margin;
  var TW = W + 2 * M, TH = H + 2 * M;
  var BR = cfg.ballR;

  function $(id) { return document.getElementById(id); }

  var canvas = $("board");
  var ctx = canvas.getContext("2d");

  var world = null;       // physics world
  var game = null;        // rules state
  var cue = null;         // the cue ball body
  var mode = "solo";
  var phase = "menu";     // menu | placing | moving | resolving | over
  var aiTimer = 0;
  var drag = null;        // { mode: "aim" | "place" } while the pointer is down
  var guide = null;       // first contact along the aim line
  var aim = { show: false, pulling: false, dirX: 1, dirY: 0, power: 0 };
  var acc = 0, last = 0;
  var shotPocketed = [];  // bodies pocketed in this shot
  var shotScratch = false;
  var shotTouch = null;   // first object ball the cue ball touched in this shot
  var shotBefore = [];    // object balls alive when the shot started

  function setMessage(t) { $("status").textContent = t; }
  function currentPlayer() { return game.players[game.turn]; }
  function isHuman() { return phase === "placing" && !!game && !currentPlayer().computer; }
  function liveObjects() {
    return world.live().filter(function (b) { return b.kind === "ball"; });
  }
  function stopTimers() {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = 0;
  }

  // Short labels for what must be hit now.
  function shortTarget(t) {
    if (t === "solid") return "SOLIDS (1–7)";
    if (t === "stripe") return "STRIPES (9–15)";
    if (t === "eight") return "THE 8 BALL";
    return "ANY BALL (NOT THE 8)";
  }
  function groupName(g) {
    if (g === "solid") return "SOLIDS";
    if (g === "stripe") return "STRIPES";
    return "THE 8 BALL";
  }
  function targetNow() {
    return RL.targetFor(currentPlayer(), liveObjects());
  }

  // ---------- Table set-up ----------
  // Free spot for the cue ball: no object ball within touching distance.
  function freeAt(x, y) {
    return world.live().every(function (b) {
      return b === cue || Math.hypot(b.x - x, b.y - y) >= 2 * BR + 1;
    });
  }

  // Puts the cue ball behind the head string, moving it along the line if the spot is taken.
  function placeCueDefault() {
    cue.alive = true;
    cue.vx = 0; cue.vy = 0;
    var x = W * cfg.dZone * 0.6, y = H / 2;
    for (var k = 0; k < 12; k++) {
      var off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * BR + 2);
      if (freeAt(x, y + off)) { cue.x = x; cue.y = y + off; return; }
    }
    cue.x = x; cue.y = y;
  }

  // ---------- Turns ----------
  function beginTurn(note) {
    stopTimers();
    if (game.over) return showOver();
    phase = "placing";
    aim.show = false; aim.pulling = false; guide = null;
    if (game.ballInHand) placeCueDefault();
    var p = currentPlayer();
    var lead = note ? note + " " : "";
    if (p.computer) {
      setMessage(lead + p.name + " is thinking…");
      aiTimer = setTimeout(aiTurn, cfg.thinkMs);
    } else {
      setMessage(lead + p.name + ": " + turnHint(p));
    }
    updateHud();
    updatePower();
  }

  function turnHint(p) {
    var t = targetNow();
    var place = game.ballInHand ? "Place the cue ball behind the line, then aim. " : "";
    if (t === "open") return place + "Open table: hit any ball except the 8. The first ball you pocket picks your group.";
    if (t === "eight") return place + "Your balls are all in: hit the 8 ball, then pocket it.";
    return place + "Hit " + groupName(t === "solid" ? "solid" : "stripe") + " first. Pocket all of yours, then the 8.";
  }

  // ---------- Input ----------
  function toBoard(e) {
    var r = canvas.getBoundingClientRect();
    var fx = (e.clientX - r.left) / r.width;
    var fy = (e.clientY - r.top) / r.height;
    // Inverse of the canvas transform in sizeCanvas.
    if (portrait) return { x: W + M - fy * TW, y: fx * TH - M };
    return { x: fx * TW - M, y: fy * TH - M };
  }

  // The first object ball the cue ball hits along the ray. Returns { hitX, hitY, x, y, group, ok } or null.
  function firstContact(sx, sy, dx, dy) {
    var best = null, bestT = Infinity, rr = 2 * BR;
    world.live().forEach(function (b) {
      if (b.kind !== "ball") return;
      var fx = sx - b.x, fy = sy - b.y;
      var bq = 2 * (fx * dx + fy * dy);
      var cq = fx * fx + fy * fy - rr * rr;
      var disc = bq * bq - 4 * cq;
      if (disc < 0) return;
      var t = (-bq - Math.sqrt(disc)) / 2;
      if (t > 0 && t < bestT) { bestT = t; best = b; }
    });
    if (!best) return null;
    var target = targetNow();
    var ok = target === "open" ? best.group !== "eight"
      : target === "eight" ? best.group === "eight"
      : best.group === target;
    return { hitX: sx + dx * bestT, hitY: sy + dy * bestT, x: best.x, y: best.y, group: best.group, ok: ok };
  }

  function updateAim(p) {
    var dx = cue.x - p.x, dy = cue.y - p.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 3) {
      aim.show = false; aim.pulling = false; guide = null;
      updatePower();
      return;
    }
    aim.show = true;
    aim.pulling = true;
    aim.dirX = dx / len;
    aim.dirY = dy / len;
    aim.power = Math.min(1, len / cfg.pullFull);
    guide = firstContact(cue.x, cue.y, aim.dirX, aim.dirY);
    updatePower();
  }

  // Ball in hand: the cue ball can only go in the left quarter, and not on another ball.
  function tryPlace(p) {
    var x = Math.max(BR, Math.min(W * cfg.dZone, p.x));
    var y = Math.max(BR, Math.min(H - BR, p.y));
    if (freeAt(x, y)) {
      cue.x = x; cue.y = y;
    }
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!isHuman()) return;
    SND.unlock();
    var p = toBoard(e);
    canvas.setPointerCapture(e.pointerId);
    if (cue.alive && Math.hypot(p.x - cue.x, p.y - cue.y) < BR + 26) {
      drag = { mode: "aim" };
      updateAim(p);
    } else if (game.ballInHand && p.x <= W * cfg.dZone + 2) {
      drag = { mode: "place" };
      tryPlace(p);
    } else {
      drag = null;
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = toBoard(e);
    if (drag.mode === "place") tryPlace(p);
    else updateAim(p);
  });

  function endDrag() {
    if (!drag) return;
    if (drag.mode === "aim" && aim.pulling && aim.power > 0.05) {
      launch(aim.dirX * aim.power * cfg.maxSpeed, aim.dirY * aim.power * cfg.maxSpeed, aim.power);
    }
    drag = null;
    aim.show = false; aim.pulling = false; guide = null;
    updatePower();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () {
    drag = null; aim.show = false; aim.pulling = false; guide = null;
    updatePower();
  });

  // ---------- Shooting ----------
  function launch(vx, vy, power) {
    cue.vx = vx;
    cue.vy = vy;
    SND.flick(power);
    shotBefore = liveObjects();
    shotPocketed = [];
    shotScratch = false;
    shotTouch = null;
    phase = "moving";
    acc = 0;
    aim.show = false; aim.pulling = false; guide = null;
    setMessage("Shot!");
    updatePower();
  }

  function handleEvents() {
    world.drainEvents().forEach(function (ev) {
      if (ev.type === "hit") SND.hit(ev.speed);
      else if (ev.type === "wall") SND.wall(ev.speed);
      else if (ev.type === "pocket") {
        SND.pocket();
        shotPocketed.push(ev.body);
        if (ev.body.kind === "cue") shotScratch = true;
      } else if (ev.type === "contact") {
        if (shotTouch) return;
        var other = ev.a === cue ? ev.b : (ev.b === cue ? ev.a : null);
        if (other && other.kind === "ball") shotTouch = other;
      }
    });
  }

  function finishShot() {
    phase = "resolving";
    var pocketedObjects = shotPocketed.filter(function (b) { return b.kind === "ball"; });
    var res = RL.resolveShot(game, {
      pocketed: pocketedObjects,
      cueScratch: shotScratch,
      firstTouch: shotTouch,
      before: shotBefore
    });
    if (res.foul) SND.foul();
    if (game.over) {
      SND.win();
      phase = "over";
      setMessage(res.message);
      updateHud();
      setTimeout(showOver, 900);
      return;
    }
    beginTurn(res.message);
  }

  function frame(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (world && phase === "moving") {
      acc += dt;
      var steps = 0;
      while (acc >= cfg.stepS && steps < 12 && phase === "moving") {
        world.step(cfg.stepS);
        acc -= cfg.stepS;
        steps++;
        handleEvents();
        if (world.settled()) { finishShot(); break; }
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Computer ----------
  function aiTurn() {
    aiTimer = 0;
    if (phase !== "placing" || !currentPlayer().computer) return;
    if (game.ballInHand) placeCueDefault();
    var p = currentPlayer();
    var level = cfg.difficulty[p.difficulty] || cfg.difficulty.medium;
    var shot = AI.planShot(world.live(), targetNow(), cfg, Math.random, level) || { ang: 0, power: 0.3 };
    setMessage(p.name + " shoots…");
    aiTimer = setTimeout(function () {
      aiTimer = 0;
      if (phase !== "placing") return;
      launch(Math.cos(shot.ang) * shot.power * cfg.maxSpeed, Math.sin(shot.ang) * shot.power * cfg.maxSpeed, shot.power);
    }, cfg.launchMs);
  }

  // ---------- HUD ----------
  function updatePower() {
    var pct = aim.pulling ? Math.round(aim.power * 100) : 0;
    $("power-fill").style.width = pct + "%";
    $("power-text").textContent = pct + "%";
    var g = $("guide");
    if (!game || phase !== "placing" || currentPlayer().computer) {
      g.textContent = "";
      g.className = "guide";
      return;
    }
    if (guide) {
      var need = shortTarget(targetNow());
      g.textContent = "First hit: " + groupName(guide.group) + (guide.ok ? " ✓" : " ✗ (you must hit " + need + ")");
      g.className = "guide " + (guide.ok ? "ok" : "bad");
    } else if (aim.pulling) {
      g.textContent = "No ball on this line: the cue ball will miss.";
      g.className = "guide bad";
    } else {
      g.textContent = "Hit " + shortTarget(targetNow()) + " first.";
      g.className = "guide";
    }
  }

  function updateHud() {
    var sb = $("scoreboard");
    sb.textContent = "";
    game.players.forEach(function (p, i) {
      var card = document.createElement("div");
      card.className = "pl" + (i === game.turn && !game.over ? " is-turn" : "");
      var name = document.createElement("strong");
      name.textContent = p.name + (p.computer ? " (computer)" : "");
      var group = document.createElement("small");
      group.textContent = p.group ? (p.group === "solid" ? "Solids 1–7" : "Stripes 9–15") : "Open table";
      var score = document.createElement("span");
      score.className = "score";
      score.textContent = p.pocketed + "/7";
      var fouls = document.createElement("small");
      fouls.textContent = "Fouls: " + p.fouls;
      card.append(name, group, score, fouls);
      sb.appendChild(card);
    });
    $("turn-text").textContent = game.over ? "" : RL.possessive(currentPlayer().name) + " turn · hit " + shortTarget(targetNow());
  }

  function showOver() {
    phase = "over";
    stopTimers();
    $("winner-text").textContent = game.players[game.winner].name + " wins!";
    var list = $("results");
    list.textContent = "";
    game.players.forEach(function (p) {
      var li = document.createElement("li");
      li.textContent = p.name + ": " + p.pocketed + " of 7 pocketed, " + p.fouls + " foul" + (p.fouls === 1 ? "" : "s");
      list.appendChild(li);
    });
    $("over").hidden = false;
  }

  function showMenu() {
    stopTimers();
    phase = "menu";
    game = null; world = null; cue = null;
    $("over").hidden = true;
    $("game").hidden = true;
    $("menu").hidden = false;
  }

  function startMatch() {
    SND.unlock();
    var players = mode === "solo"
      ? [{ name: "You" }, { name: "Computer", computer: true, difficulty: $("difficulty").value }]
      : [{ name: "Player 1" }, { name: "Player 2" }];
    game = RL.createGame(players);
    var rk = PH.rack(cfg);
    world = PH.createWorld(cfg);
    cue = world.add(rk.cue);
    rk.balls.forEach(function (b) { world.add(b); });
    acc = 0; last = 0;
    aim.show = false; aim.pulling = false; guide = null;
    $("menu").hidden = true;
    $("game").hidden = false;
    $("over").hidden = true;
    sizeCanvas();
    beginTurn("");
  }

  // ---------- Drawing ----------
  function draw() {
    if (!game || $("game").hidden) return;
    var placing = phase === "placing" && game.ballInHand && !currentPlayer().computer;
    RD.draw(ctx, {
      cfg: cfg,
      balls: world.live(),
      cueBall: cue,
      aim: aim.show ? aim : null,
      pulling: aim.pulling,
      guide: guide,
      zone: placing,
      upright: portrait
    });
  }

  // Phone held upright: the table stands up (its long side runs down the screen), so it fills the screen.
  var portrait = false;
  function isPortrait() {
    return window.innerWidth < 700 && window.innerHeight > window.innerWidth;
  }

  function sizeCanvas() {
    portrait = isPortrait();
    var parent = canvas.parentElement;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (portrait) {
      // As wide as the screen allows, and no taller than about 62% of the screen height.
      var maxH = window.innerHeight * 0.62;
      var pw = Math.max(200, Math.min(parent.clientWidth || 360, maxH * TH / TW));
      var ph = Math.round(pw * TW / TH);
      canvas.style.width = Math.round(pw) + "px";
      canvas.style.height = ph + "px";
      canvas.width = Math.round(pw * dpr);
      canvas.height = Math.round(ph * dpr);
      // Table x runs down the screen (the cue end is at the bottom); table y runs left to right.
      var sp = canvas.width / TH;
      ctx.setTransform(0, -sp, sp, 0, sp * M, sp * (W + M));
    } else {
      canvas.style.width = "";
      canvas.style.height = "";
      var w = Math.max(240, Math.min(720, parent.clientWidth || 720));
      var h = Math.round(w * TH / TW);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(canvas.width / TW, 0, 0, canvas.height / TH, M * canvas.width / TW, M * canvas.height / TH);
    }
  }

  // ---------- Menu and buttons ----------
  Array.prototype.forEach.call(document.querySelectorAll(".mode"), function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.getAttribute("data-mode");
      Array.prototype.forEach.call(document.querySelectorAll(".mode"), function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      $("solo-options").hidden = mode !== "solo";
    });
  });

  $("start-btn").addEventListener("click", startMatch);
  $("quit-btn").addEventListener("click", showMenu);
  $("again-btn").addEventListener("click", showMenu);

  $("sound-btn").addEventListener("click", function () {
    SND.setMuted(!SND.isMuted());
    $("sound-btn").textContent = SND.isMuted() ? "Sound off" : "Sound on";
    $("sound-btn").setAttribute("aria-pressed", String(!SND.isMuted()));
  });
  $("vol").value = String(Math.round(SND.getVolume() * 100));
  $("vol").addEventListener("input", function () { SND.setVolume(Number(this.value) / 100); });
  $("sound-btn").textContent = SND.isMuted() ? "Sound off" : "Sound on";
  $("sound-btn").setAttribute("aria-pressed", String(!SND.isMuted()));

  window.addEventListener("resize", sizeCanvas);
  requestAnimationFrame(frame);

  // Read-only view for tests and debugging.
  window.BILLIARD = {
    debug: function () {
      return {
        phase: phase,
        turn: game ? game.turn : -1,
        ballInHand: game ? game.ballInHand : false,
        cue: cue ? { x: cue.x, y: cue.y, alive: cue.alive } : null,
        balls: world ? world.bodies().filter(function (b) { return b.kind === "ball"; }).map(function (b) {
          return { n: b.n, group: b.group, x: Math.round(b.x), y: Math.round(b.y), alive: b.alive };
        }) : [],
        aim: { show: aim.show, pulling: aim.pulling, dirX: aim.dirX, dirY: aim.dirY, power: aim.power },
        guide: guide ? { group: guide.group, ok: guide.ok } : null,
        players: game ? game.players.map(function (p) { return { name: p.name, group: p.group, pocketed: p.pocketed, fouls: p.fouls }; }) : [],
        over: game ? game.over : false,
        winner: game ? game.winner : -1
      };
    }
  };
})();
