// Tests for the billiards physics, rules and computer. Run with: node --test tests/billiards.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const cfg = require("../js/config.js");
const PH = require("../js/physics.js");
const RL = require("../js/rules.js");
const AI = require("../js/ai.js");

const H = Math.PI / 2;

function world() { return PH.createWorld(cfg); }
function ball(kind, n, x, y, vx, vy) {
  const b = PH.makeBall(kind, n, x, y, cfg.ballR);
  b.vx = vx || 0; b.vy = vy || 0;
  return b;
}
function runUntilSettled(w, limit) {
  for (let i = 0; i < (limit || 4000); i++) {
    w.step(cfg.stepS);
    if (w.settled()) return i;
  }
  return -1;
}

// ---------- Rack ----------
test("the rack has 15 object balls numbered 1 to 15, one cue ball", () => {
  const r = PH.rack(cfg);
  assert.strictEqual(r.balls.length, 15);
  const nums = r.balls.map(b => b.n).sort((a, b) => a - b);
  assert.deepStrictEqual(nums, Array.from({ length: 15 }, (_, i) => i + 1));
  assert.strictEqual(r.cue.kind, "cue");
});

test("the rack has 7 solids, 7 stripes and the 8 ball", () => {
  const r = PH.rack(cfg);
  const count = g => r.balls.filter(b => b.group === g).length;
  assert.strictEqual(count("solid"), 7);
  assert.strictEqual(count("stripe"), 7);
  assert.strictEqual(count("eight"), 1);
});

test("the balls in the rack do not overlap", () => {
  const r = PH.rack(cfg);
  const all = r.balls.concat([r.cue]);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      assert.ok(d >= 2 * cfg.ballR - 0.5, "overlap between balls " + i + " and " + j + ": " + d);
    }
  }
});

// ---------- Physics ----------
test("a moving ball hits a resting ball and hands over its speed", () => {
  const w = world();
  const a = w.add(ball("cue", 0, 200, 200, 600, 0));
  const b = w.add(ball("ball", 3, 240, 200));
  w.step(cfg.stepS);
  // The cue ball has to get close enough to touch first; step until the contact is over.
  for (let i = 0; i < 60; i++) w.step(cfg.stepS);
  assert.ok(b.vx > 0, "the object ball should move right");
  assert.ok(a.vx < b.vx, "the cue ball should be slower than the object ball after a head-on hit");
});

test("a ball rolling into a corner pocket falls in", () => {
  const w = world();
  const b = w.add(ball("ball", 1, 20, 20));
  w.step(cfg.stepS);
  assert.strictEqual(b.alive, false);
  assert.strictEqual(b.pocketed, true);
  const ev = w.drainEvents().find(e => e.type === "pocket");
  assert.ok(ev && ev.body === b, "a pocket event for the ball");
});

test("a ball far from every pocket stays on the table", () => {
  const w = world();
  const b = w.add(ball("ball", 1, 400, 200));
  w.step(cfg.stepS);
  assert.strictEqual(b.alive, true);
});

test("a ball bounces back from the cushion and stays inside the table", () => {
  const w = world();
  const b = w.add(ball("ball", 1, 200, 200, -500, 0));
  for (let i = 0; i < 400; i++) w.step(cfg.stepS);
  assert.ok(b.x >= cfg.ballR - 0.01, "x inside the cushion: " + b.x);
  assert.ok(b.vx > 0 || b.x > 200, "the ball bounced back to the right");
});

test("a ball slows down and stops on the cloth", () => {
  const w = world();
  const b = w.add(ball("ball", 1, 400, 200, 800, 0));
  const steps = runUntilSettled(w, 6000);
  assert.ok(steps > 0, "every ball should stop");
  assert.strictEqual(b.vx, 0);
  assert.ok(b.x > 400 + 100, "the ball rolled a fair distance: " + b.x);
});

test("the cue ball reports the first object ball it touches", () => {
  const w = world();
  w.add(ball("cue", 0, 200, 200, 900, 0));
  w.add(ball("ball", 5, 260, 200));
  let contact = null;
  for (let i = 0; i < 200 && !contact; i++) {
    w.step(cfg.stepS);
    w.drainEvents().forEach(e => { if (e.type === "contact" && !contact) contact = e; });
  }
  assert.ok(contact, "a contact event");
  const other = contact.a.kind === "cue" ? contact.b : contact.a;
  assert.strictEqual(other.n, 5);
});

// ---------- Rules ----------
function balls(list) { return list.map(([n]) => ({ n, group: PH.groupOf(n), kind: "ball" })); }
function obj(n) { return { n, group: PH.groupOf(n), kind: "ball" }; }

test("the first group ball pocketed on an open table gives that player the group", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  const res = RL.resolveShot(g, { pocketed: [obj(3)], cueScratch: false, firstTouch: obj(3), before: balls([[1], [3], [9], [8]]) });
  assert.strictEqual(res.foul, false);
  assert.strictEqual(g.players[0].group, "solid", "ball 3 is a solid");
  assert.strictEqual(g.players[1].group, "stripe");
  assert.strictEqual(res.continues, true, "pocketing your own ball keeps the turn");
  assert.strictEqual(g.turn, 0);
});

test("a legal shot that pockets nothing passes the turn", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: false, firstTouch: obj(1), before: balls([[1], [9]]) });
  assert.strictEqual(res.foul, false);
  assert.strictEqual(res.continues, false);
  assert.strictEqual(g.turn, 1);
});

