/* Billiards renderer: draws the top view on a canvas. Pure drawing, no game rules.
   The canvas transform maps table units (0..width, 0..height) with the frame margin around them.
   The aim line is black and dashed. It runs from the cue ball to the first ball it will hit, or to the cushion.
   Exposes window.BilliardRender. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BilliardRender = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Standard 8-ball colours for balls 1 to 7. Stripes 9 to 15 use the same colours with a white band.
  var COLOURS = {
    1: "#f2c230", 2: "#2a5fb5", 3: "#d6333f", 4: "#6b3fa0",
    5: "#f0782c", 6: "#2e8b57", 7: "#7a2a2a", 8: "#111111"
  };

  function ballFill(n) {
    return COLOURS[n > 8 ? n - 8 : n];
  }

  // Distance from (x, y) along (dx, dy) to the cushion of the table.
  function distToEdge(cfg, x, y, dx, dy) {
    var t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (cfg.width - x) / dx);
    else if (dx < -1e-6) t = Math.min(t, (0 - x) / dx);
    if (dy > 1e-6) t = Math.min(t, (cfg.height - y) / dy);
    else if (dy < -1e-6) t = Math.min(t, (0 - y) / dy);
    return isFinite(t) ? Math.max(0, t) : 0;
  }

  function drawBall(ctx, b) {
    var r = b.r;
    ctx.save();
    if (b.kind === "cue") {
      ctx.fillStyle = "#fbf8f0";
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.stroke();
    } else if (b.n > 8) {
      // Stripe: white ball with a coloured band across the middle.
      ctx.fillStyle = "#fbf8f0";
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = ballFill(b.n);
      ctx.fillRect(b.x - r, b.y - r * 0.5, 2 * r, r);
      ctx.restore();
    } else {
      ctx.fillStyle = ballFill(b.n);
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (b.kind === "ball") {
      ctx.fillStyle = "#fbf8f0";
      ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = "bold " + Math.round(r * 0.8) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.n), b.x, b.y + 0.5);
    }
    ctx.restore();
  }

  // view: { cfg, balls, aim (or null), pulling, guide, zone, cueBall }
  function draw(ctx, view) {
    var cfg = view.cfg;
    var W = cfg.width, H = cfg.height, M = cfg.margin;
    ctx.save();
    ctx.clearRect(-M, -M, W + 2 * M, H + 2 * M);

    // Wooden frame.
    var wood = ctx.createLinearGradient(-M, -M, W + M, H + M);
    wood.addColorStop(0, "#8a5a2b");
    wood.addColorStop(1, "#4a2a12");
    ctx.fillStyle = wood;
    ctx.fillRect(-M, -M, W + 2 * M, H + 2 * M);

    // Cloth.
    var felt = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
    felt.addColorStop(0, "#23794a");
    felt.addColorStop(1, "#135433");
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);

    // Baulk line and the D (where the cue ball is placed after a foul).
    var dx = W * cfg.dZone;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(dx, H / 2, 60, Math.PI / 2, Math.PI * 1.5, false); ctx.stroke();
    ctx.setLineDash([]);
    if (view.zone) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, dx, H);
    }

    // Pockets.
    cfg.pockets.forEach(function (p) {
      var g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, cfg.pocketR);
      g.addColorStop(0, "#000");
      g.addColorStop(1, "#2a1a0c");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, cfg.pocketR, 0, Math.PI * 2); ctx.fill();
    });

    // Balls.
    view.balls.forEach(function (b) { drawBall(ctx, b); });

    // Cue stick, pulled back from the cue ball while aiming.
    var cue = view.cueBall;
    if (view.aim && view.pulling && cue && cue.alive) {
      var a = view.aim;
      var pull = a.power * cfg.pullFull;
      var r = cfg.ballR;
      var x1 = cue.x - a.dirX * (r + 6 + pull), y1 = cue.y - a.dirY * (r + 6 + pull);
      var x2 = cue.x - a.dirX * (r + 4), y2 = cue.y - a.dirY * (r + 4);
      ctx.strokeStyle = "#c99a5b";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "#5a3a1c";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + a.dirX * 40, y1 + a.dirY * 40); ctx.stroke();
    }

    // Aim line: black, dashed, to the first ball hit or to the cushion. Darker with more power.
    if (view.aim && cue && cue.alive) {
      var ag = view.aim;
      var len = view.guide
        ? Math.hypot(view.guide.hitX - cue.x, view.guide.hitY - cue.y)
        : distToEdge(cfg, cue.x, cue.y, ag.dirX, ag.dirY);
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = "rgba(0, 0, 0, " + (0.6 + 0.4 * ag.power).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(cue.x + ag.dirX * len, cue.y + ag.dirY * len);
      ctx.stroke();
      ctx.setLineDash([]);
      if (view.guide) {
        var g2 = view.guide;
        ctx.strokeStyle = g2.ok ? "rgba(122, 240, 176, 0.95)" : "rgba(255, 77, 141, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g2.x, g2.y, cfg.ballR + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.restore();
  }

  return { draw: draw, distToEdge: distToEdge, ballFill: ballFill };
});
