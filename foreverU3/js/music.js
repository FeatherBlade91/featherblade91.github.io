/* ============================================================
 * 八音盒背景音乐 —— WebAudio 合成，无需音频文件
 * 温柔的 3/4 拍小华尔兹，循环播放
 * ============================================================ */
const MusicBox = (() => {
  let ctx = null;
  let master = null;
  let timer = null;
  let playing = false;

  // 旋律：[音符(Hz), 拍数]，0 表示休止
  const N = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
    C6: 1046.5,
  };
  // 一段简单的原创小旋律（C 大调，梦幻感）
  const MELODY = [
    [N.E5, 1], [N.G5, 1], [N.C6, 1.5], [N.B4, 0.5],
    [N.A5 ?? N.A4 * 2, 1], [N.G5, 1], [N.E5, 2],
    [N.D5, 1], [N.E5, 1], [N.G5, 1.5], [N.E5, 0.5],
    [N.C5, 3],
    [N.A4, 1], [N.C5, 1], [N.E5, 1.5], [N.D5, 0.5],
    [N.C5, 1], [N.D5, 1], [N.B4, 2],
    [N.C5, 1], [N.E5, 1], [N.G5, 1.5], [N.E5, 0.5],
    [N.C5, 3],
  ];
  // 低音伴奏（每小节一个音）
  const BASS = [N.C4, N.A4 / 2, N.F4, N.G4, N.C4, N.F4, N.G4, N.C4];

  const BEAT = 0.46; // 每拍秒数

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = (SITE_CONFIG.music && SITE_CONFIG.music.volume) || 0.5;
      // 简单混响感：延迟反馈
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.28;
      const fb = ctx.createGain(); fb.gain.value = 0.25;
      const wet = ctx.createGain(); wet.gain.value = 0.3;
      master.connect(ctx.destination);
      master.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function note(freq, when, dur, vol) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // 八音盒质感：加一点高频泛音
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine"; osc2.frequency.value = freq * 3;
    g2.gain.value = vol * 0.12;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vol, when + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, 1.2));
    osc.connect(env); osc2.connect(g2); g2.connect(env);
    env.connect(master);
    osc.start(when); osc2.start(when);
    osc.stop(when + dur + 1.4); osc2.stop(when + dur + 1.4);
  }

  function scheduleLoop() {
    let t = ctx.currentTime + 0.08;
    let bar = 0;
    for (const [freq, beats] of MELODY) {
      const dur = beats * BEAT;
      if (freq) note(freq, t, dur, 0.35);
      t += dur;
      bar += beats;
      while (bar >= 3) { bar -= 3; }
    }
    // 低音：按小节铺
    let bt = ctx.currentTime + 0.08;
    for (const b of BASS) {
      note(b, bt, 3 * BEAT, 0.16);
      bt += 3 * BEAT;
    }
    const total = MELODY.reduce((s, [, b]) => s + b, 0) * BEAT;
    timer = setTimeout(scheduleLoop, total * 1000 - 60);
  }

  function start() {
    if (playing) return;
    ensureCtx();
    playing = true;
    scheduleLoop();
  }

  function stop() {
    playing = false;
    if (timer) clearTimeout(timer);
    if (ctx) ctx.suspend();
  }

  return {
    toggle() {
      if (playing) { stop(); return false; }
      start(); return true;
    },
    get playing() { return playing; },
  };
})();
