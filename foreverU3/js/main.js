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

/* ---------- 场景拖拽 / 单击判定（3D 相册与星河漫游共用） ----------
 * 统一的「拖动场景」手势：pointerdown 记下起点，window 级 pointermove
 * 把每次增量回调给 onDrag(dx, dy)；从起点累计位移超过 CLICK_SLACK 才算
 * 「拖过」。可选的 onTap 会记住按下时的元素，在松开时优先处理单击；
 * 这能覆盖元素自身在按下与松开之间发生位移、导致原生 click 丢失的场景。
 * 想看大图的模式统一在单击里调 Lightbox.open()——
 * 大图呈现全站只有灯箱这一套，别另写。
 * 注意：不要用 setPointerCapture，它会把 click 重定向到舞台元素，
 * 照片卡片上的单击就收不到了。 */
function makeSceneDrag(stage, onDrag, onTap) {
  const t = {
    CLICK_SLACK: 7, // 单击容许的指间晃动（px），从按下点起算总位移
    dragging: false,
    moved: false,
    pointerId: null,
    downTarget: null,
    x0: 0, y0: 0, lastX: 0, lastY: 0,
  };
  stage.addEventListener("pointerdown", (e) => {
    t.dragging = true;
    t.moved = false;
    t.pointerId = e.pointerId;
    t.downTarget = e.target;
    t.x0 = t.lastX = e.clientX;
    t.y0 = t.lastY = e.clientY;
  });
  window.addEventListener("pointermove", (e) => {
    if (!t.dragging || e.pointerId !== t.pointerId) return;
    const dx = e.clientX - t.lastX;
    const dy = e.clientY - t.lastY;
    t.lastX = e.clientX;
    t.lastY = e.clientY;
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > t.CLICK_SLACK) t.moved = true;
    onDrag(dx, dy);
  });
  window.addEventListener("pointerup", (e) => {
    if (!t.dragging || e.pointerId !== t.pointerId) return;
    t.dragging = false;
    if (!t.moved && onTap) onTap(t.downTarget);
    t.pointerId = null;
    t.downTarget = null;
  });
  window.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== t.pointerId) return;
    t.dragging = false;
    t.pointerId = null;
    t.downTarget = null;
  });
  return t;
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
  ModeSettings.setMode(mode);
  if (mode === "slideshow") Slideshow.enter();
  else Slideshow.leave();
  if (mode === "galaxy") Galaxy.enter();
  else Galaxy.leave();
  if (mode === "ring") Ring.enter();
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
 * 每张卡片保持照片的真实宽高比：横图就是横的、竖图就是竖的，一律不裁剪。
 * 尺寸按「等面积」给：宽 = u·√比例、高 = u/√比例，于是 3:2 的横图和 2:3 的竖图
 * 分量相当却形状分明，一眼就能看出两种规格；u 由舞台尺寸决定（见 unit()）。
 * 间距不按等分角度，而是沿环按弧长逐个累加：每张卡占据「自身宽度 + GAP」，
 * 因此无论横竖、多宽，相邻卡片之间永远保持同样的 GAP，不会重叠。
 * 环总弧长 L = Σ(卡宽 + GAP)，半径 R = L / 2π；
 * 相机位置 cam（弧长坐标）连续推进，飞到后半环的卡片被回收到
 * 前进方向的最前端并换上新照片，因此拖动可以无限持续。
 * 舞台的 perspective 不写死，而是按 R 反推（见 recompute），让最前排的卡片
 * 稳定放大到 FRONT_ZOOM 倍——否则照片一多、环一大，前排就会糊到糊满屏幕。
 * 右上角设置面板（ModeSettings）能调两样：自转速度与图片大小。图片大小直接
 * 乘在 unit() 的基准边长上（真实的 px 缩放，相对整个页面生效），而间距 GAP
 * 是恒定值、不随缩放变——弧长累加的布局保证了任意缩放下相邻卡片都不遮挡。 */
