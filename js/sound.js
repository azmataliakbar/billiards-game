/* Billiards sound: all sounds are generated with the Web Audio API, so there are no audio files and no network.
   Hits are louder the harder the pieces collide. A compressor keeps the loudest moments from distorting.
   Exposes window.BilliardSound. */
(function (root) {
  "use strict";

  var ctx = null;
  var master = null;
  var comp = null;
  var volume = 0.9;   // 0 to 1
  var muted = false;

  try {
    var saved = root.localStorage && root.localStorage.getItem("bil_vault_v1_sound");
    if (saved !== null) {
      var s = JSON.parse(saved);
      if (typeof s.volume === "number") volume = Math.max(0, Math.min(1, s.volume));
      muted = !!s.muted;
    }
  } catch (e) { /* storage blocked: keep the defaults */ }

  function save() {
    try {
      root.localStorage.setItem("bil_vault_v1_sound", JSON.stringify({ volume: volume, muted: muted }));
    } catch (e) { /* storage blocked: the setting lasts for this visit */ }
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * 1.4; // a little extra push: this game is meant to be heard
    master.connect(comp);
    comp.connect(ctx.destination);
    return ctx;
  }

  function out() {
    return ensure() ? master : null;
  }

  // Short tone with a fast attack and a decay.
  function tone(freq, dur, type, gain, delay, slideTo) {
    var g = out();
    if (!g) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var a = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    a.gain.setValueAtTime(0.0001, t0);
    a.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(a);
    a.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  // Filtered noise burst: the "clack" of pieces and the swoosh of a flick.
  function noise(dur, gain, delay, freq, sweepTo) {
    var g = out();
    if (!g) return;
    var t0 = ctx.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = 1.4;
    var a = ctx.createGain();
    a.gain.setValueAtTime(gain, t0);
    src.connect(f);
    f.connect(a);
    a.connect(g);
    src.start(t0);
  }

  var api = {
    // Call from a click or tap so browsers allow sound.
    unlock: function () { ensure(); },

    // Coin on coin. speed is the impact speed in board units per second.
    hit: function (speed) {
      var k = Math.max(0.2, Math.min(1, speed / 1100));
      noise(0.05, 0.9 * k, 0, 2400 + 900 * k, 1600);
      tone(1100 + 700 * k, 0.09, "triangle", 0.5 * k);
    },

    // Piece on a cushion: a low, softer tap.
    wall: function (speed) {
      var k = Math.max(0.15, Math.min(1, speed / 900));
      noise(0.06, 0.45 * k, 0, 900);
      tone(180 + 60 * k, 0.07, "sine", 0.35 * k);
    },

    // Piece dropping into a pocket: a falling tone with a rattle.
    pocket: function () {
      tone(900, 0.45, "sine", 0.55, 0, 180);
      noise(0.18, 0.5, 0.05, 1800, 500);
    },

    // The striker is flicked.
    flick: function (power) {
      var k = Math.max(0.2, Math.min(1, power));
      noise(0.16, 0.7 * k, 0, 600, 3200);
      tone(260 + 220 * k, 0.12, "square", 0.25 * k, 0.02, 520);
    },

    // A foul: a short buzz.
    foul: function () {
      tone(140, 0.55, "sawtooth", 0.45, 0, 90);
    },

    // The game is won: a rising arpeggio.
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone(f, 0.28, "triangle", 0.45, i * 0.11);
      });
    },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master) master.gain.value = muted ? 0 : volume * 1.4;
      save();
    },
    getVolume: function () { return volume; },

    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : volume * 1.4;
      save();
    },
    isMuted: function () { return muted; }
  };

  root.BilliardSound = api;
})(window);
