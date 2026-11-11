/* Billiards physics: balls on a cloth, ball-to-ball impulses, cushions, pockets, friction.
   Pure logic, no DOM. Works in the browser (window.BilliardPhysics) and in Node.
   Runs in fixed steps, so a shot plays the same on every device.
   Events: hit (ball on ball), wall (ball on cushion), pocket (ball falls in), contact (cue ball touches a ball). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BilliardPhysics = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Standard 8-ball rack, apex first. Corners hold one solid (6) and one stripe (14); 8 sits in the middle.
  var RACK = [[1], [9, 2], [10, 8, 3], [4, 11, 12, 5], [6, 13, 7, 15, 14]];

  function groupOf(n) {
    return n === 8 ? "eight" : n < 8 ? "solid" : "stripe";
  }

  function makeBall(kind, n, x, y, r) {
    return {
      kind: kind,            // "cue" or "ball"
      n: n || 0,             // ball number (0 for the cue ball)
      group: kind === "cue" ? "cue" : groupOf(n),
      x: x, y: y, vx: 0, vy: 0, r: r,
      alive: true,
      pocketed: false
    };
  }

  // Cue ball on the baulk line, object balls racked around the foot spot.
  function rack(cfg) {
    var r = cfg.ballR;
    var apexX = cfg.width * 0.7, midY = cfg.height / 2;
    var dx = 2 * r * 0.866 + 0.4, d = 2 * r + 0.6;
    var balls = [];
    RACK.forEach(function (row, i) {
      row.forEach(function (n, k) {
        var x = apexX + i * dx;
        var y = midY + (k - i / 2) * d;
        balls.push(makeBall("ball", n, x, y, r));
      });
    });
    return { cue: makeBall("cue", 0, cfg.width * 0.25, midY, r), balls: balls };
  }

  function createWorld(cfg) {
    var bodies = [];
    var events = [];

    function collide(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var min = a.r + b.r;
      if (d >= min) return;
      if (a.kind === "cue" || b.kind === "cue") events.push({ type: "contact", a: a, b: b });
      if (d === 0) { dx = 1; dy = 0; d = 1; }
      var nx = dx / d, ny = dy / d;
      // Separate the two balls so they do not stay overlapped.
      var overlap = min - d;
      a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
      b.x += nx * overlap / 2; b.y += ny * overlap / 2;
      // Impulse along the line of centres (equal masses).
      var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel >= 0) return;
      var j = -(1 + cfg.ballRest) * rel / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
      events.push({ type: "hit", speed: -rel });
    }

    function substep(h) {
      var live = bodies.filter(function (b) { return b.alive; });
      // Motion and friction.
      var f = Math.exp(-cfg.friction * h);
      live.forEach(function (b) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.vx *= f;
        b.vy *= f;
        if (Math.sqrt(b.vx * b.vx + b.vy * b.vy) < cfg.minSpeed) { b.vx = 0; b.vy = 0; }
      });
      // Ball on ball.
      for (var i = 0; i < live.length; i++) {
        for (var j = i + 1; j < live.length; j++) collide(live[i], live[j]);
      }
      // Pockets come before cushions, so a ball that reaches a pocket falls in.
      live.forEach(function (b) {
        if (!b.alive) return;
        cfg.pockets.forEach(function (p) {
          if (!b.alive) return;
          if (Math.hypot(b.x - p.x, b.y - p.y) < cfg.pocketR) {
            b.alive = false;
            b.pocketed = true;
            b.vx = 0; b.vy = 0;
            events.push({ type: "pocket", body: b });
          }
        });
      });
      // Cushions.
      live.forEach(function (b) {
        if (!b.alive) return;
        if (b.x < b.r) { b.x = b.r; reflectX(b); }
        else if (b.x > cfg.width - b.r) { b.x = cfg.width - b.r; reflectX(b); }
        if (b.y < b.r) { b.y = b.r; reflectY(b); }
        else if (b.y > cfg.height - b.r) { b.y = cfg.height - b.r; reflectY(b); }
      });
    }

    function reflectX(b) {
      var s = Math.abs(b.vx);
      b.vx = s * cfg.cushionRest * (b.vx < 0 ? 1 : -1);
      if (s > 5) events.push({ type: "wall", speed: s });
    }
    function reflectY(b) {
      var s = Math.abs(b.vy);
      b.vy = s * cfg.cushionRest * (b.vy < 0 ? 1 : -1);
      if (s > 5) events.push({ type: "wall", speed: s });
    }

    return {
      cfg: cfg,
      add: function (b) { bodies.push(b); return b; },
      bodies: function () { return bodies; },
      live: function () { return bodies.filter(function (b) { return b.alive; }); },
      drainEvents: function () { var e = events; events = []; return e; },
      settled: function () {
        return bodies.every(function (b) { return !b.alive || (b.vx === 0 && b.vy === 0); });
      },
      // Advances the world by dt seconds (two substeps, so fast balls cannot pass through each other).
      step: function (dt) {
        substep(dt / 2);
        substep(dt / 2);
      }
    };
  }

  return {
    RACK: RACK,
    groupOf: groupOf,
    makeBall: makeBall,
    rack: rack,
    createWorld: createWorld
  };
});
