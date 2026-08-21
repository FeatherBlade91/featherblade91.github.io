/* ============================================================
 * 背景音乐 —— 播放 music/bgm.mp3，循环播放
 * ============================================================ */
const MusicBox = (() => {
  let audio = null;
  let playing = false;

  function ensureAudio() {
    if (!audio) {
      audio = new Audio("music/bgm.mp3");
      audio.loop = true;
      audio.volume = (SITE_CONFIG.music && SITE_CONFIG.music.volume) || 0.5;
    }
  }

  function start() {
    if (playing) return;
    ensureAudio();
    playing = true;
    audio.play().catch(() => { playing = false; });
  }

  function stop() {
    playing = false;
    if (audio) audio.pause();
  }

  return {
    toggle() {
      if (playing) { stop(); return false; }
      start(); return true;
    },
    get playing() { return playing; },
  };
})();