const Ring = {
  SLOTS: 30,        // 环上同时存在的卡片数
  GAP: 28,          // 相邻卡片的间距（px，沿环的弧长测量）——恒定，不随图片大小设置变
  FRONT_ZOOM: 1.3,  // 最前排卡片相对实际尺寸的放大倍数
  DEF_SPEED: 1.2,   // 默认自转速度（px / 帧；设置面板上线前的老速度是 2.4，减半）
  SPEED_MAX: 4.8,   // 速度滑条上限（老速度的 2 倍）
  DEF_SIZE: 1.6,    // 默认图片大小（舞台基准的倍数；面板上线前是 1.0）
  SIZE_MIN: 0.5,    // 大小滑条范围
  SIZE_MAX: 2.2,
  cam: 0,           // 相机位置（沿环的弧长 px，单调可正可负）
  velocity: 0,
  cfg: null,        // { speed, size } 用户设置，loadCfg 从 localStorage 恢复
  tilt: -6,
  dragging: false,
  slots: [],        // { el, img, cap, photoIdx, w, h, s }  s = 中心弧长坐标
  order: [],        // slots 下标，按环上的先后顺序（order[0] 在队尾方向）
  base: 0,          // order[0] 起始边的绝对弧长坐标
  radius: 0,
  length: 1,        // 环的总弧长 L
  init() {
    this.loadCfg();
    this.ring = $("#ring");
    this.stage = $("#ringStage");
    const stage = this.stage;
    this.build();
    addEventListener("resize", () => this.layout());

    // 拖拽 / 单击判定走共用的 makeSceneDrag，单击看大图走共用的 Lightbox
    this.track = makeSceneDrag(stage, (dx, dy) => {
      this.velocity = dx * 2.4;
      this.cam -= dx * 2.4;
      this.tilt = Math.max(-24, Math.min(14, this.tilt + dy * 0.08));
    });

    const loop = () => {
      if (!this.track.dragging) {
        // 惯性衰减 + 默认缓慢自转（速度可在右上角设置面板调），视角缓慢回正
        this.velocity += (-this.cfg.speed - this.velocity) * 0.02;
        this.cam -= this.velocity;
        this.tilt += (-6 - this.tilt) * 0.02;
      }
      // 环一倾斜，最前排就会往下掉 R·sin(tilt)（前排还要再乘放大倍数），
      // 这里按同样的量抬回来，让最前排始终停在画面中间偏上
      const lift = Math.sin((this.tilt * Math.PI) / 180) * this.radius * this.FRONT_ZOOM * 0.85;
      this.ring.style.transform = `translateY(${lift.toFixed(1)}px) rotateX(${this.tilt}deg)`;
      // 回收：队尾（order[0]）落到后半环就跳到最前端换照片，反向拖动时对称处理。
      // 回收会改变总弧长，可能让另一端越界，因此成对反复检查直到两端都收敛
      let moved = true, guard = 0;
      const MAX_RECYCLE = this.SLOTS * 4;
      while (moved && guard < MAX_RECYCLE) {
        moved = false;
        while (this.slots[this.order[0]].s - this.cam < -this.length / 2 && guard < MAX_RECYCLE) {
          this.recycle(1); moved = true; guard++;
        }
        while (this.slots[this.order[this.order.length - 1]].s - this.cam >= this.length / 2 && guard < MAX_RECYCLE) {
          this.recycle(-1); moved = true; guard++;
        }
      }
      for (const s of this.slots) {
        const deg = ((s.s - this.cam) / this.radius) * 180 / Math.PI;
        s.el.style.transform = `rotateY(${deg}deg) translateZ(${this.radius}px)`;
        // 正面亮、背面暗一点，增强立体感
        const c = Math.cos((deg * Math.PI) / 180);
        s.el.style.filter = `brightness(${(0.72 + 0.28 * Math.max(0, c)).toFixed(3)})`;
      }
      requestAnimationFrame(loop);
    };
    loop();
  },
  /* ----- 设置面板的存取（右上角 ⚙ → 3D 相册） ----- */
  loadCfg() {
    let cfg = { speed: this.DEF_SPEED, size: this.DEF_SIZE };
    try {
      cfg = Object.assign(cfg, JSON.parse(localStorage.getItem("ringCfg") || "{}"));
    } catch (e) { /* 存了坏数据就回落默认 */ }
    // 越界值（比如手改过 localStorage）夹回滑条范围
    cfg.speed = Math.max(0, Math.min(this.SPEED_MAX, +cfg.speed || 0));
    cfg.size = Math.max(this.SIZE_MIN, Math.min(this.SIZE_MAX, +cfg.size || 0));
    this.cfg = cfg;
    this.velocity = -cfg.speed;
  },
  saveCfg() {
    localStorage.setItem("ringCfg", JSON.stringify(this.cfg));
  },
  setSpeed(v) { this.cfg.speed = v; this.saveCfg(); },
  setSize(v) { this.cfg.size = v; this.saveCfg(); this.layout(); },
  resetCfg() {
    this.cfg.speed = this.DEF_SPEED;
    this.cfg.size = this.DEF_SIZE;
    this.saveCfg();
    this.layout();
  },
  // 卡片的基准尺寸 u：横竖两种规格都以它为“面积边长”，跟着舞台大小走。
  // 设置面板的「图片大小」直接乘在 u 上，是真实的 px 缩放，相对整个页面生效。
  // 前排放大 FRONT_ZOOM 倍后，竖图（最高的常见规格 3:4，高约 1.16u）大约
  // 占舞台高度的一半；再给 u 一个上限，保证极限调大时前排竖图也不会越过舞台。
  unit() {
    const w = (this.stage && this.stage.clientWidth) || innerWidth;
    const h = (this.stage && this.stage.clientHeight) || innerHeight;
    // 窄屏放宽横向占比，不然手机上照片小得看不清
    const base = Math.max(96, Math.min(0.34 * h, (w < 640 ? 0.46 : 0.34) * w, 300));
    const maxU = (h * 0.98) / (1.16 * this.FRONT_ZOOM);
    return Math.min(base * this.cfg.size, maxU);
  },
  build() {
    if (!PHOTOS.length) return;
    this.ring.innerHTML = "";
    this.slots = [];
    this.order = [];
    this.base = 0;
    const u = this.unit();
    for (let i = 0; i < this.SLOTS; i++) {
      const card = el("div", "ring-card");
      const img = el("img");
      img.loading = "lazy";
      const cap = el("div", "ring-caption");
      card.appendChild(img);
      card.appendChild(cap);
      // 先按 3:4 占位，图片加载完成后 fitCard 按真实宽高比重算
      const s = { el: card, img, cap, photoIdx: i % PHOTOS.length, w: u * 0.87, h: u * 1.15, s: 0 };
      card.style.width = s.w.toFixed(1) + "px";
      card.style.height = s.h.toFixed(1) + "px";
      card.style.left = (-s.w / 2).toFixed(1) + "px";
      card.style.top = (-s.h / 2).toFixed(1) + "px";
      card.addEventListener("click", () => {
        if (!this.track.moved && s.photoIdx >= 0) Lightbox.open(s.photoIdx);
      });
      this.ring.appendChild(card);
      this.slots.push(s);
      this.order.push(i);
      this.assign(s);
    }
    this.recompute();
  },
  // 按当前每张卡的实际宽度，沿环逐个累加弧长坐标和半径
  recompute() {
    let x = this.base;
    for (const i of this.order) {
      const s = this.slots[i];
      s.s = x + s.w / 2;
      x += s.w + this.GAP;
    }
    this.length = Math.max(x - this.base, 1);
    this.radius = this.length / (2 * Math.PI);
    // 由半径反推 perspective：最前排（z = +R）的放大倍数恒为 FRONT_ZOOM，
    // 卡片再多、环再大也不会糊成满屏。P = R·Z/(Z-1)
    if (this.stage) {
      const p = (this.radius * this.FRONT_ZOOM) / (this.FRONT_ZOOM - 1);
      this.stage.style.perspective = Math.round(p) + "px";
    }
  },
  // dir = 1：队尾卡回收到最前端；dir = -1：队首卡回收到最后端
  recycle(dir) {
    const total = PHOTOS.length;
    let i;
    if (dir > 0) {
      i = this.order.shift();
      const s = this.slots[i];
      this.base += s.w + this.GAP;
      const prev = this.slots[this.order[this.order.length - 1]];
      s.photoIdx = (prev.photoIdx + 1) % total;
      this.order.push(i);
    } else {
      i = this.order.pop();
      const s = this.slots[i];
      this.base -= s.w + this.GAP;
      const next = this.slots[this.order[0]];
      s.photoIdx = ((next.photoIdx - 1) % total + total) % total;
      this.order.unshift(i);
    }
    this.assign(this.slots[i]);
    this.recompute();
  },
  layout() {
    // 基础尺寸变化（横竖屏切换、设置面板调图片大小）时，按真实宽高比全部重排。
    // 先记住当前离相机最近的那张卡，重排后把相机挪回它旁边——
    // 这样调大调小照片时最前排还是同一张，不会突然换照片。
    let front = null;
    for (const s of this.slots) {
      if (!front || Math.abs(s.s - this.cam) < Math.abs(front.s - this.cam)) front = s;
    }
    const off = front ? front.s - this.cam : 0;
    for (const s of this.slots) this.fitCard(s);
    this.recompute();
    if (front) this.cam = front.s - off;
  },
  // 页面藏着的时候 stage 量不到尺寸，进来时按真实舞台重排一次
  enter() { this.layout(); },
  assign(s) {
    const p = PHOTOS[s.photoIdx];
    s.img.alt = photoName(p);
    // 图片加载完成后，按真实宽高比调整相框（横图横放、竖图竖放，不裁剪）
    s.img.onload = () => this.fitCard(s);
    setThumb(s.img, p);
    s.cap.textContent = photoName(p);
  },
  fitCard(s) {
    const nw = s.img.naturalWidth, nh = s.img.naturalHeight;
    if (!nw || !nh) return;
    const ar = nw / nh;
    const u = this.unit();
    // 等面积：宽 = u·√比例、高 = u/√比例。横图明显更宽、竖图明显更高，
    // 但两者面积相当，转起来不会一会儿大一会儿小；极端宽幅全景另给上限。
    const k = Math.sqrt(Math.min(Math.max(ar, 0.3), 3));
    const w = Math.min(u * k, u * 1.8);
    const h = w / ar;
    s.w = w;
    s.h = h;
    s.el.style.width = w.toFixed(1) + "px";
    s.el.style.height = h.toFixed(1) + "px";
    // .ring 是 0×0 的锚点，卡片以它为中心摆
    s.el.style.left = (-w / 2).toFixed(1) + "px";
    s.el.style.top = (-h / 2).toFixed(1) + "px";
    this.recompute();
  },
};

