"use strict";
// Procedural sound: everything is synthesized with WebAudio, no audio files.

WC.Audio = (function () {
  var ctx = null;
  var master = null;
  var crowdGain = null;
  var muted = false;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    startCrowd();
    return true;
  }

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      // brownish noise: smoother, crowd-like
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  function startCrowd() {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 700;
    filt.Q.value = 0.35;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.05;
    // slow swell so it breathes
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(crowdGain.gain);
    lfo.start();
    src.connect(filt).connect(crowdGain).connect(master);
    src.start();
  }

  function crowdSwell(amount, upTime, downTime) {
    if (!ctx) return;
    var now = ctx.currentTime;
    var g = crowdGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(amount, now + upTime);
    g.exponentialRampToValueAtTime(0.05, now + upTime + downTime);
  }

  function blip(freq, dur, type, vol, when) {
    var t = (when || 0) + ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = type || "square";
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function thud(vol, freq) {
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq || 140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.15);

    var n = ctx.createBufferSource();
    n.buffer = noiseBuffer(0.08);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    var f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 900;
    n.connect(f).connect(ng).connect(master);
    n.start(t);
  }

  function whistleBlast(when, dur) {
    var t = ctx.currentTime + when;
    var o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 2350;
    var vib = ctx.createOscillator();
    vib.frequency.value = 38;
    var vibGain = ctx.createGain();
    vibGain.gain.value = 130;
    vib.connect(vibGain).connect(o.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
    vib.start(t); vib.stop(t + dur + 0.05);
  }

  var api = {
    unlock: function () { ensure(); },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    isMuted: function () { return muted; },

    kick: function (power) { if (ensure()) thud(0.25 + power * 0.3, 120 + power * 60); },
    tackle: function () { if (ensure()) thud(0.3, 90); },
    block: function () { if (ensure()) thud(0.2, 100); },
    save: function () { if (ensure()) { thud(0.28, 110); crowdSwell(0.16, 0.15, 1.2); } },
    post: function () {
      if (!ensure()) return;
      blip(1250, 0.5, "triangle", 0.3);
      blip(2500, 0.3, "sine", 0.12);
      crowdSwell(0.2, 0.12, 1.4);
    },
    ooh: function () { if (ensure()) crowdSwell(0.22, 0.2, 1.6); },
    whistle: function () { if (ensure()) whistleBlast(0, 0.55); },
    whistleEnd: function () {
      if (!ensure()) return;
      whistleBlast(0, 0.3); whistleBlast(0.4, 0.3); whistleBlast(0.8, 0.9);
    },
    goal: function () {
      if (!ensure()) return;
      crowdSwell(0.55, 0.25, 4.5);
      [523, 659, 784, 1047].forEach(function (f, i) { blip(f, 0.35, "square", 0.12, 0.08 * i); });
    },
    ui: function () { if (ensure()) blip(880, 0.07, "square", 0.1); },
    uiBig: function () { if (ensure()) { blip(660, 0.1, "square", 0.12); blip(990, 0.18, "square", 0.12, 0.07); } },
  };
  return api;
})();
