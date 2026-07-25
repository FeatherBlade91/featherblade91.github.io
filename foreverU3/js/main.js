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
// 照片名称：优先标题，否则用文件名（去掉扩展名）
const photoName = (p) =>
  (p.caption || "").trim() ||
  decodeURIComponent(p.src.split("/").pop() || "").replace(/\.[^.]+$/, "");
// 列表场景用 thumbs/ 小图（由 tools/make_thumbs.py 生成），加载失败回退原图
const thumbSrc = (p) => p.src.replace(/^photos\//, "thumbs/");
function setThumb(img, p) {
  img.decoding = "async";
  img.onerror = () => { img.onerror = null; img.src = p.src; };
  img.src = thumbSrc(p);
}

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
    // 画布被隐藏（如全屏模式下 display:none）时跳过绘制
    if (cv.offsetParent !== null) {
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
    }
    requestAnimationFrame(tick);
  })();
}

/* ---------- 模式切换 ---------- */
function switchMode(mode) {
  document.querySelectorAll(".mode-page").forEach((p) => p.classList.remove("active"));
  const page = $("#page-" + mode);
  if (!page) return;
  page.classList.add("active");
  document.body.dataset.mode = mode;
  document.querySelectorAll(".nav-pill").forEach((n) => n.classList.toggle("active", n.dataset.mode === mode));
  if (mode === "slideshow") Slideshow.enter();
  else Slideshow.leave();
  if (mode === "galaxy") Galaxy.enter();
  else Galaxy.leave();
  history.replaceState(null, "", "#" + mode);
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

/* ---------- 首页：恋爱计时器 ----------
 * 两种显示方式：按总天数 / 按几年几月几周几天，可切换并记忆选择。
 * 时间一律按北京时间（UTC+8）计算，不受本机时区影响。 */
function initHome() {
  $("#heroSubtitle").textContent = SITE_CONFIG.subtitle || "";
  const [sy, sm, sd] = SITE_CONFIG.anniversaryDate.split("-").map(Number);
  // 把“现在”平移到北京时区：之后只用 UTC 方法读，就是北京时间的年月日时分秒
  const beijingNow = () => new Date(Date.now() + 8 * 3600000);
  const startUtc = Date.UTC(sy, sm - 1, sd); // 在一起当天 北京时间 00:00（在平移坐标系里）

  const grid = $("#loveTimer");
  const switchBtn = $("#timerSwitch");
  let mode = localStorage.getItem("timerMode") || "days"; // days | calendar
  let numEls = [];

  // 日历差值：几年 + 几个月 + 几周 + 几天（都在平移后的北京坐标系里算）
  function calendarParts(nowB) {
    let y = nowB.getUTCFullYear() - sy;
    let m = nowB.getUTCMonth() - (sm - 1);
    let d = nowB.getUTCDate() - sd;
    if (d < 0) {
      m--;
      const prevMonth = new Date(Date.UTC(nowB.getUTCFullYear(), nowB.getUTCMonth(), 0));
      d += prevMonth.getUTCDate();
    }
    if (m < 0) { y--; m += 12; }
    const w = Math.floor(d / 7);
    return { y, m, w, d: d % 7 };
  }

  function buildCells() {
    const units = mode === "days"
      ? ["天", "时", "分", "秒"]
      : ["年", "个月", "周", "天", "时", "分", "秒"];
    grid.classList.toggle("compact", units.length > 4);
    grid.innerHTML = "";
    numEls = units.map((u) => {
      const cell = el("div", "timer-cell");
      const num = el("span", "timer-num");
      const unit = el("span", "timer-unit");
      unit.textContent = u;
      cell.appendChild(num);
      cell.appendChild(unit);
      grid.appendChild(cell);
      return num;
    });
    switchBtn.textContent = mode === "days" ? "🗓 换成 几年几月几周几天" : "🗓 换成 总天数";
  }

  function tick() {
    const nowB = beijingNow();
    let diff = Math.max(0, nowB.getTime() - startUtc);
    const h = Math.floor((diff % 86400000) / 3600000);
    const mi = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    let vals;
    if (mode === "days") {
      vals = [Math.floor(diff / 86400000), h, mi, s];
    } else {
      const c = calendarParts(nowB);
      vals = [c.y, c.m, c.w, c.d, h, mi, s];
    }
    vals.forEach((v, i) => {
      numEls[i].textContent = mode === "days" && i > 0 ? String(v).padStart(2, "0") : v;
    });
  }

  switchBtn.addEventListener("click", () => {
    mode = mode === "days" ? "calendar" : "days";
    localStorage.setItem("timerMode", mode);
    buildCells();
    tick();
  });
  buildCells();
  tick();
  setInterval(tick, 1000);
}

/* ---------- 3D 旋转相册（无限环） ----------
 * 卡片等距围成圆环，相机位置 cam 连续推进；
 * 飞到后半环的卡片被回收到前进方向的最前端并换上新照片，
 * 因此拖动可以无限持续、照片一张张接续上来。
 * 注意：半径必须小于 stage 的 perspective，否则卡片会跑到“相机后面”被裁掉。 */
const Ring = {
  SLOTS: 30,        // 环上同时存在的卡片数
  cam: 0,           // 相机位置（单位：卡槽）
  velocity: -0.012, // 单位：卡槽 / 帧
  tilt: -6,
  dragging: false,
  slots: [],        // { el, img, pos, photoIdx }
  radius: 0,
  init() {
    this.ring = $("#ring");
    const stage = $("#ringStage");
    this.build();
    addEventListener("resize", () => this.layout());

    let lastX = 0, lastY = 0;
    // 注意：不要用 setPointerCapture——它会把 click 重定向到 stage，
    // 导致卡片上的点击放大永远触发不了
    stage.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
      this.velocity = dx * 0.012;
      this.cam -= dx * 0.012;
      this.tilt = Math.max(-24, Math.min(14, this.tilt - dy * 0.08));
    });
    const end = () => { this.dragging = false; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    const stepDeg = 360 / this.SLOTS;
    const loop = () => {
      if (!this.dragging) {
        // 惯性衰减 + 默认缓慢自转，视角缓慢回正
        this.velocity += (-0.012 - this.velocity) * 0.02;
        this.cam -= this.velocity;
        this.tilt += (-6 - this.tilt) * 0.02;
      }
      this.ring.style.transform = `rotateX(${this.tilt}deg)`;
      const half = this.SLOTS / 2;
      for (const s of this.slots) {
        let rel = s.pos - this.cam;
        // 回收：落到后半环的卡片跳到前进方向最前端，换上接续的照片
        if (rel < -half) { s.pos += this.SLOTS; this.assign(s); rel = s.pos - this.cam; }
        else if (rel >= half) { s.pos -= this.SLOTS; this.assign(s); rel = s.pos - this.cam; }
        const deg = rel * stepDeg;
        s.el.style.transform = `rotateY(${deg}deg) translateZ(${this.radius}px)`;
        // 正面亮、背面暗一点，增强立体感
        const c = Math.cos((deg * Math.PI) / 180);
        s.el.style.filter = `brightness(${(0.72 + 0.28 * Math.max(0, c)).toFixed(3)})`;
      }
      requestAnimationFrame(loop);
    };
    loop();
  },
  build() {
    if (!PHOTOS.length) return;
    this.ring.innerHTML = "";
    this.slots = [];
    for (let i = 0; i < this.SLOTS; i++) {
      const card = el("div", "ring-card");
      const img = el("img");
      img.loading = "lazy";
      const cap = el("div", "ring-caption");
      card.appendChild(img);
      card.appendChild(cap);
      const s = { el: card, img, cap, pos: i, photoIdx: -1 };
      card.addEventListener("click", () => {
        if (!this.moved && s.photoIdx >= 0) Lightbox.open(s.photoIdx);
      });
      this.ring.appendChild(card);
      this.slots.push(s);
      this.assign(s);
    }
    this.layout();
  },
  layout() {
    const cardW = this.ring.clientWidth || 170;
    this.radius = Math.round((cardW / 2 + 14) / Math.tan(Math.PI / this.SLOTS));
  },
  assign(s) {
    const total = PHOTOS.length;
    s.photoIdx = ((s.pos % total) + total) % total;
    const p = PHOTOS[s.photoIdx];
    s.img.alt = photoName(p);
    setThumb(s.img, p);
    s.cap.textContent = photoName(p);
  },
};