/* ---------- 星河漫游的背景天体：土星 ----------
 * 规格对齐 saturn.html：星幕球壳 + 程序化条纹贴图的扁球行星（赤道半径 20、
 * 极扁率 0.89、转轴倾角 26.7°、自转 0.12）+ 分区粒子环（B 环 / 卡西尼缝 / A 环，
 * 开普勒差速 ω ∝ r^-1.5，加法混合）+ 大气辉光，太阳光 / 环境光 / 边缘光三盏灯。
 * saturn.html 用的是 three.js，这里按同一套参数用原生 WebGL 重写，保持整站零依赖；
 * 粒子数按“背景层”的定位下调（环 6 万 → 4.6 万、星 8000 → 6000）。
 * 只在首次进入星河漫游时初始化：页面隐藏时 clientWidth 为 0，提前建画布会得到 0×0。 */
const SaturnSky = {
  TILT: (26.7 * Math.PI) / 180, // 转轴倾角，行星与环共用
  FLATTEN: 0.89,                // 扁率：土星两极明显压扁
  RING_COUNT: 46000,
  STAR_COUNT: 6000,
  DIST: 215,                    // 相机到土星的基准距离
  scale: 1.8,                   // 行星大小（本体+星环+辉光等比例）：除进相机距离，越大越近越显大
  ready: false,

  /* ===== 4×4 / 3×3 矩阵小工具（列主序，可直接喂给 WebGL） ===== */
  // shiftX / shiftY：镜头平移（NDC 单位）。土星现在居中，传 0；
  // 参数保留着，以后想把天体挪离正中直接改调用处即可
  perspective(fovy, aspect, near, far, shiftX, shiftY) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      -shiftX, -shiftY, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  lookAt(eye, target) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx;          // up = (0,1,0) 与 z 轴叉乘
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
    ]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  scaleM(x, y, z) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); },
  mat3of(m) { return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); },

  /* ===== 着色器 / 缓冲区的小封装 ===== */
  makeProgram(vsrc, fsrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("saturn shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const v = compile(gl.VERTEX_SHADER, vsrc), f = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("saturn link:", gl.getProgramInfoLog(p));
      return null;
    }
    const o = { p, a: {}, u: {} };
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i < n; i++) {
      const name = gl.getActiveAttrib(p, i).name;
      o.a[name] = gl.getAttribLocation(p, name);
    }
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      o.u[name] = gl.getUniformLocation(p, name);
    }
    return o;
  },
  buffer(data, target) {
    const gl = this.gl;
    const b = gl.createBuffer();
    const t = target || gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b);
    gl.bufferData(t, data, gl.STATIC_DRAW);
    return b;
  },
  // 切换程序时先关掉所有顶点属性槽，再按 layout 打开需要的，避免残留的槽指向别的缓冲
  use(prog, buf, layout, stride) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    for (let i = 0; i < this.maxAttribs; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [name, size, offset] of layout) {
      const loc = prog.a[name];
      if (loc == null || loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
  },

  /* ===== 行星贴图：canvas 程序化生成（横向条纹 + 噪点） ===== */
  buildTexture() {
    const W = 1024, H = 512;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, H); // 两极 → 赤道
    [[0, "#c8a86b"], [0.18, "#e2c07a"], [0.3, "#d4aa65"], [0.45, "#f0d08a"], [0.5, "#e8c870"],
     [0.55, "#f0d08a"], [0.7, "#d4aa65"], [0.82, "#e2c07a"], [1, "#c8a86b"]]
      .forEach(([at, c]) => grad.addColorStop(at, c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bands = [
      { y: 0.12, w: 0.04, c: "rgba(160,110,50,0.35)" },
      { y: 0.22, w: 0.025, c: "rgba(200,160,80,0.25)" },
      { y: 0.32, w: 0.05, c: "rgba(140,90,40,0.40)" },
      { y: 0.41, w: 0.03, c: "rgba(220,180,90,0.30)" },
      { y: 0.50, w: 0.06, c: "rgba(130,85,35,0.45)" },
      { y: 0.60, w: 0.03, c: "rgba(210,170,85,0.28)" },
      { y: 0.68, w: 0.04, c: "rgba(150,100,45,0.38)" },
      { y: 0.78, w: 0.03, c: "rgba(195,155,75,0.22)" },
      { y: 0.88, w: 0.04, c: "rgba(160,110,50,0.30)" },
    ];
    for (const b of bands) {
      const bg = ctx.createLinearGradient(0, (b.y - b.w / 2) * H, 0, (b.y + b.w / 2) * H);
      bg.addColorStop(0, "transparent");
      bg.addColorStop(0.5, b.c);
      bg.addColorStop(1, "transparent");
      ctx.fillStyle = bg;
      ctx.fillRect(0, (b.y - b.w) * H, W, b.w * 2 * H);
    }

    const imgd = ctx.getImageData(0, 0, W, H);
    const d = imgd.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 12;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n * 0.9));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n * 0.6));
    }
    ctx.putImageData(imgd, 0, 0);
    return cv;
  },

  /* ===== 几何体 ===== */
  buildSphere(r, segW, segH) {
    const v = [], idx = [];
    for (let y = 0; y <= segH; y++) {
      const phi = (y / segH) * Math.PI;
      for (let x = 0; x <= segW; x++) {
        const theta = (x / segW) * Math.PI * 2;
        const nx = -Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        v.push(nx * r, ny * r, nz * r, nx, ny, nz, x / segW, y / segH);
      }
    }
    for (let y = 0; y < segH; y++) {
      for (let x = 0; x < segW; x++) {
        const a = y * (segW + 1) + x, b = a + segW + 1;
        if (y !== 0) idx.push(a, b, a + 1);
        if (y !== segH - 1) idx.push(b, b + 1, a + 1);
      }
    }
    return { data: new Float32Array(v), index: new Uint16Array(idx) };
  },
  // 环：按密度分区抽样，同 saturn.html 的 B 环 / 卡西尼缝 / A 环结构
  buildRings(count) {
    const zones = [
      { rMin: 24, rMax: 30, density: 0.20 },
      { rMin: 30, rMax: 38, density: 1.00 },
      { rMin: 38, rMax: 40, density: 0.10 }, // 卡西尼缝
      { rMin: 40, rMax: 52, density: 0.85 },
      { rMin: 52, rMax: 58, density: 0.40 },
    ];
    const total = zones.reduce((s, z) => s + z.density * (z.rMax - z.rMin), 0);
    const REF_R = 37, REF_W = 0.018; // 开普勒归一化：ω ∝ r^(-3/2)
    const d = new Float32Array(count * 6); // angle speed radius y size alpha
    for (let i = 0; i < count; i++) {
      let pick = Math.random() * total, zone = zones[0];
      for (const z of zones) {
        pick -= z.density * (z.rMax - z.rMin);
        if (pick <= 0) { zone = z; break; }
      }
      const r = zone.rMin + Math.random() * (zone.rMax - zone.rMin);
      const edgeFade = Math.min((r - zone.rMin) / 2, (zone.rMax - r) / 2);
      const o = i * 6;
      d[o] = Math.random() * Math.PI * 2;
      d[o + 1] = REF_W * Math.pow(REF_R / r, 1.5);
      d[o + 2] = r + (Math.random() - 0.5) * 0.4;          // 半径噪声
      d[o + 3] = (Math.random() - 0.5) * 0.35;             // 环极薄，只有一点厚度
      d[o + 4] = 0.6 + Math.random() * Math.random() * 2.2;
      d[o + 5] = Math.min(1, zone.density * 0.85 * Math.min(1, edgeFade)) * (0.4 + Math.random() * 0.6);
    }
    return d;
  },
  buildStars(count) {
    const d = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 800 + Math.random() * 400;
      const o = i * 4;
      d[o] = r * Math.sin(phi) * Math.cos(theta);
      d[o + 1] = r * Math.sin(phi) * Math.sin(theta);
      d[o + 2] = r * Math.cos(phi);
      d[o + 3] = Math.random() * 1.8 + 0.4;
    }
    return d;
  },

  init(stage) {
    const cv = el("canvas");
    cv.id = "galaxyGL";
    cv.setAttribute("aria-hidden", "true");
    stage.insertBefore(cv, stage.firstChild);
    const gl = cv.getContext("webgl", { alpha: true, antialias: false, depth: true });
    if (!gl) { cv.remove(); return false; } // 不支持 WebGL：留 CSS 深空渐变兜底
    this.gl = gl; this.cv = cv; this.stage = stage;
    this.maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

    const COMMON = `
      uniform mat4 uProj;
      uniform mat4 uView;
      uniform mat4 uModel;`;

    this.starProg = this.makeProgram(
      `attribute vec3 aPos;
       attribute float aSize;
       uniform mat4 uProj;
       uniform mat4 uView;
       uniform float uScale;
       void main() {
         vec4 mv = uView * vec4(aPos, 1.0);
         gl_PointSize = max(1.0, aSize * (uScale / -mv.z));
         gl_Position = uProj * mv;
       }`,
      `precision mediump float;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         if (d > 0.5) discard;
         float a = 1.0 - smoothstep(0.2, 0.5, d);
         gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.85);
       }`);

    this.planetProg = this.makeProgram(
      `attribute vec3 aPos;
       attribute vec3 aNor;
       attribute vec2 aUv;
       ${COMMON}
       uniform mat3 uNormalMat;
       varying vec3 vNor;
       varying vec3 vWorld;
       varying vec2 vUv;
       void main() {
         vec4 world = uModel * vec4(aPos, 1.0);
         vWorld = world.xyz;
         vNor = uNormalMat * aNor;
         vUv = aUv;
         gl_Position = uProj * (uView * world);
       }`,
      `precision mediump float;
       uniform sampler2D uTex;
       uniform vec3 uEye;
       uniform float uExposure;
       varying vec3 vNor;
       varying vec3 vWorld;
       varying vec2 vUv;
       void main() {
         vec3 N = normalize(vNor);
         vec3 base = texture2D(uTex, vUv).rgb;
         // 光源挂在镜头旁（略偏上）：土星无论公转/被拖到哪个角度，
         // 亮面始终朝向观众，只剩上下一点明暗渐变保住立体感
         vec3 L = normalize(uEye - vWorld + vec3(0.0, 50.0, 0.0));
         float diff = max(dot(N, L), 0.0);
         vec3 col = base * vec3(1.0, 0.961, 0.878) * diff * 2.2;
         col += base * vec3(0.067, 0.133, 0.267) * 0.6;  // 环境光 0x112244
         vec3 R = normalize(vec3(-200.0, -40.0, -100.0)); // 边缘光 0x4466aa 强度 0.4
         col += base * vec3(0.267, 0.4, 0.667) * max(dot(N, R), 0.0) * 0.4;
         vec3 H = normalize(L + normalize(uEye - vWorld)); // 高光 shininess 18
         col += vec3(0.15, 0.12, 0.06) * pow(max(dot(N, H), 0.0), 18.0) * step(0.001, diff);
         gl_FragColor = vec4(col * uExposure, 1.0);
       }`);

    this.ringProg = this.makeProgram(
      `attribute float aAngle;
       attribute float aSpeed;
       attribute float aRadius;
       attribute float aY;
       attribute float aSize;
       attribute float aAlpha;
       ${COMMON}
       uniform float uTime;
       uniform float uScale;
       varying float vAlpha;
       void main() {
         float angle = aAngle + aSpeed * uTime;   // 内圈快、外圈慢
         vec4 mv = uView * (uModel * vec4(aRadius * cos(angle), aY, aRadius * sin(angle), 1.0));
         gl_PointSize = max(1.0, aSize * (uScale / -mv.z));
         gl_Position = uProj * mv;
         vAlpha = aAlpha;
       }`,
      `precision mediump float;
       uniform vec3 uColor;
       varying float vAlpha;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         if (d > 0.5) discard;
         float soft = 1.0 - smoothstep(0.15, 0.5, d);
         gl_FragColor = vec4(uColor, soft * vAlpha);
       }`);

    this.haloProg = this.makeProgram(
      `attribute vec2 aQuad;
       uniform mat4 uProj;
       uniform mat4 uView;
       uniform vec2 uSize;
       varying vec2 vQ;
       void main() {
         vec3 c = (uView * vec4(0.0, 0.0, 0.0, 1.0)).xyz; // 土星中心，正对镜头
         vQ = aQuad;
         gl_Position = uProj * vec4(c + vec3(aQuad * uSize, 0.0), 1.0);
       }`,
      `precision mediump float;
       varying vec2 vQ;
       void main() {
         float d = length(vQ);
         if (d > 1.0 || d < 0.469) discard;   // 内圈半径 60/128，贴着行星边缘起晕
         float t = (d - 0.469) / 0.531;
         vec3 c; float a;
         if (t < 0.5) { c = mix(vec3(0.86,0.75,0.47), vec3(0.78,0.63,0.31), t / 0.5); a = mix(0.0, 0.08, t / 0.5); }
         else if (t < 0.8) { c = mix(vec3(0.78,0.63,0.31), vec3(0.71,0.55,0.24), (t-0.5)/0.3); a = mix(0.08, 0.15, (t-0.5)/0.3); }
         else { c = mix(vec3(0.71,0.55,0.24), vec3(0.63,0.47,0.20), (t-0.8)/0.2); a = mix(0.15, 0.0, (t-0.8)/0.2); }
         gl_FragColor = vec4(c, a);
       }`);

    if (!this.starProg || !this.planetProg || !this.ringProg || !this.haloProg) {
      cv.remove(); this.gl = null; return false;
    }

    const sphere = this.buildSphere(20, 64, 48);
    this.sphereBuf = this.buffer(sphere.data);
    this.sphereIdx = this.buffer(sphere.index, gl.ELEMENT_ARRAY_BUFFER);
    this.sphereCount = sphere.index.length;
    this.ringBuf = this.buffer(this.buildRings(this.RING_COUNT));
    this.starBuf = this.buffer(this.buildStars(this.STAR_COUNT));
    this.haloBuf = this.buffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.buildTexture());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.clearColor(0, 0, 0, 0);
    this.resize();
    addEventListener("resize", () => this.resize());
    this.ready = true;
    return true;
  },

  resize() {
    if (!this.gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    this.cv.width = Math.max(1, Math.round(w * dpr));
    this.cv.height = Math.max(1, Math.round(h * dpr));
  },

  /* 每帧渲染。lookX / lookY 是拖拽视角（度），叠加在缓慢自转的公转机位上 */
  render(t, lookX, lookY) {
    const gl = this.gl;
    if (!gl || !this.ready) return;
    const W = this.cv.width, H = this.cv.height;
    gl.viewport(0, 0, W, H);
    // 深度的 clear 受 depthMask 掩码控制，而上一帧结尾（环/辉光 pass）把它关了——
    // 不先打开，深度缓冲永远清不掉，行星本体会被上一帧的残影深度整块挡掉，
    // 只剩环粒子和辉光的一点光晕（曾经长期把那团光误当成土星本体）
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 机位：绕土星缓慢转圈（对应 OrbitControls 的 autoRotate），拖拽环顾时
    // 叠加轨道角——土星钉在画面正中原地转身，表面特征的扫动方向与照片、
    // 星幕一致（手指往左拖，三层画面都往左走）：
    // lookX > 0（往左拖 / 镜头向右看）→ az 增大 → 土星特征向左扫；
    // lookY > 0（往下拖 / 镜头向上看）→ elev 增大 → 特征向下扫。
    const az = t * 0.018 + lookX * 0.012; // 约 350 秒转一圈，跟 saturn.html 的 autoRotate 同量级
    const elev = Math.max(0.06, Math.min(0.9, 0.36 + lookY * 0.008));
    const aspect = W / H;
    const wide = aspect > 1.1;
    // scale 是「行星大小」设置（等比例，含星环和辉光——它们都以世界单位画在
    // 土星旁边，改距离就整体一起变大变小）；竖屏视野窄，退远一点免得占满整块屏
    const d = (this.DIST / this.scale) * (wide ? 1 : 1.5);
    const eye = [
      Math.sin(az) * Math.cos(elev) * d,
      Math.sin(elev) * d,
      Math.cos(az) * Math.cos(elev) * d,
    ];
    // 土星居中：不额外平移，照片隧道穿过它时靠前后景深自然错开
    const proj = this.perspective(Math.PI / 4, aspect, 1, 4000, 0, 0);
    const view = this.lookAt(eye, [0, 0, 0]);
    const pxScale = H / 900; // 点的大小跟分辨率走，换屏幕不会忽大忽小

    // 行星：倾角 → 自转 → 压扁；法线要用逆转置，压扁的方向反过来除
    const spin = this.rotY(t * 0.12);
    const tilt = this.rotZ(this.TILT);
    const planetModel = this.mul(tilt, this.mul(spin, this.scaleM(1, this.FLATTEN, 1)));
    const normalMat = this.mat3of(this.mul(tilt, this.mul(spin, this.scaleM(1, 1 / this.FLATTEN, 1))));

    /* --- 星幕（先画，不写深度） --- */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    this.use(this.starProg, this.starBuf, [["aPos", 3, 0], ["aSize", 1, 3]], 4);
    gl.uniformMatrix4fv(this.starProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.starProg.u.uView, false, view);
    gl.uniform1f(this.starProg.u.uScale, 300 * pxScale);
    gl.drawArrays(gl.POINTS, 0, this.STAR_COUNT);

    /* --- 行星本体（不透明，写深度，好让环从它背后穿过去） --- */
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.use(this.planetProg, this.sphereBuf, [["aPos", 3, 0], ["aNor", 3, 3], ["aUv", 2, 6]], 8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphereIdx);
    gl.uniformMatrix4fv(this.planetProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.planetProg.u.uView, false, view);
    gl.uniformMatrix4fv(this.planetProg.u.uModel, false, planetModel);
    gl.uniformMatrix3fv(this.planetProg.u.uNormalMat, false, normalMat);
    gl.uniform3fv(this.planetProg.u.uEye, eye);
    gl.uniform1f(this.planetProg.u.uExposure, 0.82); // 背景层，压一点曝光免得抢照片
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.planetProg.u.uTex, 0);
    gl.drawElements(gl.TRIANGLES, this.sphereCount, gl.UNSIGNED_SHORT, 0);

    /* --- 光环（加法混合，测深度但不写深度） --- */
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    this.use(this.ringProg, this.ringBuf, [
      ["aAngle", 1, 0], ["aSpeed", 1, 1], ["aRadius", 1, 2],
      ["aY", 1, 3], ["aSize", 1, 4], ["aAlpha", 1, 5],
    ], 6);
    gl.uniformMatrix4fv(this.ringProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.ringProg.u.uView, false, view);
    gl.uniformMatrix4fv(this.ringProg.u.uModel, false, tilt);
    gl.uniform1f(this.ringProg.u.uTime, t);
    gl.uniform1f(this.ringProg.u.uScale, 380 * pxScale);
    gl.uniform3f(this.ringProg.u.uColor, 0.88, 0.8, 0.62);
    gl.drawArrays(gl.POINTS, 0, this.RING_COUNT);

    /* --- 大气辉光 --- */
    this.use(this.haloProg, this.haloBuf, [["aQuad", 2, 0]], 2);
    gl.uniformMatrix4fv(this.haloProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.haloProg.u.uView, false, view);
    gl.uniform2f(this.haloProg.u.uSize, 26, 23);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  },
};

