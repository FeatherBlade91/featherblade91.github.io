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
    // 半径必须按「最宽的卡片」算：fitCard 会把横图放宽到 cardW*1.5，
    // 若按基础宽度算半径，横图会比卡槽弧长还宽，压住相邻卡片
    const maxCardW = cardW * 1.5;
    this.radius = Math.round((maxCardW / 2 + 14) / Math.tan(Math.PI / this.SLOTS));
  },
  assign(s) {
    const total = PHOTOS.length;
    s.photoIdx = ((s.pos % total) + total) % total;
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
    const baseW = this.ring.clientWidth || 170;
    const baseH = this.ring.clientHeight || 230;
    let w, h;
    if (ar >= 1) {
      // 横图：放宽宽度，但设上限，避免过宽压住相邻卡片
      w = Math.min(baseH * ar, baseW * 1.5);
      h = w / ar;
    } else {
      // 竖图：保持原高度
      h = baseH;
      w = baseH * ar;
    }
    s.el.style.width = w + "px";
    s.el.style.height = h + "px";
    s.el.style.left = (baseW - w) / 2 + "px";
    s.el.style.top = (baseH - h) / 2 + "px";
  },
};

/* ---------- 星河漫游 ----------
 * 照片散落在一条 3D 隧道里，相机匀速向前穿梭；
 * 隧道里同一时刻只保留少量照片槽位，飞过身后的槽位回收并
 * 换成未出场的照片，循环展示全集，控制内存与渲染开销。
 * 背景层：视野正中央一个 WebGL 粒子银河（参考 saturn.html 的粒子环，
 * 开普勒式差速旋转）+ canvas 星幕（深度视差 + 闪烁）+ 流星雨。 */
