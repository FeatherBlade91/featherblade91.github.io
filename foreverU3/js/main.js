/* ============================================================
 * 主逻辑：数据加载 / 模式切换 / 五种观看模式 / 计时器 /
 * 泡泡与星光背景 / 灯箱 / 悄悄话 / 音乐开关
 * ============================================================ */

let PHOTOS = []; // { src, date, caption, milestone }

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  return d;
};
const rand = (min, max) => min + Math.random() * (max - min);

/* ---------- 数据加载 ---------- */
async function loadPhotos() {
  try {
    const res = await fetch("photos.json?ts=" + Date.now());
    const data = await res.json();
    PHOTOS = (data.photos || []).filter((p) => p.src);
  } catch (e) {
    PHOTOS = [];
  }
  PHOTOS.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/* ---------- 背景：泡泡 + 星光 ---------- */
function initBubbles() {
  const box = $("#bubbles");
  const tints = [
    "rgba(255, 182, 213, 0.4)",
    "rgba(159, 210, 255, 0.4)",
    "rgba(217, 204, 255, 0.35)",
  ];
  for (let i = 0; i < 26; i++) {
    const b = el("span", "bubble");
    const size = rand(12, 78);
    b.style.width = b.style.height = size + "px";
    b.style.left = rand(-2, 100) + "vw";
    b.style.setProperty("--dur", rand(11, 26) + "s");
    b.style.setProperty("--delay", rand(-26, 0) + "s");
    b.style.setProperty("--sway", rand(-70, 70) + "px");
    b.style.setProperty("--op", rand(0.35, 0.85));
    b.style.setProperty("--bubble-tint", tints[i % tints.length]);
    box.appendChild(b);
  }
}

function initStarlight() {
  const cv = $("#starlight");
  const ctx = cv.getContext("2d");
  let stars = [];
  function resize() {
    cv.width = innerWidth;
    cv.height = innerHeight;
    stars = Array.from({ length: Math.min(70, innerWidth / 14) }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: rand(0.6, 2.2),
      p: Math.random() * Math.PI * 2,
      s: rand(0.008, 0.025),
      c: Math.random() < 0.5 ? "255,179,209" : "159,210,255",
    }));
  }
  resize();
  addEventListener("resize", resize);
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const st of stars) {
      st.p += st.s;
      const a = 0.25 + Math.abs(Math.sin(st.p)) * 0.55;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${st.c},${a})`;
      ctx.shadowColor = `rgba(${st.c},0.9)`;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    requestAnimationFrame(tick);
  })();
}

/* ---------- 模式切换 ---------- */
function switchMode(mode) {
  document.querySelectorAll(".mode-page").forEach((p) => p.classList.remove("active"));
  const page = $("#page-" + mode);
  if (page) page.classList.add("active");
  document.querySelectorAll(".nav-pill").forEach((n) => n.classList.toggle("active", n.dataset.mode === mode));
  if (mode === "slideshow") Slideshow.enter();
  else Slideshow.leave();
  window.scrollTo({ top: 0 });
}

function initNav() {
  document.querySelectorAll(".nav-pill").forEach((n) =>
    n.addEventListener("click", () => switchMode(n.dataset.mode))
  );
  document.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => switchMode(b.dataset.goto))
  );
}

/* ---------- 首页：计时器 + 纪念日 ---------- */
function initHome() {
  $("#heroSubtitle").textContent = SITE_CONFIG.subtitle || "";
  const start = new Date(SITE_CONFIG.anniversaryDate + "T00:00:00");
  const cells = {
    days: $('[data-unit="days"]'),
    hours: $('[data-unit="hours"]'),
    minutes: $('[data-unit="minutes"]'),
    seconds: $('[data-unit="seconds"]'),
  };
  function tick() {
    let diff = Math.max(0, Date.now() - start.getTime());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    cells.days.textContent = d;
    cells.hours.textContent = String(h).padStart(2, "0");
    cells.minutes.textContent = String(m).padStart(2, "0");
    cells.seconds.textContent = String(s).padStart(2, "0");
  }
  tick();
  setInterval(tick, 1000);

  // 最近纪念日倒计时
  const tip = $("#milestoneTip");
  const now = new Date();
  let best = null;
  for (const ms of SITE_CONFIG.milestones || []) {
    const [mm, dd] = ms.date.split("-").map(Number);
    let next = new Date(now.getFullYear(), mm - 1, dd);
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      next = new Date(now.getFullYear() + 1, mm - 1, dd);
    }
    const days = Math.round((next - now) / 86400000);
    if (!best || days < best.days) best = { days, title: ms.title };
  }
  if (best) {
    tip.textContent = best.days === 0
      ? `🎉 今天就是「${best.title}」！`
      : `距离「${best.title}」还有 ${best.days} 天 💕`;
  }
}

/* ---------- 3D 旋转相册 ---------- */
const Ring = {
  angle: 0,
  velocity: 0.12,
  dragging: false,
  init() {
    const ring = $("#ring");
    const stage = $("#ringStage");
    const n = Math.max(PHOTOS.length, 1);
    const radius = Math.max(300, n * 52);
    PHOTOS.forEach((p, i) => {
      const card = el("div", "ring-card");
      card.style.transform = `rotateY(${(360 / n) * i}deg) translateZ(${radius}px)`;
      const img = el("img");
      img.src = p.src;
      img.alt = p.caption || "";
      img.loading = "lazy";
      card.appendChild(img);
      const capText = `${p.date || ""} ${p.caption || ""}`.trim();
      if (capText) {
        const cap = el("div", "ring-caption");
        cap.textContent = capText;
        card.appendChild(cap);
      }
      card.addEventListener("click", () => {
        if (!this.moved) Lightbox.open(i);
      });
      ring.appendChild(card);
    });

    let lastX = 0;
    stage.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.moved = false;
      lastX = e.clientX;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      if (Math.abs(dx) > 2) this.moved = true;
      this.velocity = dx * 0.15;
      this.angle += dx * 0.25;
    });
    const end = () => { this.dragging = false; };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    const loop = () => {
      if (!this.dragging) {
        // 惯性衰减 + 默认缓慢自转
        this.velocity += (0.12 - this.velocity) * 0.02;
        this.angle += this.velocity;
      }
      ring.style.transform = `rotateY(${this.angle}deg)`;
      requestAnimationFrame(loop);
    };
    loop();
  },
};

/* ---------- 幻灯片 ---------- */
const Slideshow = {
  idx: 0,
  timer: null,
  front: null,
  playing: true,
  init() {
    this.a = $("#slideA");
    this.b = $("#slideB");
    this.front = this.a;
    const dots = $("#slideDots");
    PHOTOS.forEach((_, i) => {
      const d = el("span", "slide-dot");
      d.addEventListener("click", () => this.go(i));
      dots.appendChild(d);
    });
    $("#slidePrev").addEventListener("click", () => this.go(this.idx - 1));
    $("#slideNext").addEventListener("click", () => this.go(this.idx + 1));
    $("#slidePlay").addEventListener("click", () => {
      this.playing = !this.playing;
      $("#slidePlay").textContent = this.playing ? "⏸" : "▶";
      if (this.playing) this.auto();
    });
  },
  enter() {
    if (!PHOTOS.length) return;
    this.playing = true;
    $("#slidePlay").textContent = "⏸";
    this.go(0, true);
  },
  leave() {
    if (this.timer) clearTimeout(this.timer);
  },
  go(i, instant) {
    if (!PHOTOS.length) return;
    this.idx = (i + PHOTOS.length) % PHOTOS.length;
    const p = PHOTOS[this.idx];
    const back = this.front === this.a ? this.b : this.a;
    back.style.backgroundImage = `url("${p.src}")`;
    back.classList.remove("show");
    void back.offsetWidth; // 重启动画
    back.classList.add("show");
    this.front.classList.remove("show");
    this.front = back;
    const capText = `${p.date || ""} ${p.caption || ""}`.trim();
    $("#slideCaption").textContent = capText;
    $("#slideCaption").style.display = capText ? "" : "none";
    document.querySelectorAll(".slide-dot").forEach((d, j) => d.classList.toggle("active", j === this.idx));
    if (this.playing) this.auto();
  },
  auto() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.go(this.idx + 1), 5000);
  },
};

/* ---------- 爱心照片墙 ---------- */
function buildHeartWall() {
  const wall = $("#heartWall");
  const n = PHOTOS.length;
  if (!n) return;
  // 心形参数方程
  const heart = (t) => ({
    x: 16 * Math.pow(Math.sin(t), 3),
    y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  });
  PHOTOS.forEach((p, i) => {
    const t = (Math.PI * 2 * i) / n;
    const pt = heart(t);
    const d = el("div", "heart-photo");
    d.style.left = 50 + (pt.x / 17) * 46 + "%";
    d.style.top = 50 - (pt.y / 17) * 44 + "%";
    d.style.animationDelay = rand(-5, 0) + "s";
    const img = el("img");
    img.src = p.src;
    img.alt = p.caption || "";
    img.loading = "lazy";
    d.appendChild(img);
    d.addEventListener("click", () => Lightbox.open(i));
    wall.appendChild(d);
  });
}

/* ---------- 时间轴 ---------- */
function buildTimeline() {
  const tl = $("#timeline");
  if (!PHOTOS.length) {
    const empty = el("div", "tl-empty");
    empty.textContent = "还没有照片，去管理端上传第一张吧 💌";
    tl.appendChild(empty);
    return;
  }
  const milestones = SITE_CONFIG.milestones || [];
  PHOTOS.forEach((p, i) => {
    const item = el("div", "tl-item");
    const dot = el("span", "tl-dot");
    item.appendChild(dot);
    const md = (p.date || "").slice(5);
    const hit = milestones.find((m) => m.date === md);
    // 日期、标题留空则不显示对应词条
    if (p.date || p.milestone || hit) {
      const date = el("div", "tl-date");
      date.textContent = p.date || "";
      if (p.milestone || hit) {
        const tag = el("span", "tl-milestone");
        tag.textContent = hit ? hit.title : "纪念日";
        date.appendChild(tag);
      }
      item.appendChild(date);
    }
    const card = el("div", "tl-card");
    const img = el("img");
    img.src = p.src;
    img.alt = p.caption || "";
    img.loading = "lazy";
    card.appendChild(img);
    if (p.caption) {
      const cap = el("div", "tl-caption");
      cap.textContent = p.caption;
      card.appendChild(cap);
    }
    card.addEventListener("click", () => Lightbox.open(i));
    item.appendChild(card);
    tl.appendChild(item);
  });
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("reveal")),
    { threshold: 0.15 }
  );
  document.querySelectorAll(".tl-item").forEach((d) => io.observe(d));
}

/* ---------- 泡泡漂流 ---------- */
function buildDrift() {
  const field = $("#driftField");
  const n = PHOTOS.length;
  if (!n) return;
  PHOTOS.forEach((p, i) => {
    const b = el("button", "drift-bubble");
    const size = rand(96, 170);
    b.style.width = b.style.height = size + "px";
    b.style.left = rand(3, 88) + "%";
    b.style.top = rand(4, 80) + "%";
    b.style.setProperty("--fdur", rand(6, 12) + "s");
    b.style.setProperty("--fdelay", rand(-10, 0) + "s");
    b.style.setProperty("--fx", rand(-26, 26) + "px");
    b.style.setProperty("--fy", rand(-26, 26) + "px");
    const img = el("img");
    img.src = p.src;
    img.alt = p.caption || "";
    img.loading = "lazy";
    b.appendChild(img);
    b.addEventListener("click", () => {
      b.classList.add("drift-pop");
      setTimeout(() => {
        Lightbox.open(i);
        setTimeout(() => b.classList.remove("drift-pop"), 400);
      }, 380);
    });
    field.appendChild(b);
  });
}

/* ---------- 灯箱 ---------- */
const Lightbox = {
  idx: 0,
  init() {
    $("#lbClose").addEventListener("click", () => this.close());
    $("#lbPrev").addEventListener("click", () => this.step(-1));
    $("#lbNext").addEventListener("click", () => this.step(1));
    $("#lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (!$("#lightbox").classList.contains("open")) return;
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowLeft") this.step(-1);
      if (e.key === "ArrowRight") this.step(1);
    });
  },
  open(i) {
    this.idx = i;
    this.render();
    $("#lightbox").classList.add("open");
  },
  close() { $("#lightbox").classList.remove("open"); },
  step(d) { this.open((this.idx + d + PHOTOS.length) % PHOTOS.length); },
  render() {
    const p = PHOTOS[this.idx];
    $("#lbImg").src = p.src;
    $("#lbCaption").textContent = `${p.date || ""} ${p.caption || ""}`.trim();
  },
};

/* ---------- 悄悄话 ---------- */
function initLetter() {
  const modal = $("#letterModal");
  const petals = $("#petals");
  for (let i = 0; i < 18; i++) {
    const p = el("span", "petal");
    const s = rand(10, 22);
    p.style.width = s + "px";
    p.style.height = s * 0.8 + "px";
    p.style.left = rand(0, 100) + "vw";
    p.style.setProperty("--pdur", rand(5, 10) + "s");
    p.style.setProperty("--pdelay", rand(-10, 0) + "s");
    p.style.setProperty("--psway", rand(-90, 90) + "px");
    petals.appendChild(p);
  }
  $("#letterTitle").textContent = SITE_CONFIG.loveLetter.title || "";
  let typing = null;
  $("#openLetter").addEventListener("click", () => {
    modal.classList.add("open");
    const body = $("#letterBody");
    body.innerHTML = '<span class="caret"></span>';
    const lines = SITE_CONFIG.loveLetter.lines || [];
    let li = 0, ci = 0, done = "", cur = "";
    clearInterval(typing);
    typing = setInterval(() => {
      if (li >= lines.length) {
        clearInterval(typing);
        body.innerHTML = done;
        return;
      }
      cur += lines[li][ci] || "";
      ci++;
      if (ci >= lines[li].length) { done += cur + "<br>"; cur = ""; li++; ci = 0; }
      body.innerHTML = done + cur + '<span class="caret"></span>';
    }, 90);
  });
  $("#letterClose").addEventListener("click", () => {
    modal.classList.remove("open");
    clearInterval(typing);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("open");
      clearInterval(typing);
    }
  });
}

/* ---------- 音乐开关 ---------- */
function initMusic() {
  const btn = $("#musicToggle");
  if (!SITE_CONFIG.music || !SITE_CONFIG.music.enabled) {
    btn.style.display = "none";
    return;
  }
  btn.addEventListener("click", () => {
    const on = MusicBox.toggle();
    btn.classList.toggle("playing", on);
  });
}

/* ---------- 启动 ---------- */
(async function boot() {
  await loadPhotos();
  initBubbles();
  initStarlight();
  initNav();
  initHome();
  initLetter();
  initMusic();
  Lightbox.init();
  Slideshow.init();
  Ring.init();
  buildHeartWall();
  buildTimeline();
  buildDrift();
})();
