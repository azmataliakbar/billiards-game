/* Billiards computer: picks a shot from the balls on the table. Pure logic, no DOM.
   Works in the browser (window.BilliardAI) and in Node.

   planShot(balls, target, cfg, rand, level):
   - target: "open" (any ball except the 8), "solid", "stripe" or "eight".
   - It looks for a pot: a target ball and a pocket, with a clear path for the ball into the pocket and for the cue ball
     to the aim point (the "ghost" position). It picks the shortest such shot.
   - If there is no pot, it plays a safety: a clear shot at the nearest legal ball, with little power, so the cue ball
     stays on the table and the first contact is legal.
   - level { angle, power } adds random error (Easy more, Expert less).
   Returns { ang, power, kind, target, pocket } where ang is in radians and power is 0..1, or null. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BilliardAI = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Distance from point (px, py) to the segment A-B.
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  }

  // True if no ball in `others` comes closer than `clearance` to the path A-B.
  function clearPath(ax, ay, bx, by, others, clearance) {
    return others.every(function (o) { return segDist(o.x, o.y, ax, ay, bx, by) >= clearance; });
  }

  function gauss(rand) {
    var u = Math.max(1e-9, rand());
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function planShot(balls, target, cfg, rand, level) {
    var cue = null;
    balls.forEach(function (b) { if (b.alive && b.kind === "cue") cue = b; });
    if (!cue) return null;

    var objs = balls.filter(function (b) { return b.alive && b.kind === "ball"; });
    var targets = objs.filter(function (b) {
      return target === "open" ? b.group !== "eight" : b.group === target;
    });
    if (!targets.length) return null;

    var r = cfg.ballR;
    var need = 2 * r * 1.1;   // clearance from another ball's centre to the path: a touch is 2r, keep a margin
    var best = null;

    targets.forEach(function (T) {
      var rest = objs.filter(function (o) { return o !== T; });
      cfg.pockets.forEach(function (P, pi) {
        var vx = P.x - T.x, vy = P.y - T.y;
        var dTP = Math.hypot(vx, vy);
        if (dTP < 1) return;
        var ux = vx / dTP, uy = vy / dTP;
        // Ghost position: where the cue ball must be when it touches T.
        var G = { x: T.x - ux * 2 * r, y: T.y - uy * 2 * r };
        if (G.x < r || G.x > cfg.width - r || G.y < r || G.y > cfg.height - r) return;
        if (!clearPath(T.x, T.y, P.x, P.y, rest, need)) return;
        if (!clearPath(cue.x, cue.y, G.x, G.y, rest, need)) return;
        var dCG = Math.hypot(G.x - cue.x, G.y - cue.y);
        var score = dCG + dTP;
        if (!best || score < best.score) best = { score: score, T: T, pi: pi, dCG: dCG, dTP: dTP, G: G };
      });
    });

    function finish(ang, power, kind, t, pocket) {
      ang += gauss(rand) * level.angle;
      power = clamp(power * (1 + gauss(rand) * level.power), 0.12, 1);
      return { ang: ang, power: power, kind: kind, target: t, pocket: pocket };
    }

    if (best) {
      // Speed needed to roll the cue ball and the object ball the required distance under the cloth friction.
      var v = cfg.friction * (best.dCG + best.dTP) * 1.15;
      var ang = Math.atan2(best.G.y - cue.y, best.G.x - cue.x);
      return finish(ang, clamp(v / cfg.maxSpeed, 0.15, 1), "pot", best.T.n, best.pi);
    }

    // Break: all 15 object balls are still racked, so hit the rack hard at the nearest ball.
    if (objs.length >= 15) {
      var front = null, frontD = Infinity;
      objs.filter(function (o) { return target !== "open" || o.group !== "eight"; }).forEach(function (o) {
        var d = Math.hypot(o.x - cue.x, o.y - cue.y);
        if (d < frontD) { frontD = d; front = o; }
      });
      return finish(Math.atan2(front.y - cue.y, front.x - cue.x), 0.9, "break", front.n, -1);
    }

    // Safety: the nearest target with a clear path, otherwise the nearest target at all.
    var near = null, nearD = Infinity, clearNear = null, clearD = Infinity;
    targets.forEach(function (T) {
      var d = Math.hypot(T.x - cue.x, T.y - cue.y);
      if (d < nearD) { nearD = d; near = T; }
      var others = objs.filter(function (o) { return o !== T; });
      if (d < clearD && clearPath(cue.x, cue.y, T.x, T.y, others, need)) { clearD = d; clearNear = T; }
    });
    var pick = clearNear || near;
    var angS = Math.atan2(pick.y - cue.y, pick.x - cue.x);
    // Gentle roll: enough speed to reach the ball, and no more, so the cue ball stays near the target.
    var dS = Math.hypot(pick.x - cue.x, pick.y - cue.y);
    var powerS = clamp(cfg.friction * dS * 1.1 / cfg.maxSpeed, 0.15, 0.6);
    return finish(angS, powerS, "safety", pick.n, -1);
  }

  return {
    segDist: segDist,
    clearPath: clearPath,
    planShot: planShot
  };
});
