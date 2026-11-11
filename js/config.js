/* Billiards (8-ball) configuration. Exposes window.BilliardConfig and module.exports for the Node tests.
   Table units: an 800 x 400 cloth with six pockets (four corners and two side middles). */
(function (root) {
  "use strict";
  var W = 800, H = 400;
  var cfg = {
    width: W,
    height: H,
    margin: 46,            // frame around the cloth, room for the rails
    ballR: 12,             // every ball, including the cue ball
    pocketR: 30,           // a ball whose centre is inside this radius falls in
    stepS: 1 / 120,        // fixed physics step, seconds
    friction: 1.1,         // speed decay per second on the cloth
    minSpeed: 6,           // below this a ball stops
    maxSpeed: 1300,        // cue ball speed at full power, units per second
    ballRest: 0.95,        // ball-to-ball bounce
    cushionRest: 0.72,     // cushion bounce
    pullFull: 150,         // pull back this far for full power
    thinkMs: 500,          // computer pause before it aims
    launchMs: 350,         // computer pause from aim to shot
    dZone: 0.25,           // ball in hand: the cue goes behind the head string (left quarter)
    difficulty: {
      easy:   { label: "Easy",   angle: 0.07, power: 0.22 },
      medium: { label: "Medium", angle: 0.035, power: 0.1 },
      hard:   { label: "Expert", angle: 0.01, power: 0.04 }
    },
    pockets: [
      { x: 0, y: 0 }, { x: W / 2, y: 0 }, { x: W, y: 0 },
      { x: 0, y: H }, { x: W / 2, y: H }, { x: W, y: H }
    ]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = cfg;
  root.BilliardConfig = cfg;
})(typeof window !== "undefined" ? window : globalThis);