const Galaxy = {
  DEPTH: 7000,         // 隧道总长（px）
  VISIBLE_DEPTH: 5200, // 超过这个深度的照片隐藏且不加载，控制内存和流量
  PERSPECTIVE: 900,    // 与 .galaxy-stage 的 perspective 保持一致
  SLOTS: 36,           // 隧道里同时存在的照片数量
  cam: 0,
  speed: 2.4,
  speedBoost: 0,
  lookX: 0,
  lookY: 0,
  items: [], // 照片槽位 { el, img, src, full, x, y, z, photoIdx, visible, loaded }
  stars: [], // 星幕粒子
  nextPhoto: 0,
  nextShoot: 0,
  running: false,
  init() {
    this.stage = $("#galaxyStage");
    this.space = $("#galaxySpace");
    const total = PHOTOS.length;
    const slotCount = Math.min(this.SLOTS, total);
    for (let s = 0; s < slotCount; s++) {
      const it = {
        el: el("div", "galaxy-photo"),
        img: el("img"),
        photoIdx: s,
        x: rand(-46, 46),          // vw
        y: rand(-38, 38),          // vh
        z: rand(400, this.DEPTH),  // 距离相机的深度
        visible: false,
        loaded: false,
      };
      const p = PHOTOS[s];
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
      it.el.addEventListener("click", () => {
        if (!this.moved) Lightbox.open(it.photoIdx);
      });
      this.space.appendChild(it.el);
      this.place(it);
      this.items.push(it);
    }
    this.nextPhoto = slotCount;

    // 背景层：银河旋涡 + 星幕
    this.initStarfield();
    this.initWebGalaxy();

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
            // 飞到相机身后：回收送到隧道尽头，并换成下一张未出场的照片
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
        this.drawStars();
        this.renderWebGalaxy();
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
    const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#aedcff", "#ffc6de", "#d9ccff"];
    const resize = () => {
      cv.width = this.stage.clientWidth;
      cv.height = this.stage.clientHeight;
      const N = cv.width < 768 ? 190 : 460;
      this.stars = Array.from({ length: N }, () => ({
        dx: rand(-1, 1) * cv.width * 0.85,  // 单位深度处的方向偏移（px）
        dy: rand(-1, 1) * cv.height * 0.85,
        z: rand(80, this.DEPTH),
        r: rand(0.5, 1.7),
        tw: rand(0.6, 2.2),                 // 闪烁频率
        ph: rand(0, Math.PI * 2),           // 闪烁相位
        c: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
        bright: Math.random() < 0.08,       // 少量亮星画星芒
      }));
    };
    resize();
    addEventListener("resize", resize);
  },
  drawStars() {
    const g = this.starCtx;
    if (!g) return;
    const cv = this.starCv;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, P = this.PERSPECTIVE;
    const t = performance.now() / 1000;
    // 拖拽环顾时星幕也跟着轻微视差
    const ox = Math.tan((this.lookX * Math.PI) / 180) * P;
    const oy = Math.tan((this.lookY * Math.PI) / 180) * P;
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

  /* ----- 背景：WebGL 粒子银河 -----
   * 参考 saturn.html 的粒子环：数万颗粒子组成两条旋臂 + 银核，
   * 开普勒式差速旋转（内快外慢），加法混合，固定在视野正中央。 */
  initWebGalaxy() {
    const cv = el("canvas");
    cv.id = "galaxyGL";
    cv.setAttribute("aria-hidden", "true");
    this.stage.insertBefore(cv, this.stage.firstChild);
    const gl = cv.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) { cv.remove(); return; }
    this.gl = gl;
    this.glCv = cv;

    const VERT = `
      attribute float aAngle;
      attribute float aSpeed;
      attribute float aRadius;
      attribute float aY;
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uAspect;
      uniform mat3 uTilt;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float ang = aAngle + aSpeed * uTime;
        vec3 p = uTilt * vec3(aRadius * cos(ang), aY, aRadius * sin(ang));
        p.z -= 3.0;   // 银河整体推到远处
        float f = 1.9;
        gl_Position = vec4(p.x * f / (uAspect * -p.z), p.y * f / -p.z, 0.5, 1.0);
        gl_PointSize = aSize * (12.0 / -p.z);
        vColor = aColor;
        vAlpha = aAlpha;
      }`;
    const FRAG = `
      precision mediump float;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float soft = 1.0 - smoothstep(0.08, 0.5, d);
        gl_FragColor = vec4(vColor, soft * vAlpha);
      }`;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("galaxy shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { cv.remove(); this.gl = null; return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    /* 生成粒子：两条旋臂 + 中央银核 */
    const ARM_COUNT = 56000, BULGE_COUNT = 14000;
    const COUNT = ARM_COUNT + BULGE_COUNT;
    const data = new Float32Array(COUNT * 9); // angle speed radius y size alpha color*3
    // 银核暖白 → 中段粉 → 外臂蓝紫（饱和度拉高，加法混合下才留得住颜色）
    const lerp = (a, b, t) => a + (b - a) * t;
    const armColor = (t) => {
      const inner = [1.0, 0.85, 0.60], mid = [1.0, 0.50, 0.78], outer = [0.45, 0.60, 1.0];
      if (t < 0.45) {
        const k = t / 0.45;
        return [lerp(inner[0], mid[0], k), lerp(inner[1], mid[1], k), lerp(inner[2], mid[2], k)];
      }
      const k = (t - 0.45) / 0.55;
      return [lerp(mid[0], outer[0], k), lerp(mid[1], outer[1], k), lerp(mid[2], outer[2], k)];
    };
    const REF_R = 0.8, REF_W = 0.05; // 开普勒归一化：ω ∝ r^(-3/2)
    for (let i = 0; i < COUNT; i++) {
      const o = i * 9;
      let angle, r, y, size, alpha, col;
      if (i < ARM_COUNT) {
        const t = Math.pow(Math.random(), 0.55);          // 0=核 1=外缘
        r = 0.16 + t * 1.74;
        const wind = (i % 2) * Math.PI + t * 4.6;         // 旋臂缠绕
        const scatter = (Math.random() + Math.random() + Math.random() - 1.5) * 0.34 * (1.3 - t * 0.7);
        angle = wind + scatter;
        y = (Math.random() + Math.random() - 1) * 0.02 * (1.2 - t);
        size = rand(0.5, 1.6);
        alpha = (0.85 - t * 0.35) * rand(0.4, 1);
        col = armColor(t);
      } else {
        // 银核：小球状星团
        const g1 = Math.random() + Math.random() + Math.random() - 1.5; // 近似高斯
        r = Math.abs(g1) * 0.15 + 0.02;
        angle = Math.random() * Math.PI * 2;
        y = g1 * 0.055;
        size = rand(0.5, 1.6);
        alpha = rand(0.6, 1);
        col = [1.0, 0.95, 0.82];
      }
      data[o] = angle;
      data[o + 1] = REF_W * Math.pow(REF_R / r, 1.5);
      data[o + 2] = r;
      data[o + 3] = y;
      data[o + 4] = size;
      data[o + 5] = alpha;
      data[o + 6] = col[0];
      data[o + 7] = col[1];
      data[o + 8] = col[2];
    }
    this.glCount = COUNT;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const STRIDE = 36;
    ["aAngle", "aSpeed", "aRadius", "aY", "aSize", "aAlpha"].forEach((name, k) => {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, STRIDE, k * 4);
    });
    const locColor = gl.getAttribLocation(prog, "aColor");
    gl.enableVertexAttribArray(locColor);
    gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, STRIDE, 24);

    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uAspect = gl.getUniformLocation(prog, "uAspect");
    this.uTilt = gl.getUniformLocation(prog, "uTilt");

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // 加法混合，星点叠加发亮
    gl.clearColor(0, 0, 0, 0);

    // 3x3 矩阵小工具（列主序）
    const m3mul = (A, B) => {
      const o = new Float32Array(9);
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++)
          o[j * 3 + i] = A[i] * B[j * 3] + A[3 + i] * B[j * 3 + 1] + A[6 + i] * B[j * 3 + 2];
      return o;
    };
    const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, c, s, 0, -s, c]); };
    const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]); };
    const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1]); };
    // 基础倾角：盘面斜对镜头
    const baseTilt = m3mul(rotZ(-0.35), rotX(0.85));
    this.computeTilt = () => {
      const lx = (this.lookX * Math.PI / 180) * 0.35;
      const ly = (this.lookY * Math.PI / 180) * 0.35;
      return m3mul(m3mul(rotY(lx), rotX(ly)), baseTilt);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = this.stage.clientWidth * dpr;
      cv.height = this.stage.clientHeight * dpr;
      gl.uniform1f(this.uAspect, cv.width / cv.height);
    };
    resize();
    addEventListener("resize", resize);
  },
  renderWebGalaxy() {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, this.glCv.width, this.glCv.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.uTime, performance.now() / 1000);
    gl.uniformMatrix3fv(this.uTilt, false, this.computeTilt());
    gl.drawArrays(gl.POINTS, 0, this.glCount);
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
