// 音はすべて Web Audio で合成する（音声ファイルなし）。
// 構成：BGM（オルガン風の持続音＋反復音型）、空調、ポッドの水音、端末の電子音、扉、足音、切替音。
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// BGM の和声（オリジナル）。pad は持続音、ost は反復音型（8分×6で1小節）。
const BARS = [
  { pad: [50, 57, 64, 65], ost: [74, 69, 77, 69, 76, 69] },
  { pad: [50, 57, 64, 65], ost: [74, 69, 77, 69, 81, 69] },
  { pad: [46, 53, 62, 69], ost: [74, 70, 77, 70, 74, 69] },
  { pad: [46, 53, 62, 69], ost: [74, 70, 77, 70, 81, 77] },
  { pad: [53, 60, 67, 69], ost: [72, 69, 77, 69, 79, 69] },
  { pad: [53, 60, 67, 69], ost: [72, 69, 77, 69, 84, 79] },
  { pad: [52, 60, 67, 69], ost: [72, 67, 76, 67, 79, 69] },
  { pad: [52, 59, 64, 69], ost: [71, 67, 76, 67, 74, 69] },
];
const STEP = 0.44, BAR = STEP * 6;

export function buildGraph(ctx) {
  const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const master = G(1.5);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .3;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = .5;   // 重低音を出さない
  master.connect(hp); hp.connect(comp); comp.connect(ctx.destination);

  // 残響（生成したインパルス）
  const len = Math.floor(ctx.sampleRate * 4.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; const n = (rnd() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 600 ? i / 600 : 1); lp += (n - lp) * (0.55 - t * 0.4); d[i] = lp; } }
  const conv = ctx.createConvolver(); conv.buffer = ir; const rev = G(1); rev.connect(conv); conv.connect(G(0.55, master));
  // 効果音・生活音のまとめ（音量つまみ）。残響への送りもここの後ろから取る。
  const se = G(1, master); se.connect(G(0.25, rev));

  // ノイズ（2秒ループ）
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const noise = (loop = true) => { const n = ctx.createBufferSource(); n.buffer = nb; n.loop = loop; return n; };
  const filt = (type, f, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const panner = (x, y, z, ref = 1.2, roll = 1.5) => { const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 30; p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; p.connect(se); return p; };

  const musicBus = G(0.9, master); const musicRev = G(0.75, rev); musicBus.connect(musicRev);
  const musicLP = filt('lowpass', 3200, .3); musicLP.connect(musicBus);

  // オルガン風の1音（倍音の足し合わせ）
  function organ(m, t, dur, vel, atk, rel, dest = musicLP, bright = 1) {
    const f = mtof(m), g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + atk); g.gain.setValueAtTime(vel, t + Math.max(atk, dur)); g.gain.linearRampToValueAtTime(0, t + Math.max(atk, dur) + rel); g.connect(dest);
    const parts = [[1, 1], [2, .42 * bright], [3, .2 * bright], [4, .1 * bright], [.5, f > 300 ? .22 : 0]];
    for (const [h, a] of parts) { if (!a) continue; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h; o.detune.value = (h * 37 % 7) - 3; const og = G(a / 1.9, g); o.connect(og); o.start(t); o.stop(t + Math.max(atk, dur) + rel + .05); }
  }
  // BGM を [from, to) の時間ぶん予約する。t0 は曲の開始時刻。
  function scheduleMusic(t0, from, to) {
    const first = Math.max(0, Math.ceil((from - t0) / STEP - 1e-6));
    for (let k = first; t0 + k * STEP < to; k++) {
      const t = t0 + k * STEP, bar = Math.floor(k / 6), st = k % 6, B = BARS[bar % BARS.length];
      const cyc = (bar % 32) / 32;                                   // 約84秒で一巡する強弱
      const swell = Math.pow(Math.max(0, Math.sin(cyc * Math.PI)), 1.4);   // 0→1→0
      if (st === 0 && bar % 2 === 0) for (const [i, m] of B.pad.entries()) organ(m, t, BAR * 2 - 1.2, (i === 0 ? .085 : .06) * (.55 + .45 * swell), 1.8, 2.6, musicLP, .6);
      const ov = swell * swell * .075; if (ov > .004) organ(B.ost[st], t, .12, ov * (st === 0 ? 1.25 : st % 2 ? .7 : 1), .012, .5, musicLP, .8 + swell * .5);
      if (st === 0 && swell > .75 && bar % 2 === 0) organ(B.pad[3] + 12, t, BAR * 2 - 1, .028, 1.5, 2.5, musicLP, .5);
    }
  }

  // 空調（ごく薄い）
  const air = noise(); const airG = G(0.011, se); air.connect(filt('lowpass', 520, .4)).connect(filt('highpass', 140, .5)).connect(airG); air.start();

  // ポッドの水音：循環の細い流れ（常時）＋シャワー（切替）
  const podP = panner(0, 1.2, 0, 1.0, 1.7);
  const trickle = noise(); const trG = G(0.05, podP); trickle.connect(filt('bandpass', 1500, .8)).connect(filt('highpass', 600, .7)).connect(trG); trickle.playbackRate.value = .93; trickle.start(.3);
  const wob = ctx.createOscillator(); wob.frequency.value = .37; const wobG = G(0.018, trG.gain); wob.connect(wobG); wob.start();
  const shower = noise(); const shG = G(0, podP); const shLP = filt('lowpass', 7000, .3); shower.connect(filt('highpass', 1400, .5)).connect(shLP).connect(shG); shower.start(.7);
  const patter = noise(); const paG = G(0, podP); patter.connect(filt('bandpass', 520, 1.2)).connect(paG); patter.playbackRate.value = .7; patter.start(1.1);
  function drip(t, level) {   // 水のはねる音：短い正弦の上がり調子
    const o = ctx.createOscillator(), g = ctx.createGain(), f = 700 + rnd() * 1700; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.35 + rnd() * .5), t + .05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level * (.4 + rnd() * .6), t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .055 + rnd() * .04); o.connect(g); g.connect(podP); o.start(t); o.stop(t + .12);
  }

  const termP = panner(0, 1.3, 0, 1.0, 1.6), doorP = panner(0, 1.2, 0, 1.5, 1.2), tableP = panner(0, 1.1, 0, 1.6, 1.0);
  function blip(t, f, dest, v = .03, dur = .07) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .02); }
  function sweep(t, f0, f1, dur, v, dest, q = 1.2) { const n = noise(false), b = filt('bandpass', f0, q), g = ctx.createGain(); b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .25); g.gain.linearRampToValueAtTime(0, t + dur); n.connect(b).connect(g); g.connect(dest); n.start(t, rnd()); n.stop(t + dur + .05); }

  return {
    master, se, scheduleMusic, organ, blip, sweep, drip, rnd, G,
    podP, termP, doorP, tableP, shG, paG, shLP, trG, musicBus,
    // 粒子の形が変わるときの音：細かい粒の上昇（消灯は下降）＋ノイズの掃引
    holo(form) {
      const t = ctx.currentTime + .02, up = form !== 3, sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], base = 72 + (form % 3) * 2;
      for (let i = 0; i < 16; i++) { const k = up ? i : 15 - i, m = base + sc[Math.min(sc.length - 1, Math.floor(k * .7 + rnd() * 1.5))]; blip(t + i * .034 + rnd() * .012, mtof(m), tableP, .022 * (up ? .5 + i / 22 : 1 - i / 22), .09 + rnd() * .12); }
      sweep(t, up ? 700 : 5200, up ? 5600 : 500, .7, .045, tableP, 2.2);
      if (up) organ(base - 12, t + .45, .2, .05, .05, 1.6, tableP, 1.2);
    },
    mood(i) { const t = ctx.currentTime + .02, m = [69, 76, 62][i] ?? 69; blip(t, 1400, termP, .02, .04); organ(m, t + .05, .25, .07, .03, 1.8, termP, 1); organ(m + 7, t + .19, .25, .05, .03, 2.0, termP, 1); },
    door(opening) { const t = ctx.currentTime + .01; opening ? sweep(t, 500, 2600, .55, .1, doorP, .9) : sweep(t, 2400, 420, .6, .09, doorP, .9); blip(t + (opening ? 0 : .52), 110, doorP, .12, .12); blip(t, opening ? 880 : 660, doorP, .018, .09); },
    shower(on) { const t = ctx.currentTime; shG.gain.cancelScheduledValues(t); shG.gain.setTargetAtTime(on ? .085 : 0, t, on ? .25 : .5); paG.gain.setTargetAtTime(on ? .05 : 0, t, on ? .4 : .5); blip(t, on ? 990 : 740, podP, .03, .08); if (on) sweep(t, 300, 1800, .35, .05, podP, .8); },
    step(soft) { const t = ctx.currentTime, n = noise(false), b = filt('lowpass', soft ? 420 : 900, .6), g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(soft ? .05 : .075, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + (soft ? .11 : .08)); n.connect(filt('highpass', 130, .5)).connect(b).connect(g); g.connect(se); n.start(t, rnd()); n.stop(t + .2); if (!soft) blip(t, 1700 + rnd() * 500, se, .004, .02); },
  };
}