/* ---------- 星河漫游 ----------
 * 照片散落在一条 3D 隧道里，相机匀速向前穿梭；
 * 飞过身后的照片被回收送到隧道尽头，形成无尽星海。 */
const Galaxy = {
  DEPTH: 7000,         // 隧道总长（px）
  VISIBLE_DEPTH: 5200, // 超过这个深度的照片隐藏且不加载，控制内存和流量
  cam: 0,
  speed: 2.4,
  speedBoost: 0,
  lookX: 0,
  lookY: 0,
  items: [], // { el, img, src, x, y, z, i, visible, loaded }
  running: false,
  init() {
    this.stage = $("#galaxyStage");
    this.space = $("#galaxySpace");
    PHOTOS.forEach((p, i) => {
      const d = el("div", "galaxy-photo");
      d.style.visibility = "hidden";
      const img = el("img");
      img.alt = photoName(p);
      img.decoding = "async";
      d.appendChild(img);
      d.addEventListener("click", () => {
        if (!this.moved) Lightbox.open(i);
      });
      this.space.appendChild(d);
      const it = {
        el: d,
        img,
        src: thumbSrc(p),
        full: p.src,
        x: rand(-46, 46),          // vw
        y: rand(-38, 38),          // vh
        z: rand(400, this.DEPTH),  // 距离相机的深度
        i,
        visible: false,
        loaded: false,
      };
      this.place(it);
      this.items.push(it);
    });

    // 拖拽环顾四周（不用 setPointerCapture，否则会抢走照片上的 click）
    let lastX = 0, lastY = 0, dragging = false;
    this.stage.addEventListener("pointerdown", (e) => {
      dragging = true;
      this.moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
      this.lookX = Math.max(-32, Math.min(32, this.lookX + dx * 0.06));
      this.lookY = Math.max(-24, Math.min(24, this.lookY - dy * 0.06));
    });
    const end = () => { dragging = false; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    // 滚轮加速 / 减速穿梭
    this.stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.speedBoost = Math.max(-2, Math.min(14, this.speedBoost - e.deltaY * 0.01));
    }, { passive: false });

    const loop = () => {
      if (this.running) {
        this.speedBoost *= 0.97; // 加速效果衰减
        this.cam += Math.max(0.4, this.speed + this.speedBoost);
        this.lookX *= 0.995;
        this.lookY *= 0.995;
        this.space.style.transform =
          `rotateY(${this.lookX}deg) rotateX(${this.lookY}deg) translateZ(${this.cam}px)`;
        for (const it of this.items) {
          const rel = it.z - this.cam;
          if (rel < -300) {
            // 飞到相机身后：回收送到隧道尽头
            it.z += this.DEPTH;
            this.place(it);
            it.visible = false;
            it.el.style.visibility = "hidden";
            continue;
          }
          const vis = rel < this.VISIBLE_DEPTH;
          if (vis !== it.visible) {
            it.visible = vis;
            it.el.style.visibility = vis ? "" : "hidden";
            // 进入可视深度才开始加载，避免一次性拉全部原图
            if (vis && !it.loaded) {
              it.loaded = true;
              it.img.onerror = () => { it.img.onerror = null; it.img.src = it.full; };
              it.img.src = it.src;
            }
          }
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  },
  place(it) {
    it.el.style.transform =
      `translate(-50%, -50%) translate3d(${it.x}vw, ${it.y}vh, ${-it.z}px)`;
  },
  enter() { this.running = true; },
  leave() { this.running = false; },
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
    // 照片太多时点指示器会溢出，直接隐藏
    if (PHOTOS.length <= 40) {
      PHOTOS.forEach((_, i) => {
        const d = el("span", "slide-dot");
        d.addEventListener("click", () => this.go(i));
        dots.appendChild(d);
      });
    } else {
      dots.style.display = "none";
    }
    $("#slidePrev").addEventListener("click", () => this.go(this.idx - 1));
    $("#slideNext").addEventListener("click", () => this.go(this.idx + 1));
    $("#slidePlay").addEventListener("click", () => {
      this.playing = !this.playing;
      $("#slidePlay").textContent = this.playing ? "⏸" : "▶";
      if (this.playing) this.auto();
    });
    // 触屏左右滑动切换
    let touchX = null;
    const box = $("#slideBox");
    box.addEventListener("pointerdown", (e) => { touchX = e.clientX; });
    box.addEventListener("pointerup", (e) => {
      if (touchX === null) return;
      const dx = e.clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 48) this.go(this.idx + (dx < 0 ? 1 : -1));
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
    const name = photoName(p);
    $("#slideCaption").textContent = name;
    $("#slideCaption").style.display = name ? "" : "none";
    document.querySelectorAll(".slide-dot").forEach((d, j) => d.classList.toggle("active", j === this.idx));
    if (this.playing) this.auto();
  },
  auto() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.go(this.idx + 1), 5000);
  },
};

/* ---------- 时间轴（暂时下线：照片时间尚未标注，代码保留以便恢复） ---------- */
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
    $("#lbImg").alt = photoName(p);
    $("#lbCaption").textContent = photoName(p);
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
  Galaxy.init();
  // buildTimeline(); // 时间轴暂时下线：照片时间尚未标注
  // 支持 #ring / #galaxy / #slideshow 直达
  if (location.hash) switchMode(location.hash.slice(1));
})();
