/* ============================================================
 * 背景音乐播放器：右上角按钮只负责展开，播放控制统一在面板内完成。
 * ============================================================ */
const MusicBox = (() => {
  const TRACKS = [
    { title: "Lost Stars", artist: "Adam Levine", src: "music/bgm.mp3" },
    { title: "Free Loop", artist: "Daniel Powter", src: "music/Daniel Powter - Free Loop (1).mp3" },
    { title: "Fuerteventura", artist: "Russian Red", src: "music/Russian Red - Fuerteventura.mp3" },
    { title: "我的名字", artist: "焦迈奇", src: "music/焦迈奇 - 我的名字.mp3" },
  ];

  let audio = null;
  let index = 0;
  let seeking = false;
  let refs = null;

  function ensureAudio() {
    if (audio) return;
    audio = new Audio(TRACKS[index].src);
    audio.preload = "metadata";
    audio.volume = SITE_CONFIG.music.volume ?? 0.5;
    audio.addEventListener("play", syncPlayback);
    audio.addEventListener("pause", syncPlayback);
    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("durationchange", syncProgress);
    audio.addEventListener("ended", () => changeTrack(1, true));
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    return mins + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  }

  function syncTrack() {
    const track = TRACKS[index];
    refs.position.textContent = String(index + 1).padStart(2, "0") + " / " + String(TRACKS.length).padStart(2, "0");
    refs.title.textContent = track.title;
    refs.artist.textContent = track.artist;
  }

  function syncPlayback() {
    const playing = audio && !audio.paused;
    refs.toggle.classList.toggle("playing", playing);
    refs.panel.classList.toggle("playing", playing);
    refs.play.textContent = playing ? "Ⅱ" : "▶";
    refs.play.setAttribute("aria-label", playing ? "暂停" : "播放");
    refs.play.title = playing ? "暂停" : "播放";
  }

  function syncProgress() {
    if (!audio || seeking) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const ratio = duration ? audio.currentTime / duration : 0;
    refs.progress.value = Math.round(ratio * 1000);
    refs.progress.style.setProperty("--music-progress", (ratio * 100).toFixed(2) + "%");
    refs.current.textContent = formatTime(audio.currentTime);
    refs.duration.textContent = formatTime(duration);
  }

  function play() {
    ensureAudio();
    audio.play().catch(syncPlayback);
  }

  function togglePlayback() {
    ensureAudio();
    if (audio.paused) play();
    else audio.pause();
  }

  function changeTrack(step, forcePlay) {
    ensureAudio();
    const keepPlaying = forcePlay || !audio.paused;
    index = (index + step + TRACKS.length) % TRACKS.length;
    audio.src = TRACKS[index].src;
    audio.load();
    syncTrack();
    syncProgress();
    if (keepPlaying) play();
    else syncPlayback();
  }

  function setOpen(open) {
    refs.panel.classList.toggle("open", open);
    refs.panel.setAttribute("aria-hidden", String(!open));
    refs.toggle.setAttribute("aria-expanded", String(open));
    refs.toggle.setAttribute("aria-label", open ? "收起音乐播放器" : "展开音乐播放器");
    refs.toggle.title = open ? "收起音乐播放器" : "展开音乐播放器";
  }

  return {
    init() {
      refs = {
        toggle: document.querySelector("#musicToggle"),
        panel: document.querySelector("#musicPlayer"),
        position: document.querySelector("#musicPosition"),
        title: document.querySelector("#musicTitle"),
        artist: document.querySelector("#musicArtist"),
        progress: document.querySelector("#musicProgress"),
        current: document.querySelector("#musicCurrent"),
        duration: document.querySelector("#musicDuration"),
        prev: document.querySelector("#musicPrev"),
        play: document.querySelector("#musicPlay"),
        next: document.querySelector("#musicNext"),
      };
      ensureAudio();
      syncTrack();
      refs.toggle.addEventListener("click", () => setOpen(!refs.panel.classList.contains("open")));
      refs.play.addEventListener("click", togglePlayback);
      refs.prev.addEventListener("click", () => changeTrack(-1, false));
      refs.next.addEventListener("click", () => changeTrack(1, false));
      refs.progress.addEventListener("input", () => {
        seeking = true;
        const ratio = Number(refs.progress.value) / 1000;
        refs.progress.style.setProperty("--music-progress", (ratio * 100).toFixed(2) + "%");
        refs.current.textContent = formatTime((audio && Number.isFinite(audio.duration) ? audio.duration : 0) * ratio);
      });
      refs.progress.addEventListener("change", () => {
        ensureAudio();
        if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(refs.progress.value) / 1000;
        seeking = false;
        syncProgress();
      });
      document.addEventListener("click", (event) => {
        if (!refs.panel.contains(event.target) && !refs.toggle.contains(event.target)) setOpen(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && refs.panel.classList.contains("open")) {
          setOpen(false);
          refs.toggle.focus();
        }
      });
    },
  };
})();