export function createAudio() {
  const vol = { bgm: 1, se: 1 };
  let ctx = null, A = null, on = true, t0 = 0, sched = 0, timer = 0, nextDrip = 0, nextBeep = 0, showerOn = false;
  const api = {
    get ready() { return !!ctx; }, get on() { return on; },
    init(pos) {
      if (ctx) { if (ctx.state === 'suspended' && on) ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ctx = new AC(); A = buildGraph(ctx); } catch (e) { ctx = null; return; }
      for (const k of ['podP', 'termP', 'doorP', 'tableP']) { const p = pos[k]; A[k].positionX.value = p.x; A[k].positionY.value = p.y; A[k].positionZ.value = p.z; }
      A.musicBus.gain.value = .9 * vol.bgm; A.se.gain.value = vol.se;
      A.master.gain.setValueAtTime(0, ctx.currentTime); A.master.gain.linearRampToValueAtTime(on ? 1.5 : 0, ctx.currentTime + 2.5);
      t0 = ctx.currentTime + 1.2; sched = t0; nextDrip = ctx.currentTime + 1; nextBeep = ctx.currentTime + 6;
      const pump = () => {
        if (!ctx || ctx.state !== 'running') return; const now = ctx.currentTime;
        if (sched < now) { t0 += Math.ceil((now - sched) / (BAR * 2)) * BAR * 2; sched = now; }      // 止まっていた分は飛ばす
        if (sched < now + 1.2) { A.scheduleMusic(t0, sched, now + 1.2); sched = now + 1.2; }
        while (nextDrip < now + .3) { A.drip(Math.max(now, nextDrip), showerOn ? .02 : .014); nextDrip += showerOn ? .03 + A.rnd() * .09 : .09 + A.rnd() * .5; }
        if (nextBeep < now) { const f = [1320, 1760, 1480][Math.floor(A.rnd() * 3)]; A.blip(now + .02, f, A.termP, .02, .06); if (A.rnd() < .5) A.blip(now + .13, f * 1.5, A.termP, .016, .06); nextBeep = now + 7 + A.rnd() * 11; }
      };
      timer = setInterval(pump, 200); pump();
      document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : (on && ctx.resume()); });
    },
    // 音量（1 が基準の 100%）
    volume(kind, v) { vol[kind] = v; if (!ctx) return; (kind === 'bgm' ? A.musicBus.gain : A.se.gain).setTargetAtTime(kind === 'bgm' ? .9 * v : v, ctx.currentTime, .05); },
    get vol() { return vol; },
    toggle() { on = !on; if (ctx) { if (on) ctx.resume(); A.master.gain.setTargetAtTime(on ? 1.5 : 0, ctx.currentTime, .15); } return on; },
    listener(x, y, z, yaw) {
      if (!ctx) return; const L = ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    },
    holo(f) { ctx && on && A.holo(f); }, mood(i) { ctx && on && A.mood(i); }, door(o) { ctx && on && A.door(o); }, step(s) { ctx && on && A.step(s); },
    shower(v) { showerOn = v; ctx && A.shower(v); },
  };
  return api;
}