test("hitting the other group first is a foul, the turn passes and the cue ball is placed by the opponent", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: false, firstTouch: obj(9), before: balls([[1], [9]]) });
  assert.strictEqual(res.foul, true);
  assert.strictEqual(g.players[0].fouls, 1);
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.ballInHand, true);
});

test("a shot that touches no ball is a foul", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: false, firstTouch: null, before: balls([[1]]) });
  assert.strictEqual(res.foul, true);
  assert.match(res.reason, /no ball/);
});

test("the cue ball pocketed is a foul and the opponent gets ball in hand", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: true, firstTouch: obj(1), before: balls([[1]]) });
  assert.strictEqual(res.foul, true);
  assert.strictEqual(g.ballInHand, true);
});

test("on an open table the 8 ball may not be hit first", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: false, firstTouch: obj(8), before: balls([[1], [8]]) });
  assert.strictEqual(res.foul, true);
  assert.match(res.reason, /8 ball/);
});

test("with the group cleared, the 8 ball must be hit first", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [], cueScratch: false, firstTouch: obj(1), before: balls([[9], [8]]) });
  assert.strictEqual(res.foul, true);
  assert.match(res.reason, /8 ball first/);
});

test("pocketing the 8 ball after clearing the group, with a legal first touch, wins", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [obj(8)], cueScratch: false, firstTouch: obj(8), before: balls([[8], [9]]) });
  assert.strictEqual(res.foul, false);
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, 0);
});

test("pocketing the 8 ball early loses the game", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  const res = RL.resolveShot(g, { pocketed: [obj(8)], cueScratch: false, firstTouch: obj(1), before: balls([[1], [8]]) });
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, 1);
  assert.match(res.message, /too early/);
});

test("pocketing the 8 ball on a foul loses the game", () => {
  const g = RL.createGame([{ name: "A" }, { name: "B" }]);
  g.players[0].group = "solid";
  g.players[1].group = "stripe";
  RL.resolveShot(g, { pocketed: [obj(8)], cueScratch: false, firstTouch: obj(9), before: balls([[9], [8]]) });
  assert.strictEqual(g.winner, 1);
});

test("the target is the group, then the 8 ball once the group is cleared", () => {
  const p = { group: "solid" };
  assert.strictEqual(RL.targetFor(p, [obj(1), obj(8)]), "solid");
  assert.strictEqual(RL.targetFor(p, [obj(8), obj(9)]), "eight");
  assert.strictEqual(RL.targetFor({ group: null }, [obj(1)]), "open");
});

// ---------- Computer ----------
test("the computer pots a straight shot and aims at the pocket", () => {
  // A solid straight above the cue ball and the top middle pocket straight above the solid.
  const cue = PH.makeBall("cue", 0, 400, 300, cfg.ballR);
  const target = PH.makeBall("ball", 1, 400, 60, cfg.ballR);
  const shot = AI.planShot([cue, target], "solid", cfg, () => 0.5, cfg.difficulty.hard);
  assert.ok(shot, "a shot");
  assert.strictEqual(shot.kind, "pot");
  assert.ok(Math.abs(shot.ang + H) < 0.1, "aims straight up: " + shot.ang);
  assert.ok(shot.power > 0 && shot.power <= 1);
});

test("the computer plays a safety when there is no pocket to aim at", () => {
  // Same table without pockets: no pot is possible, so the computer must play a safety.
  const noPockets = Object.assign({}, cfg, { pockets: [] });
  const cue = PH.makeBall("cue", 0, 400, 300, cfg.ballR);
  const blocker = PH.makeBall("ball", 9, 400, 200, cfg.ballR);
  const target = PH.makeBall("ball", 2, 400, 120, cfg.ballR);
  const shot = AI.planShot([cue, blocker, target], "solid", noPockets, () => 0.5, cfg.difficulty.hard);
  assert.ok(shot);
  assert.strictEqual(shot.kind, "safety");
});

test("the computer has no shot when it has no ball to hit", () => {
  const cue = PH.makeBall("cue", 0, 400, 300, cfg.ballR);
  assert.strictEqual(AI.planShot([cue], "solid", cfg, () => 0.5, cfg.difficulty.hard), null);
});

test("on a full rack the computer breaks hard, and never at the 8 ball", () => {
  const r = PH.rack(cfg);
  const list = [r.cue].concat(r.balls);
  const shot = AI.planShot(list, "open", cfg, () => 0.5, cfg.difficulty.hard);
  assert.ok(shot);
  assert.strictEqual(shot.kind, "break");
  assert.ok(shot.power >= 0.8, "a hard break: " + shot.power);
  assert.notStrictEqual(shot.target, 8);
});

test("the computer's Easy shots are less accurate than Expert shots on the same table", () => {
  const cue = PH.makeBall("cue", 0, 400, 300, cfg.ballR);
  const target = PH.makeBall("ball", 1, 400, 60, cfg.ballR);
  const hard = AI.planShot([cue, target], "solid", cfg, () => 0.5, cfg.difficulty.hard);
  const easy = AI.planShot([cue, target], "solid", cfg, () => 0.5, cfg.difficulty.easy);
  // With the same random source, the Easy angle error is about seven times the Expert error.
  assert.ok(Math.abs(easy.ang - (-H)) > Math.abs(hard.ang - (-H)) * 3, "Easy aims further off: " + easy.ang + " vs " + hard.ang);
});