/* ---------- 星河漫游 ----------
 * 照片散落在一条 3D 隧道里，相机匀速向前穿梭；
 * 隧道里同一时刻只保留少量照片槽位，飞过身后的槽位回收并
 * 换成未出场的照片，循环展示全集，控制内存与渲染开销。
 * 背景层：远处一颗 WebGL 土星（SaturnSky）+ canvas 星幕（深度视差 + 闪烁）+ 流星雨。
 * 右上角设置面板（ModeSettings）能调四样：照片移动速度 / 行星大小 /
 * 单次照片数量 / 照片消失距离。 */
const Galaxy = {
  DEPTH: 7000,         // 隧道总长（px）
  PERSPECTIVE: 900,    // 与 .galaxy-stage 的 perspective 保持一致
  /* ----- 设置面板各项：默认值 + 滑条范围（存 localStorage，见 loadCfg） ----- */
  DEF_SPEED: 2.4,      // 照片朝镜头（屏幕外）移动的基础速度，单位约为 px/帧
  SPEED_MIN: 0.4,
  SPEED_MAX: 8,
  DEF_PLANET: 1.8,     // 行星大小：等比例缩放土星（含星环），直接作用在 SaturnSky.scale
  PLANET_MIN: 0.5,
  PLANET_MAX: 3.0,
  DEF_SLOTS: innerWidth < 768 ? 10 : 18, // 单次照片数默认值：小屏少一些
  MIN_SLOTS: 4,
  MAX_SLOTS: 50,
  VISIBLE_DEPTH: 4600, // 进入这个深度才显示并加载缩略图，控制内存和流量
  DEF_NEAR: 300,       // 照片距镜头这么近时消失；值越小，照片越晚消失
  MIN_NEAR: 100,
  MAX_NEAR: 1200,
  cam: 0,
  speedBoost: 0,
  lookX: 0,
  lookY: 0,
  items: [], // 照片槽位 { el, img, src, full, x, y, z, photoIdx, visible, loaded }
  stars: [], // 星幕粒子
  nextPhoto: 0,
  nextShoot: 0,
  running: false,
  cfg: null,   // { speed, planet, slots, near } 用户设置，loadCfg 从 localStorage 恢复
  init() {
    this.loadCfg();
    this.stage = $("#galaxyStage");
    this.space = $("#galaxySpace");
    this.buildSlots();
    // 背景星幕（土星那层等首次进入时再建，见 enter）
    this.initStarfield();

    // 拖拽 / 单击判定走共用的 makeSceneDrag（不用 setPointerCapture，
    // 否则会抢走照片上的 click）。方向约定：跟手——往左拖场景往左走
    // （相当于镜头往右看），上下同理，照片、星幕、土星三层全部一致。
    this.track = makeSceneDrag(
      this.stage,
      (dx, dy) => {
        this.lookX = Math.max(-32, Math.min(32, this.lookX - dx * 0.06));
        this.lookY = Math.max(-24, Math.min(24, this.lookY + dy * 0.06));
      },
      (target) => {
        const photoEl = target && target.closest(".galaxy-photo");
        if (!photoEl) return;
        const item = this.items.find((it) => it.el === photoEl);
        if (item) Lightbox.open(item.photoIdx);
      }
    );
    // 滚轮加速 / 减速穿梭
    this.stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.speedBoost = Math.max(-2, Math.min(14, this.speedBoost - e.deltaY * 0.01));
    }, { passive: false });

    const loop = () => {
      if (this.running) {
        this.speedBoost *= 0.97; // 加速效果衰减
        this.cam += Math.max(this.SPEED_MIN, this.cfg.speed + this.speedBoost);
        this.lookX *= 0.995;
        this.lookY *= 0.995;
        this.space.style.transform =
          `rotateY(${this.lookX}deg) rotateX(${this.lookY}deg) translateZ(${this.cam}px)`;
        for (const it of this.items) {
          const rel = it.z - this.cam;
          if (rel <= this.cfg.near) {
            // 到达用户设置的最近距离：回收送到隧道尽头，并换成下一张未出场的照片
            it.z += this.DEPTH;
            it.photoIdx = this.nextPhoto % PHOTOS.length;
            this.nextPhoto++;
            const p = PHOTOS[it.photoIdx];
            it.img.alt = photoName(p);
            it.src = thumbSrc(p);
            it.full = p.src;
            it.loaded = false;
            // 清掉上一张照片的宽高比样式，等新图加载后重新计算
            it.el.style.width = "";
            it.el.style.aspectRatio = "";
            this.place(it);
            it.visible = false;
            it.el.style.visibility = "hidden";
            it.el.style.opacity = "0";
            continue;
          }
          const vis = rel < this.VISIBLE_DEPTH;
          if (vis !== it.visible) {
            it.visible = vis;
            it.el.style.visibility = vis ? "" : "hidden";
            it.el.style.opacity = vis ? "1" : "0"; // 远处淡入，不硬闪出来
            // 进入可视深度才开始加载，避免一次性拉全部原图
            if (vis && !it.loaded) {
              it.loaded = true;
              it.img.onerror = () => { it.img.onerror = null; it.img.src = it.full; };
              it.img.src = it.src;
            }
          }
        }
        this.drawStars();
        SaturnSky.render(performance.now() / 1000, this.lookX, this.lookY);
        this.maybeShoot();
      }
      requestAnimationFrame(loop);
    };
    loop();
  },
  place(it) {
    it.el.style.transform =
      `translate(-50%, -50%) translate3d(${it.x}vw, ${it.y}vh, ${-it.z}px)`;
  },

  /* ----- 设置面板的存取（右上角 ⚙ → 星河漫游） ----- */
  loadCfg() {
    let cfg = {
      speed: this.DEF_SPEED,
      planet: this.DEF_PLANET,
      slots: this.DEF_SLOTS,
      near: this.DEF_NEAR,
    };
    try {
      cfg = Object.assign(cfg, JSON.parse(localStorage.getItem("galaxyCfg") || "{}"));
    } catch (e) { /* 存了坏数据就回落默认 */ }
    // 旧版 depth 表示远处开始显示的位置，语义与新版相反，不能沿用。
    delete cfg.depth;
    // 越界值（比如手改过 localStorage）夹回滑条范围
    const clamp = (v, lo, hi, dflt) => (isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
    cfg.speed = clamp(+cfg.speed, this.SPEED_MIN, this.SPEED_MAX, this.DEF_SPEED);
    cfg.planet = clamp(+cfg.planet, this.PLANET_MIN, this.PLANET_MAX, this.DEF_PLANET);
    cfg.slots = Math.round(clamp(+cfg.slots, this.MIN_SLOTS, this.MAX_SLOTS, this.DEF_SLOTS));
    cfg.near = clamp(+cfg.near, this.MIN_NEAR, this.MAX_NEAR, this.DEF_NEAR);
    this.cfg = cfg;
    SaturnSky.scale = cfg.planet;
  },
  saveCfg() {
    localStorage.setItem("galaxyCfg", JSON.stringify(this.cfg));
  },
  setSpeed(v) { this.cfg.speed = v; this.saveCfg(); },
  setPlanet(v) { this.cfg.planet = v; this.saveCfg(); SaturnSky.scale = v; },
  // 同屏照片数实时增减：新增的槽位生成在当前机位前方的隧道深处，飞近了
  // 自然淡入；减少的从末尾摘掉，其余照片的分布不受影响
  setSlots(v) {
    this.cfg.slots = Math.round(v);
    this.saveCfg();
    this.buildSlots();
  },
  setNear(v) { this.cfg.near = v; this.saveCfg(); },
  resetCfg() {
    this.cfg.speed = this.DEF_SPEED;
    this.cfg.planet = this.DEF_PLANET;
    this.cfg.slots = this.DEF_SLOTS;
    this.cfg.near = this.DEF_NEAR;
    this.saveCfg();
    SaturnSky.scale = this.cfg.planet;
    this.buildSlots();
  },
  // 按 cfg.slots 增删照片槽位（init 与设置面板共用），照片总数不足时封顶
  buildSlots() {
    const want = Math.min(this.cfg.slots, PHOTOS.length);
    while (this.items.length < want) this.items.push(this.makeItem());
    while (this.items.length > want) this.items.pop().el.remove();
  },
  makeItem() {
    const it = {
      el: el("div", "galaxy-photo"),
      img: el("img"),
      photoIdx: this.nextPhoto % PHOTOS.length,
      x: rand(-46, 46),          // vw
      y: rand(-38, 38),          // vh
      // 距相机的深度（中途增补时从当前机位前方、消失线之外生成）
      z: this.cam + rand(Math.max(400, this.cfg.near + 100), this.DEPTH),
      visible: false,
      loaded: false,
    };
    this.nextPhoto++;
    const p = PHOTOS[it.photoIdx];
    it.el.style.visibility = "hidden";
    it.img.alt = photoName(p);
    it.img.decoding = "async";
    // 图片加载完成后，按真实宽高比调整相框（横图横放、竖图竖放，不裁剪）
    it.img.onload = () => {
      const nw = it.img.naturalWidth, nh = it.img.naturalHeight;
      if (!nw || !nh) return;
      it.el.style.aspectRatio = nw + " / " + nh;
      // 横图放宽宽度，不然长边被压得太小
      if (nw > nh) it.el.style.width = "clamp(170px, 24vw, 320px)";
    };
    it.src = thumbSrc(p);
    it.full = p.src;
    it.el.appendChild(it.img);
    this.space.appendChild(it.el);
    this.place(it);
    return it;
  },

  /* ----- 背景：星幕 canvas -----
   * 星星分布在隧道圆柱空间里，每帧按相机深度做透视投影，
   * 飞过身后的回收送到尽头，带闪烁与少量十字星芒。 */
  initStarfield() {
    const cv = el("canvas");
    cv.id = "galaxyStars";
    cv.setAttribute("aria-hidden", "true");
    this.stage.insertBefore(cv, this.space);
    this.starCv = cv;
    this.starCtx = cv.getContext("2d");
    this.stars = [];
    addEventListener("resize", () => this.resizeStars());
  },
  /* 画布尺寸只能在星河漫游显示出来之后量：页面藏着时 clientWidth 是 0，
   * 那样建出来的画布是 0×0，背景会整个消失。所以每次进入都重新量一次。 */
  resizeStars() {
    const cv = this.starCv;
    if (!cv) return;
    const w = this.stage.clientWidth || innerWidth;
    const h = this.stage.clientHeight || innerHeight;
    if (cv.width === w && cv.height === h && this.stars.length) return;
    cv.width = w;
    cv.height = h;
    const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#aedcff", "#ffc6de", "#d9ccff"];
    const N = w < 768 ? 150 : 320;
    this.stars = Array.from({ length: N }, () => ({
      dx: rand(-1, 1) * w * 0.85,  // 单位深度处的方向偏移（px）
      dy: rand(-1, 1) * h * 0.85,
      z: rand(80, this.DEPTH),
      r: rand(0.5, 1.7),
      tw: rand(0.6, 2.2),          // 闪烁频率
      ph: rand(0, Math.PI * 2),    // 闪烁相位
      c: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      bright: Math.random() < 0.08, // 少量亮星画星芒
    }));
  },
  drawStars() {
    const g = this.starCtx;
    if (!g) return;
    const cv = this.starCv;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, P = this.PERSPECTIVE;
    const t = performance.now() / 1000;
    // 拖拽环顾时星幕也跟着视差。方向与照片层一致（跟手）：
    // lookX 向右看 → 星幕左移；lookY 向下看 → 星幕下移，
    // 所以 oy 取负（rotateX 的正角把照片往下带，与 tan 的符号相反）。
    const ox = Math.tan((this.lookX * Math.PI) / 180) * P;
    const oy = -Math.tan((this.lookY * Math.PI) / 180) * P;
    g.clearRect(0, 0, W, H);
    for (const s of this.stars) {
      let rel = s.z - this.cam;
      if (rel < 60) { s.z += this.DEPTH; rel = s.z - this.cam; }
      const sc = P / rel;
      const x = cx + (s.dx - ox) * sc;
      const y = cy + (s.dy - oy) * sc;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const a = (0.38 + 0.62 * Math.abs(Math.sin(t * s.tw + s.ph))) * Math.min(1, sc * 1.4);
      const r = Math.min(3, s.r * sc);
      g.globalAlpha = a;
      g.fillStyle = s.c;
      g.beginPath();
      g.arc(x, y, r, 0, 6.2832);
      g.fill();
      if (s.bright && sc > 0.35) {
        // 亮星的十字星芒
        const L = r * 4;
        g.globalAlpha = a * 0.55;
        g.fillRect(x - L, y - 0.5, L * 2, 1);
        g.fillRect(x - 0.5, y - L, 1, L * 2);
      }
    }
    g.globalAlpha = 1;
  },

  /* ----- 背景：流星雨（时常成双成对地划过） ----- */
  maybeShoot() {
    const now = performance.now();
    if (now < this.nextShoot) return;
    this.nextShoot = now + rand(2800, 7000);
    this.shootOne();
    if (Math.random() < 0.35) {
      setTimeout(() => { if (this.running) this.shootOne(); }, rand(300, 900));
    }
  },
  shootOne() {
    const s = el("div", "shooting-star");
    // 朝左下或右下坠落
    const ang = Math.random() < 0.5 ? rand(20, 65) : rand(115, 160);
    const dist = rand(320, 620);
    const rad = (ang * Math.PI) / 180;
    s.style.setProperty("--ang", ang + "deg");
    s.style.setProperty("--dx", Math.cos(rad) * dist + "px");
    s.style.setProperty("--dy", Math.sin(rad) * dist + "px");
    s.style.left = rand(10, 90) + "%";
    s.style.top = rand(4, 45) + "%";
    s.addEventListener("animationend", () => s.remove());
    this.stage.appendChild(s);
  },

  enter() {
    // 背景两层都要等页面真正显示出来才量得到尺寸，所以放在这里初始化 / 重量
    this.resizeStars();
    if (!this.skyTried) {
      this.skyTried = true;
      SaturnSky.init(this.stage);
    } else {
      SaturnSky.resize();
    }
    this.running = true;
  },
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

/* ---------- 右上角「本页设置」面板 ----------
 * ⚙ 按钮在每个子页面下打开不同的设置面板：面板定义在 defs 里，想给别的
 * 子页面加设置再登记一项即可；没有登记的子页面会直接隐藏 ⚙ 按钮。
 * 目前有两页：
 *   3D 相册（ring）：旋转速度 + 图片大小；
 *   星河漫游（galaxy）：照片移动速度 + 行星大小 + 单次照片数量 + 照片消失距离。
 * 每次拖动即时生效并存 localStorage，可一键恢复默认值。 */
const ModeSettings = {
  defs: {
    ring: {
      title: "🎡 3D 相册设置",
      rows: [
        {
          label: "旋转速度",
          min: 0, max: Ring.SPEED_MAX, step: 0.1,
          get: () => Ring.cfg.speed,
          set: (v) => Ring.setSpeed(v),
          // 以新默认（老速度的一半）为 100%
          fmt: (v) => Math.round((v / Ring.DEF_SPEED) * 100) + "%",
        },
        {
          label: "图片大小",
          min: Ring.SIZE_MIN, max: Ring.SIZE_MAX, step: 0.05,
          get: () => Ring.cfg.size,
          set: (v) => Ring.setSize(v),
          fmt: (v) => v.toFixed(2) + "×",
        },
      ],
      reset: () => Ring.resetCfg(),
    },
    galaxy: {
      title: "🌌 星河漫游设置",
      rows: [
        {
          label: "照片移动速度",
          min: Galaxy.SPEED_MIN, max: Galaxy.SPEED_MAX, step: 0.1,
          get: () => Galaxy.cfg.speed,
          set: (v) => Galaxy.setSpeed(v),
          fmt: (v) => Math.round((v / Galaxy.DEF_SPEED) * 100) + "%",
        },
        {
          label: "行星大小",
          min: Galaxy.PLANET_MIN, max: Galaxy.PLANET_MAX, step: 0.05,
          get: () => Galaxy.cfg.planet,
          set: (v) => Galaxy.setPlanet(v),
          fmt: (v) => v.toFixed(2) + "×",
        },
        {
          label: "单次照片数量",
          min: Galaxy.MIN_SLOTS, max: Galaxy.MAX_SLOTS, step: 1,
          get: () => Galaxy.cfg.slots,
          set: (v) => Galaxy.setSlots(v),
          fmt: (v) => v + " 张",
        },
        {
          label: "照片消失距离",
          min: Galaxy.MIN_NEAR, max: Galaxy.MAX_NEAR, step: 50,
          get: () => Galaxy.cfg.near,
          set: (v) => Galaxy.setNear(v),
          fmt: (v) => "距镜头 " + Math.round(v) + " px",
        },
      ],
      reset: () => Galaxy.resetCfg(),
    },
  },
  btn: null, pop: null, mode: null,
  init() {
    this.btn = $("#settingsToggle");
    this.pop = $("#settingsPop");
    $("#settingsClose").addEventListener("click", () => this.close());
    $("#settingsReset").addEventListener("click", () => {
      const def = this.defs[this.mode];
      if (def && def.reset) def.reset();
      this.build(); // 重置后重建滑条，位置和数值一起刷新
    });
    this.btn.addEventListener("click", () =>
      this.pop.classList.contains("open") ? this.close() : this.open()
    );
    // 点到面板和按钮以外的地方就收起
    document.addEventListener("click", (e) => {
      if (!this.pop.classList.contains("open")) return;
      if (this.pop.contains(e.target) || this.btn.contains(e.target)) return;
      this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
    // 初始页面（可能带着 #hash 之外的默认页）也要先定一次按钮的显隐
    const active = document.querySelector(".mode-page.active");
    this.setMode(active ? active.id.replace("page-", "") : "");
  },
  // 切换子页面时调用：没有设置项的页面藏按钮、收面板
  setMode(mode) {
    this.mode = this.defs[mode] ? mode : null;
    this.btn.style.display = this.mode ? "" : "none";
    this.btn.title = this.mode ? this.defs[this.mode].title : "设置";
    this.close();
  },
  open() {
    if (!this.mode) return;
    this.build();
    this.pop.classList.add("open");
  },
  close() { this.pop.classList.remove("open"); },
  build() {
    const def = this.defs[this.mode];
    if (!def) return;
    $("#settingsTitle").textContent = def.title;
    const body = $("#settingsBody");
    body.innerHTML = "";
    for (const r of def.rows) body.appendChild(this.sliderRow(r));
  },
  // 一行设置：标签 + 实时数值 + 滑动条，拖动即时生效并记住
  sliderRow(r) {
    const row = el("div", "set-row");
    const head = el("div", "set-head");
    const label = el("span", "set-label");
    label.textContent = r.label;
    const val = el("span", "set-val");
    const range = el("input", "set-range");
    range.type = "range";
    range.min = r.min;
    range.max = r.max;
    range.step = r.step;
    range.value = r.get();
    range.setAttribute("aria-label", r.label);
    const sync = () => { val.textContent = r.fmt(+range.value); };
    range.addEventListener("input", () => {
      r.set(+range.value);
      sync();
    });
    sync();
    head.appendChild(label);
    head.appendChild(val);
    row.appendChild(head);
    row.appendChild(range);
    return row;
  },
};

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
  ModeSettings.init();
  // buildTimeline(); // 时间轴暂时下线：照片时间尚未标注
  // 支持 #ring / #galaxy / #slideshow 直达
  if (location.hash) switchMode(location.hash.slice(1));
})();
