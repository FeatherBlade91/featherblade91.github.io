/* ============================================================
 * 主逻辑：数据加载 / 模式切换 / 五种观看模式 / 计时器 /
 * 泡泡与星光背景 / 灯箱 / 悄悄话 / 音乐开关
 * ============================================================ */

let PHOTOS = []; // { src, date, caption, milestone }
const HOME_POLAROID = { idx: -1, render: null };

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
 * 「拖过」。dragButton 默认 0（左键）；星河传 1，改用按住滚轮拖拽，
 * 从输入层彻底避免与左键查看照片冲突。
 * 想看大图的模式统一在单击里调 Lightbox.open()——
 * 大图呈现全站只有灯箱这一套，别另写。
 * 注意：不要用 setPointerCapture，它会把 click 重定向到舞台元素，
 * 照片卡片上的单击就收不到了。 */
function makeSceneDrag(stage, onDrag, dragButton = 0) {
  const t = {
    CLICK_SLACK: 7, // 单击容许的指间晃动（px），从按下点起算总位移
    dragging: false,
    moved: false,
    pointerId: null,
    x0: 0, y0: 0, lastX: 0, lastY: 0,
  };
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== dragButton) return;
    // 已在拖拽中又来了第二根手指：忽略，别重置起点（星河的双指捏合在 Galaxy 里单独处理）
    if (t.dragging) return;
    // 中键默认会触发浏览器自动滚屏，星河用它拖拽时需要阻止。
    if (dragButton === 1) e.preventDefault();
    t.dragging = true;
    t.moved = false;
    t.pointerId = e.pointerId;
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
    t.pointerId = null;
  });
  window.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== t.pointerId) return;
    t.dragging = false;
    t.pointerId = null;
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
  // 减量求精：约一半的泡泡 + CSS 给 1/3 加模糊，做出景深
  for (let i = 0; i < 14; i++) {
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
    switchBtn.textContent = mode === "days" ? "⇄ 换成 几年几月几周几天" : "⇄ 换成 总天数";
  }

  function currentVals() {
    const nowB = beijingNow();
    let diff = Math.max(0, nowB.getTime() - startUtc);
    const h = Math.floor((diff % 86400000) / 3600000);
    const mi = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (mode === "days") return [Math.floor(diff / 86400000), h, mi, s];
    const c = calendarParts(nowB);
    return [c.y, c.m, c.w, c.d, h, mi, s];
  }

  function showVals(vals) {
    vals.forEach((v, i) => {
      numEls[i].textContent = mode === "days" && i > 0 ? String(v).padStart(2, "0") : v;
    });
  }

  // 首次进入 / 切换计时方式时数字从 0 滚到目标值，随后交还给每秒 tick
  let counting = false;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(vals) {
    if (reduceMotion) { showVals(vals); return; }
    counting = true;
    const t0 = performance.now(), D = 1100;
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    (function step(now) {
      const k = Math.min(1, (now - t0) / D);
      showVals(vals.map((v) => Math.round(v * ease(k))));
      if (k < 1) requestAnimationFrame(step);
      else { counting = false; tick(); }
    })(t0);
  }

  function tick() {
    if (counting) return;
    showVals(currentVals());
  }

  switchBtn.addEventListener("click", () => {
    mode = mode === "days" ? "calendar" : "days";
    localStorage.setItem("timerMode", mode);
    buildCells();
    countUp(currentVals());
  });
  buildCells();
  countUp(currentVals());
  setInterval(tick, 1000);

  // 计时卡右上角贴的拍立得：随机一张照片，点开看大图（走全站统一的灯箱）
  (function polaroid() {
    const btn = $("#heroPolaroid");
    if (!btn || !PHOTOS.length) return;
    const img = $("#polaroidImg");
    const render = (i) => {
      HOME_POLAROID.idx = i;
      img.alt = photoName(PHOTOS[i]);
      setThumb(img, PHOTOS[i]);
      $("#polaroidCap").textContent = photoName(PHOTOS[i]);
    };
    HOME_POLAROID.render = render;
    render(Math.floor(Math.random() * PHOTOS.length));
    btn.hidden = false;
    btn.addEventListener("click", () => Lightbox.open(HOME_POLAROID.idx, { homePolaroid: true }));
  })();

  // 下一个纪念日提醒：取 milestones 里离今天（北京时间）最近的一个
  (function nextMilestone() {
    const box = $("#heroMilestone");
    const list = SITE_CONFIG.milestones || [];
    if (!box || !list.length) return;
    const nowB = beijingNow();
    const today = Date.UTC(nowB.getUTCFullYear(), nowB.getUTCMonth(), nowB.getUTCDate());
    let best = null;
    for (const m of list) {
      const [mm, dd] = (m.date || "").split("-").map(Number);
      if (!mm || !dd) continue;
      let t = Date.UTC(nowB.getUTCFullYear(), mm - 1, dd);
      if (t < today) t = Date.UTC(nowB.getUTCFullYear() + 1, mm - 1, dd);
      const days = Math.round((t - today) / 86400000);
      if (!best || days < best.days) best = { days, title: m.title };
    }
    if (!best) return;
    const name = el("span", "ms-name");
    name.textContent = "「" + best.title + "」";
    if (best.days === 0) {
      box.append("今天就是 ", name, " ✦");
    } else {
      const d = el("span", "ms-days");
      d.textContent = best.days;
      box.append("距 ", name, " 还有 ", d, " 天");
    }
    box.hidden = false;
  })();
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
  BAND: 37,         // 拍立得下巴：3px 上边 + 34px 白边放标题（对应 css 里 border-width: 3px 3px 34px，别只改一边）
  GAP: 28,          // 相邻卡片的间距（px，沿环的弧长测量）——恒定，不随图片大小设置变
  FRONT_ZOOM: 1.3,  // 最前排卡片相对实际尺寸的放大倍数
  DEF_SPEED: 1.2,   // 默认自转速度（px / 帧；设置面板上线前的老速度是 2.4，减半）
  SPEED_MAX: 4.8,   // 速度滑条上限（老速度的 2 倍）
  DEF_SIZE: 1.6,    // 默认图片大小（舞台基准的倍数；面板上线前是 1.0）
  SIZE_MIN: 0.5,    // 大小滑条范围
  SIZE_MAX: 2.2,
  TILT_MIN: -80,    // 俯仰范围：±80°，抬上去能俯瞰整个环（露出后半圈的奶油纸背）
  TILT_MAX: 80,
  DEF_ZOOM: 1,      // 镜头远近（乘在环的 scale 上；滚轮/双指/设置面板同一个值）
  ZOOM_MIN: 0.6,
  ZOOM_MAX: 1.8,
  cam: 0,           // 相机位置（沿环的弧长 px，单调可正可负）
  velocity: 0,
  nowIdx: -1,       // 当前朝前卡片的 photoIdx（底部「正在看哪张」一行用它）
  frontSlot: null,  // 当前最前排的 slot（.is-front 柔光只给它）
  cfg: null,        // { speed, size, zoom } 用户设置，loadCfg 从 localStorage 恢复
  tilt: -6,
  assemble: 1,      // 进入组装动画进度 0→1（enter 重置为 0，卡片从中心旋出归位）
  pinching: false,  // 双指捏合中为 true，此时单指拖拽回调只缩放不转环
  dragging: false,
  slots: [],        // { el, front, back, img, cap, backName, backDate, photoIdx, w, h, s }  s = 中心弧长坐标
  order: [],        // slots 下标，按环上的先后顺序（order[0] 在队尾方向）
  base: 0,          // order[0] 起始边的绝对弧长坐标
  radius: 0,
  length: 1,        // 环的总弧长 L
  init() {
    this.loadCfg();
    this.ring = $("#ring");
    this.stage = $("#ringStage");
    const stage = this.stage;
    this.floorEl = stage.querySelector(".ring-floor");
    this.build();
    addEventListener("resize", () => this.layout());

    // 拖拽 / 单击判定走共用的 makeSceneDrag，单击看大图走共用的 Lightbox
    this.track = makeSceneDrag(stage, (dx, dy) => {
      if (this.pinching) return; // 双指捏合时只缩放
      this.velocity = dx * 2.4;
      this.cam -= dx * 2.4;
      // 跟手：往下拖 = 把环的上沿压下来 = 俯瞰（看后半圈的背面）；往上拖 = 仰视
      this.tilt = Math.max(this.TILT_MIN, Math.min(this.TILT_MAX, this.tilt - dy * 0.15));
    });

    // 滚轮推拉镜头（对数步进，手感均匀；与星河同一写法）
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0009));
    }, { passive: false });

    // 双指捏合推拉镜头（触屏）：与单指拖拽互斥
    const pts = new Map();
    let pinchDist = 0;
    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { this.pinching = true; pinchDist = 0; }
    });
    window.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2) return;
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) this.zoomBy(dist / pinchDist); // 双指张开 → 拉近
      pinchDist = dist;
    });
    const endPinch = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { this.pinching = false; pinchDist = 0; }
      // 捏合结束剩一根手指继续拖：把拖拽基准挪到这根手指当前位置，避免跳变
      if (pts.size === 1 && this.track.dragging) {
        const p = [...pts.values()][0];
        this.track.lastX = p.x;
        this.track.lastY = p.y;
      }
    };
    window.addEventListener("pointerup", endPinch);
    window.addEventListener("pointercancel", endPinch);

    const loop = () => {
      // 进入组装动画：进度缓动收敛到 1（切回本模式时 enter 会重置）
      if (this.assemble < 1) {
        this.assemble += (1 - this.assemble) * 0.045;
        if (this.assemble > 0.995) this.assemble = 1;
      }
      if (!this.track.dragging) {
        // 惯性衰减 + 默认缓慢自转（速度可在右上角设置面板调）；俯仰不再自动回正，
        // 用户抬到哪个角度看环，就停在哪个角度
        this.velocity += (-this.cfg.speed - this.velocity) * 0.02;
        this.cam -= this.velocity;
        // 自转关闭时，松手后把最近的一张卡缓缓转正吸附到面前
        if (this.cfg.speed === 0 && Math.abs(this.velocity) < 0.3) {
          let nearest = null;
          for (const s of this.slots) {
            if (!nearest || Math.abs(s.s - this.cam) < Math.abs(nearest.s - this.cam)) nearest = s;
          }
          if (nearest) this.cam += (nearest.s - this.cam) * 0.08;
        }
      }
      const rad = (this.tilt * Math.PI) / 180;
      const sinT = Math.sin(rad), cosT = Math.cos(rad);
      // pull：0 = 平视（|tilt| ≤ 15°，取景与改造前一致）→ 1 = 俯瞰（80°）。
      // 环在屏幕上的竖直跨度 ≈ 2·R·scale·sinθ，而舞台只有几百像素高，
      // 所以越俯瞰越要把环整体拉远，否则永远只能看见前排一道弧、看不到后半圈
      const pull = Math.max(0, (Math.abs(sinT) - 0.2588) / 0.7412);
      // 必须用 scale3d——CSS 的 scale() 是 2D 的，不缩 z，环会被拉成椭圆
      const scale = this.cfg.zoom / (1 + 6 * Math.pow(pull, 1.4));
      // 竖直补偿系数 = 前排居中项（1.1，平视时的老行为：把掉下去的前排抬回来）
      // 减去俯瞰偏移项（2·pull^1.5·cosT²）：浅俯仰时几乎不影响取景，
      // 中俯仰时把环往远侧推、后半圈的照片背面才进得了画面；
      // 到正俯瞰（cosT→0）偏移自动归零，圆环保持居中
      const liftK = 1.1 * (1 - pull) - 2 * Math.pow(pull, 1.5) * cosT * cosT;
      const lift = sinT * this.radius * scale * liftK;
      this.ring.style.transform =
        `translateY(${lift.toFixed(1)}px) rotateX(${this.tilt.toFixed(2)}deg) scale3d(${scale.toFixed(4)}, ${scale.toFixed(4)}, ${scale.toFixed(4)})`;
      // 地面光晕随俯仰淡出——俯瞰时它不该还挂在环底下
      if (this.floorEl) this.floorEl.style.opacity = (1 - 0.8 * Math.abs(sinT)).toFixed(3);
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
      let front = null;
      const asm = this.assemble;
      for (const s of this.slots) {
        const deg = ((s.s - this.cam) / this.radius) * 180 / Math.PI;
        // 组装动画：角度与半径一起从 0 展开，卡片从中心旋出、逐张归位
        s.el.style.transform = `rotateY(${(deg * asm).toFixed(2)}deg) translateZ(${(this.radius * asm).toFixed(1)}px)`;
        // 景深：t=1 正对镜头最亮最饱和，转去背面略暗略灰——
        // 底噪要留在可读区间（0.78 起），奶油纸背上还写着照片名。
        // 注意 filter 必须写在两个 face 上、不能写在 card 上：
        // filter 会把元素强制拍平（transform-style: flat），写在 card 上
        // 双面翻面的 backface 判定就失效了，背面位置会透出镜像的正面
        const t = (Math.cos((deg * Math.PI) / 180) + 1) / 2;
        const dof = `brightness(${(0.78 + 0.22 * t).toFixed(3)}) saturate(${(0.7 + 0.3 * t).toFixed(3)})`;
        s.front.style.filter = dof;
        s.back.style.filter = dof;
        // 组装期间两面整体淡入（opacity 写在 face 上是 3D 安全的；写在 card 上会拍平双面）
        if (asm < 1) {
          s.front.style.opacity = asm.toFixed(3);
          s.back.style.opacity = asm.toFixed(3);
        } else if (s.front.style.opacity) {
          s.front.style.opacity = "";
          s.back.style.opacity = "";
        }
        if (!front || Math.abs(s.s - this.cam) < Math.abs(front.s - this.cam)) front = s;
      }
      // 最前排换人时，更新底部「正在看哪张」的一行
      if (front && front.photoIdx !== this.nowIdx) {
        this.nowIdx = front.photoIdx;
        this.renderNow(front);
      }
      // 前排柔光只给当前最前排的卡（换人才动 class，不每帧写）
      if (front !== this.frontSlot) {
        if (this.frontSlot) this.frontSlot.el.classList.remove("is-front");
        if (front) front.el.classList.add("is-front");
        this.frontSlot = front;
      }
      requestAnimationFrame(loop);
    };
    loop();
  },
  /* ----- 设置面板的存取（右上角 ⚙ → 3D 相册） ----- */
  loadCfg() {
    let cfg = { speed: this.DEF_SPEED, size: this.DEF_SIZE, zoom: this.DEF_ZOOM };
    try {
      cfg = Object.assign(cfg, JSON.parse(localStorage.getItem("ringCfg") || "{}"));
    } catch (e) { /* 存了坏数据就回落默认 */ }
    // 越界值（比如手改过 localStorage）夹回滑条范围
    cfg.speed = Math.max(0, Math.min(this.SPEED_MAX, +cfg.speed || 0));
    cfg.size = Math.max(this.SIZE_MIN, Math.min(this.SIZE_MAX, +cfg.size || 0));
    cfg.zoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, +cfg.zoom || this.DEF_ZOOM));
    this.cfg = cfg;
    this.velocity = -cfg.speed;
  },
  saveCfg() {
    localStorage.setItem("ringCfg", JSON.stringify(this.cfg));
  },
  setSpeed(v) { this.cfg.speed = v; this.saveCfg(); },
  setSize(v) { this.cfg.size = v; this.saveCfg(); this.layout(); },
  setZoom(v) {
    this.cfg.zoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, v));
    this.saveCfg();
  },
  zoomBy(f) { this.setZoom(this.cfg.zoom * f); },
  resetCfg() {
    this.cfg.speed = this.DEF_SPEED;
    this.cfg.size = this.DEF_SIZE;
    this.cfg.zoom = this.DEF_ZOOM;
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
      // 正面：拍立得（img + 下巴标题）；背面：奶油纸 + 照片名（assign 里填内容）
      const front = el("div", "ring-face ring-front");
      const img = el("img");
      img.loading = "lazy";
      const cap = el("div", "ring-caption");
      front.appendChild(img);
      front.appendChild(cap);
      const back = el("div", "ring-face ring-back");
      const backName = el("div", "ring-back-name");
      const backDate = el("div", "ring-back-date");
      back.appendChild(backName);
      back.appendChild(backDate);
      card.appendChild(front);
      card.appendChild(back);
      // 先按 3:4 占位，图片加载完成后 fitCard 按真实宽高比重算
      const s = { el: card, front, back, img, cap, backName, backDate, photoIdx: i % PHOTOS.length, w: u * 0.87, h: u * 1.15, s: 0 };
      card.style.width = s.w.toFixed(1) + "px";
      card.style.height = (s.h + this.BAND).toFixed(1) + "px"; // 含拍立得下巴
      card.style.left = (-s.w / 2).toFixed(1) + "px";
      card.style.top = (-s.h / 2 - 3).toFixed(1) + "px"; // 照片部分（不含下巴）居中在锚点上
      // 点击监听挂在卡片上，正反面都能点开同一张大图
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
  // 页面藏着的时候 stage 量不到尺寸，进来时按真实舞台重排一次；
  // 同时重置组装动画，让卡片重新从中心旋出归位
  enter() { this.assemble = 0; this.layout(); },
  assign(s) {
    const p = PHOTOS[s.photoIdx];
    s.img.alt = photoName(p);
    // 图片加载完成后，按真实宽高比调整相框（横图横放、竖图竖放，不裁剪）
    s.img.onload = () => this.fitCard(s);
    setThumb(s.img, p);
    s.cap.textContent = photoName(p);
    // 奶油纸背：照片名是唯一主角，日期有就带上一小行
    s.backName.textContent = photoName(p);
    s.backDate.textContent = p.date || "";
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
    s.el.style.height = (h + this.BAND).toFixed(1) + "px"; // 高度含拍立得下巴
    // .ring 是 0×0 的锚点，照片部分（不含下巴）以它为中心摆
    s.el.style.left = (-w / 2).toFixed(1) + "px";
    s.el.style.top = (-h / 2 - 3).toFixed(1) + "px";
    this.recompute();
  },
  // 底部一行衬线小字：正在看的是哪张（标题 + 日期，随最前排卡片更新）
  renderNow(slot) {
    if (!this.nowEl) this.nowEl = $("#ringNow");
    const box = this.nowEl;
    if (!box) return;
    const p = PHOTOS[slot.photoIdx];
    const name = el("span", "rn-name");
    name.textContent = photoName(p);
    box.replaceChildren(name);
    if (p.date) {
      const d = el("span", "rn-date");
      d.textContent = p.date;
      box.appendChild(d);
    }
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

  /* ===== 相机（Galaxy 每帧调这两个算机位，再把自己的 view 矩阵拿去摆照片；
   * 两层共用一台相机，对齐原理见 Galaxy 的头注释） ===== */
  // 相机距离（世界单位）：行星大小设置除进基准距离，zoom 是用户推拉倍率；
  // 竖屏视野窄，退远一点免得占满整块屏。下限贴在照片环外 10：再近相机就
  // 钻进照片环里去了（环绕半径可调，下限跟着它走）。
  camD(zoom, aspect) {
    const wide = aspect > 1.1;
    return Math.max(Galaxy.ORBIT_W + 10, (this.DIST / this.scale) * zoom * (wide ? 1 : 1.5));
  },
  // 绕原点的轨道机位：az 方位角、elev 仰角（rad）、d 距离
  eyeFrom(az, elev, d) {
    return [
      Math.sin(az) * Math.cos(elev) * d,
      Math.sin(elev) * d,
      Math.cos(az) * Math.cos(elev) * d,
    ];
  },

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
       uniform float uSpin;
       varying float vAlpha;
       void main() {
         // 内圈快、外圈慢；uSpin = 照片环的拖动角：拨动照片时星环同步跟随
         float angle = aAngle + aSpeed * uTime + uSpin;
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

  /* 每帧渲染。机位由 Galaxy 统一计算（照片层与土星层共用一台相机，
   * 对齐原理见 Galaxy 的头注释），这里只收渲染参数：
   * cam = { eye, pulse, spin }；pulse 是点土星的心跳脉冲（0..1，随帧衰减），
   * spin 是照片环的拖动角 φ（粒子环同步跟随，自身开普勒自转保留）。 */
  render(t, cam) {
    const gl = this.gl;
    if (!gl || !this.ready) return;
    const eye = cam.eye;
    const pulse = cam.pulse || 0;
    const breathe = 1 + pulse * 0.03; // 脉冲时行星轻轻呼吸
    const W = this.cv.width, H = this.cv.height;
    gl.viewport(0, 0, W, H);
    // 深度的 clear 受 depthMask 掩码控制，而上一帧结尾（环/辉光 pass）把它关了——
    // 不先打开，深度缓冲永远清不掉，行星本体会被上一帧的残影深度整块挡掉，
    // 只剩环粒子和辉光的一点光晕（曾经长期把那团光误当成土星本体）
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = W / H;
    // 土星居中：不额外平移，照片环（CSS 层）与它同心、同机位
    const proj = this.perspective(Math.PI / 4, aspect, 1, 4000, 0, 0);
    const view = this.lookAt(eye, [0, 0, 0]);
    const pxScale = H / 900; // 点的大小跟分辨率走，换屏幕不会忽大忽小

    // 行星：倾角 → 自转 → 压扁；法线要用逆转置，压扁的方向反过来除。
    // 呼吸是均匀缩放，不影响法线方向，normalMat 不用带 breathe。
    const spin = this.rotY(t * 0.12);
    const tilt = this.rotZ(this.TILT);
    const planetModel = this.mul(tilt, this.mul(spin, this.scaleM(breathe, breathe * this.FLATTEN, breathe)));
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
    gl.uniform1f(this.planetProg.u.uExposure, 0.82 * (1 + 0.3 * pulse)); // 背景层压一点曝光；脉冲时提亮
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
    gl.uniform1f(this.ringProg.u.uSpin, cam.spin || 0);
    gl.uniform1f(this.ringProg.u.uScale, 380 * pxScale);
    gl.uniform3f(this.ringProg.u.uColor, 0.88, 0.8, 0.62);
    gl.drawArrays(gl.POINTS, 0, this.RING_COUNT);

    /* --- 大气辉光（脉冲时光晕涨一点） --- */
    this.use(this.haloProg, this.haloBuf, [["aQuad", 2, 0]], 2);
    gl.uniformMatrix4fv(this.haloProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.haloProg.u.uView, false, view);
    gl.uniform2f(this.haloProg.u.uSize, 26 * (1 + 0.3 * pulse), 23 * (1 + 0.3 * pulse));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  },
};

/* ---------- 星河漫游：土星环上的照片 ----------
 * 照片挂在一条与土星粒子环同心、共面（同 26.7° 转轴倾角）的外侧轨道上，
 * 像环上的卫星一样绕土星公转：左右拖 = 拨动星环（粒子环经 ringProg 的
 * uSpin = φ 同步跟随，自身仍保留开普勒差速自转），上下拖 = 相机仰角
 * （松手保持不弹回），滚轮/双指 = 推拉远近；土星始终屏幕居中。
 *
 * 同时在环上的照片数量有限（设置面板「照片数量」可调，默认 48）：总数超出时，
 * 照片转到离镜头最远的弧点就淡出并接力换成下一张（recycle，tail +1 保证
 * 不重复、遍历全相册），在途缩略图始终只有一小批，不会一次性拉动整个相册的下载。
 *
 * 两层对齐（本页的地基，改相机前先读）：
 * 照片是 CSS 3D，土星是 WebGL，两层共用一台相机——每帧由 Galaxy 算出
 * 机位（az 缓慢公转 + elev/zoom），经 SaturnSky.eyeFrom / lookAt 得
 * view 矩阵：一份传给 SaturnSky.render 画土星，一份用来摆照片。
 * CSS 侧取 perspective P = (stageH/2)/tan(22.5°)，与 WebGL fovy=45°
 * 精确等价。关键是摆法：CSS 合成器对 translate3d(x, y, z) 整体再做一次
 * P/(P−z) 投影缩放，所以 x/y 必须直接摆 view 空间坐标（乘 px 换算 kPx）、
 * 投影交给 CSS——translate3d(vx·kPx, −vy·kPx, P+vz·kPx) 的落点正好是
 * (P·vx/(−vz), −P·vy/(−vz))，与 WebGL 逐像素一致。若 x/y 预先除以 −vz
 * 「帮」它投影，会被合成器二次缩放：照片环整体往中心塌、越远塌得越狠，
 * 与粒子环明显错开（曾经的 bug，数值验证：旧方案偏差最多 706px，新方案 0）。
 * 元素不旋转即正对镜头，因为 view 空间里相机永远朝 −z 看。
 * 照片转到土星背后时被行星「掩食」：按屏幕距离平滑淡出（rS = 21·P/d）。
 * 右上角设置面板（ModeSettings）能调五样：星环自转速度 / 行星大小 / 照片大小 /
 * 照片数量 / 环绕半径。 */
const Galaxy = {
  TILT: SaturnSky.TILT, // 与土星转轴倾角一致：照片环与粒子环共面
  ORBIT_W: 69,          // 照片轨道半径（世界单位，「环绕半径」设置的当前值，初值=DEF_ORBIT）
  PLANET_R: 21,         // 掩食/点按判定用的行星视半径（本体 20 + 一点余量）
  ELEV_DEF: 0.36,       // 相机仰角默认值（rad）
  ELEV_MIN: 0.08,
  ELEV_MAX: 1.15,
  ZOOM_DEF: 0.95,       // 相机距离倍率（乘在 DIST/scale 上，见 SaturnSky.camD）
  ZOOM_MIN: 0.75,
  ZOOM_MAX: 2.8,
  /* ----- 设置面板各项：默认值 + 滑条范围（存 localStorage，见 loadCfg） ----- */
  DEF_SPEED: 0.02,      // 星环自转默认速度（度/帧；整圈约 5 分钟）
  SPEED_MAX: 0.08,
  DEF_PLANET: 1.8,      // 行星大小：等比例缩放土星（含星环），直接作用在 SaturnSky.scale
  PLANET_MIN: 0.5,
  PLANET_MAX: 3.0,
  DEF_SIZE: 1.5,        // 照片大小（基准卡宽的倍数）
  SIZE_MIN: 0.6,
  SIZE_MAX: 1.8,
  DEF_COUNT: 48,        // 同时在环的照片数量默认；总数超出就在最远弧点回收换图
  COUNT_MIN: 4,
  COUNT_MAX: 60,        // 上限防卡顿、防下载风暴：在途缩略图始终只有一小批
  DEF_ORBIT: 69,        // 环绕半径默认（世界单位）：按显示基准 ORBIT_REF 算是 86%
  ORBIT_MIN: 64,        // 粒子环外沿 58 之外，至少留一道缝
  ORBIT_MAX: 130,
  ORBIT_REF: 80,        // 「环绕半径」滑条的百分比显示基准（100% = 原默认 80）
  AUTO_AZ: 0.018,       // 机位绕土星的缓慢公转（rad/s），与 saturn.html 的 autoRotate 同量级
  NEAR_SCALE: 0.68,     // 照片转到离镜头最近点时的屏显尺寸 = 卡片 px 尺寸 × 此值（layout 用它反推 kPx）
  VIEWS: {              // 视角预设（右下角胶囊按钮；双击空白处复位）
    far:  { zoom: 2.3,  elev: 0.62 },  // 远景：整条光环 + 中央小土星
    ring: { zoom: 1.05, elev: 0.10 },  // 环面：贴着环面看照片列队掠过
    near: { zoom: 0.78, elev: 0.32 },  // 近观：照片从身边飞过
  },

  phi: 0,               // 星环自转角（rad，同时喂给粒子环的 uSpin）
  phiVel: 0,            // 拖动惯性（rad/帧）
  elev: 0, zoom: 0,     // 当前仰角 / 距离倍率（拖拽后保持）
  pulse: 0,             // 土星心跳脉冲（0..1，随帧衰减）
  items: [],            // { el, img, cap, photoIdx, theta, r, yJ, ready, op, br, sc, lastDepth, prevRel, lastSwap }
  tail: -1,             // 环上最新一张的 photoIdx；回收时 +1 接力
  recycling: false,     // 总数 > 在环数量（cfg.count）时才回收
  stars: [],            // 星幕粒子（世界坐标壳层）
  hovered: null,
  running: false,
  enteredOnce: false,
  fly: null,            // 视角飞行 { t0, dur, from:{elev,zoom}, to:{elev,zoom} }
  cfg: null,            // { speed, planet, size, count, orbit } 用户设置，loadCfg 从 localStorage 恢复
  rebuildTimer: 0,      // 「照片数量」滑条防抖：连续拖动时不反复重建
  kPx: 12,              // px/世界单位换算（layout 按 NEAR_SCALE 反推，与照片数量无关）
  radius: 1000,         // = kPx·ORBIT_W，仅供 spinK 手感公式用
  spinK: 3e-4,          // 每 px 拖动对应的环转角（rad，layout 按几何重算）

  init() {
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadCfg();
    this.elev = this.ELEV_DEF;
    this.zoom = this.ZOOM_DEF;
    this.pinching = false;
    this.pinchDist = 0;
    this.suppressClickUntil = 0;
    this.mouseAt = null;
    this.hoverDirty = false;
    this.stage = $("#galaxyStage");
    this.space = $("#galaxySpace");
    this.buildPhotos();
    // 背景星幕（土星那层等首次进入时再建，见 enter）
    this.initStarfield();
    this.bindInput();
    addEventListener("resize", () => this.layout());

    const loop = () => {
      if (this.running) this.frame();
      requestAnimationFrame(loop);
    };
    loop();
  },

  /* ----- 建造：槽位上环，数量为设置面板的「照片数量」；总数超出时运转中回收换图 ----- */
  buildPhotos() {
    this.space.innerHTML = "";
    this.items = [];
    this.hovered = null; // 重建后旧元素已摘除，悬停引用一并清掉
    const total = PHOTOS.length;
    if (!total) return;
    const n = Math.min(total, this.cfg.count);
    this.recycling = total > n; // 照片不多于槽位：全挂上，无需回收
    this.tail = n - 1;
    for (let i = 0; i < n; i++) {
      const p = PHOTOS[i];
      const it = {
        el: el("div", "galaxy-photo"),
        img: el("img"),
        cap: el("div", "gp-cap"),
        photoIdx: i,
        theta: (i / n) * Math.PI * 2,   // 等角分布
        r: this.ORBIT_W + rand(-2, 2),  // 半径抖动：避免相邻卡片严格共面闪面
        yJ: rand(-2.5, 2.5),            // 垂直环面的厚度抖动（世界单位）
        ready: false, op: 0, br: 0.8, sc: 1, lastDepth: 1e9,
        prevRel: null, lastSwap: 0,
      };
      it.img.alt = photoName(p);
      it.img.decoding = "async";
      // 图片加载完成前整卡隐身（不然环上挂着一排深色占位块）；加载后按真实
      // 宽高比重定相框（横图横放、竖图竖放，不裁剪）。回收换图也走这条路：
      // recycle 把 ready 置 0 先淡出，新图 onload 后淡入
      it.img.onload = () => { it.ready = true; this.fitCard(it); };
      it.cap.textContent = photoName(p);
      it.el.appendChild(it.img);
      it.el.appendChild(it.cap);
      // 浏览器若能正常命中（preserve-3d 打得到）就直接开灯箱；打不到时
      // 由 stage 的手动矩形命中兜底（见 bindInput，两条路不会重复打开）
      it.el.addEventListener("click", (e) => {
        if (e.button === 0 && !this.track.moved) Lightbox.open(it.photoIdx);
      });
      this.space.appendChild(it.el);
      this.fitCard(it);
      this.items.push(it);
      setThumb(it.img, p); // 槽位数量有限，直接开始加载
    }
    this.layout();
  },
  // 卡片基准边长 u：横竖图等面积缩放的基准，跟舞台大小走，乘「照片大小」设置
  cardU() {
    const w = (this.stage && this.stage.clientWidth) || innerWidth;
    const h = (this.stage && this.stage.clientHeight) || innerHeight;
    return Math.max(96, Math.min(0.17 * h, 0.16 * w, 175)) * this.cfg.size;
  },
  fitCard(it) {
    const u = this.cardU();
    const nw = it.img.naturalWidth, nh = it.img.naturalHeight;
    let w, h;
    if (nw && nh) {
      const ar = nw / nh;
      // 等面积：宽 = u·√比例、高 = u/√比例；极端宽幅全景另给上限
      const k = Math.sqrt(Math.min(Math.max(ar, 0.3), 3));
      w = Math.min(u * k, u * 1.8);
      h = w / ar;
    } else {
      w = u * 0.87; h = u * 1.15; // 未加载先按 3:4 占位
    }
    it.el.style.width = w.toFixed(1) + "px";
    it.el.style.height = h.toFixed(1) + "px";
  },
  // 舞台尺寸 / 照片大小设置变化时：重算 perspective、px 换算、拖拽手感、卡片尺寸
  layout() {
    const W = this.stage.clientWidth || innerWidth;
    const H = this.stage.clientHeight || innerHeight;
    // 与 WebGL fovy=45° 精确等价的 CSS 视距（两层对齐的地基）
    const P = (H / 2) / Math.tan(Math.PI / 8);
    this.stage.style.perspective = Math.round(P) + "px";
    // kPx（px/世界单位）与照片数量无关：按「最近点的照片屏显尺寸 ≈ 卡片
    // px 尺寸 × NEAR_SCALE」反推。d 给下限兜底：相机贴环时 kPx 不爆表
    const d = Math.max(SaturnSky.camD(this.zoom, W / H), this.ORBIT_W + 30);
    this.kPx = (P / this.NEAR_SCALE) / (d - this.ORBIT_W);
    this.radius = this.kPx * this.ORBIT_W; // 仅供下面 spinK 的手感公式用
    // 拨环手感：近侧照片 1:1 跟手所需的环转角/px，再乘 2.2 增益
    const nearDepth = (d - this.ORBIT_W) * this.kPx;
    this.spinK = (2.2 * nearDepth) / (P * this.radius);
    for (const it of this.items) this.fitCard(it);
    this.resizeStars();
  },

  /* ----- 每帧 ----- */
  frame() {
    const W = this.stage.clientWidth || innerWidth;
    const H = this.stage.clientHeight || innerHeight;
    if (!W || !H) return;
    const t = performance.now() / 1000;

    // 视角飞行（预设机位 / 双击复位 / 首次进场）；拖拽与推拉会取消它
    if (this.fly) {
      const f = this.fly;
      const k = Math.min(1, (t - f.t0) / f.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOut
      this.elev = f.from.elev + (f.to.elev - f.from.elev) * e;
      this.zoom = f.from.zoom + (f.to.zoom - f.from.zoom) * e;
      if (k >= 1) this.fly = null;
    }

    // 环自转：松手后惯性衰减、缓回默认速度；悬停某张时放慢到 15% 方便细看
    if (!this.track.dragging) {
      const auto = (this.reduceMotion ? 0 : this.cfg.speed) * (Math.PI / 180);
      const target = this.hovered ? auto * 0.15 : auto;
      this.phiVel += (target - this.phiVel) * 0.03;
      this.phi += this.phiVel;
    }
    this.pulse *= 0.94;

    // 相机：两层共用这一份（对齐原理见头注释）
    const az = t * this.AUTO_AZ;
    const d = SaturnSky.camD(this.zoom, W / H);
    const eye = SaturnSky.eyeFrom(az, this.elev, d);
    const view = SaturnSky.lookAt(eye, [0, 0, 0]);
    const P = (H / 2) / Math.tan(Math.PI / 8);
    const kPx = this.kPx;
    const cosT = Math.cos(this.TILT), sinT = Math.sin(this.TILT);
    const rS = (this.PLANET_R * P) / d; // 土星的屏幕视半径（掩食判定用）
    const nearDepth = (d - this.ORBIT_W) * kPx;
    // 环坐标下离镜头最远的角（含倾角与仰角修正）：回收换图在这里发生
    const cosE = Math.cos(this.elev);
    const farTh = Math.atan2(-Math.cos(az) * cosE,
      -(cosT * Math.sin(az) * cosE + sinT * Math.sin(this.elev)));
    const nowMs = performance.now();

    for (const it of this.items) {
      const th = it.theta + this.phi;
      // 最远弧点回收：与 farTh 的角差跨过 0（且两帧都在远半环，排除 ±π
      // 处在近点绕回）→ 淡出换下一张。来回拖时靠 lastSwap 冷却防止反复横跳
      if (this.recycling) {
        let rel = (th - farTh) % (Math.PI * 2);
        if (rel > Math.PI) rel -= Math.PI * 2;
        else if (rel < -Math.PI) rel += Math.PI * 2;
        if (it.prevRel !== null && (it.prevRel < 0) !== (rel < 0) &&
            Math.abs(it.prevRel) < Math.PI / 2 && Math.abs(rel) < Math.PI / 2 &&
            nowMs - it.lastSwap > 1200) {
          this.recycle(it);
        }
        it.prevRel = rel;
      }
      // 世界坐标：环面 = y≈0 平面经 rotZ(TILT) 倾斜，与 WebGL 粒子环共面
      const wx0 = it.r * Math.cos(th), wz0 = it.r * Math.sin(th);
      const wx = wx0 * cosT - it.yJ * sinT;
      const wy = wx0 * sinT + it.yJ * cosT;
      // view 矩阵（列主序 Float32Array：行即相机基向量，m[12..14] 是平移）
      const vx = view[0] * wx + view[4] * wy + view[8] * wz0 + view[12];
      const vy = view[1] * wx + view[5] * wy + view[9] * wz0 + view[13];
      const vz = view[2] * wx + view[6] * wy + view[10] * wz0 + view[14];
      const depth = -vz * kPx; // 离镜头的距离（css px，前方为正）
      if (depth < 30) { // 极端机位下相机贴脸：藏掉，免得投影爆掉
        it.op = 0; it.lastDepth = 1e9;
        it.el.style.opacity = "0";
        continue;
      }
      it.lastDepth = depth;
      // 屏幕坐标（仅供掩食判定；摆放不经过它，见头注释）
      const inv = P / -vz;
      const sx = vx * inv, sy = -vy * inv;
      // 近亮远暗
      const depthK = Math.max(0, Math.min(1, (depth - nearDepth) / (2 * this.ORBIT_W * kPx)));
      let brT = 1.02 - 0.55 * depthK;
      // 未加载完成（含回收换图途中）的不现身（op 从 0 缓动淡入）
      let opT = it.ready ? 1 : 0;
      // 掩食：在行星背后（与相机异侧）且落入行星视圆盘 → 平滑淡出
      if (opT && wx * eye[0] + wy * eye[1] + wz0 * eye[2] < 0) {
        opT = Math.max(0, Math.min(1, (Math.hypot(sx, sy) - rS) / (0.3 * rS)));
      }
      let scT = 1;
      if (this.hovered === it) { scT = 1.12; brT *= 1.15; }
      it.op += (opT - it.op) * 0.2;
      it.br += (brT - it.br) * 0.2;
      it.sc += (scT - it.sc) * 0.2;
      // x/y 直接摆 view 空间坐标，投影交给 CSS（对齐原理见头注释）
      it.el.style.transform =
        `translate(-50%,-50%) translate3d(${(vx * kPx).toFixed(1)}px, ${(-vy * kPx).toFixed(1)}px, ${(P - depth).toFixed(1)}px) scale(${it.sc.toFixed(3)})`;
      it.el.style.opacity = it.op.toFixed(3);
      it.el.style.filter = `brightness(${it.br.toFixed(3)})`;
    }

    SaturnSky.render(t, { eye, pulse: this.pulse, spin: this.phi });
    this.drawStars(view, P, W, H);
    this.maybeShoot();
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.setHovered(this.mouseAt ? this.hitPhoto(this.mouseAt[0], this.mouseAt[1]) : null);
    }
  },

  /* ----- 输入：拖拽 / 点击 / 滚轮 / 双指 / 键盘 / 悬停 / 预设按钮 ----- */
  bindInput() {
    // 拖拽 / 单击判定走共用的 makeSceneDrag。
    // 左右拨环跟手：环近点的切向速度在屏幕 x 方向的分量恒为 −1（把近点角
    // θn = π/2−az 的切向量点乘相机 x̂ 即得），所以 φ 减去 dx·spinK 时
    // 近侧照片跟着手指走；上下拖 = 相机仰角（往下拖 = 抬镜头），松手保持。
    this.track = makeSceneDrag(this.stage, (dx, dy) => {
      if (this.pinching) return; // 双指捏合时只缩放
      this.fly = null;           // 手动接管，取消视角飞行
      this.phi -= dx * this.spinK;
      this.phiVel = -dx * this.spinK;
      this.elev = Math.max(this.ELEV_MIN, Math.min(this.ELEV_MAX, this.elev + dy * 0.0022));
    });

    // 左键 / 触屏点按：先命中照片看大图（手动矩形命中——Chromium 的
    // preserve-3d 命中检测打不到位于 stage 背景平面之后的照片；若浏览器
    // 正常命中了照片自身，closest 检查会跳过这里，不会重复打开），
    // 没点中照片再看是不是点了土星：心跳脉冲。
    this.stage.addEventListener("click", (e) => {
      if (e.button !== 0 || this.track.moved) return;
      if (performance.now() < this.suppressClickUntil) return;
      if (e.target.closest && e.target.closest(".galaxy-photo, .galaxy-views")) return;
      const hit = this.hitPhoto(e.clientX, e.clientY);
      if (hit) { Lightbox.open(hit.photoIdx); return; }
      const r = this.stage.getBoundingClientRect();
      const P = (r.height / 2) / Math.tan(Math.PI / 8);
      const d = SaturnSky.camD(this.zoom, r.width / r.height);
      const rS = (this.PLANET_R * P) / d;
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < rS) {
        this.poke();
      }
    });

    // 滚轮推拉相机（对数步进，手感均匀）
    this.stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0009));
    }, { passive: false });

    // 双指捏合推拉（触屏）：与单指拖拽互斥
    const pts = new Map();
    this.stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { this.pinching = true; this.pinchDist = 0; }
    });
    window.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2) return;
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist) {
        this.zoomBy(this.pinchDist / dist); // 双指张开 → 拉近
        this.suppressClickUntil = performance.now() + 400;
      }
      this.pinchDist = dist;
    });
    const endPinch = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { this.pinching = false; this.pinchDist = 0; }
    };
    window.addEventListener("pointerup", endPinch);
    window.addEventListener("pointercancel", endPinch);

    // 双击空白处：视角缓动回默认（双击到照片则照常进灯箱，不复位）
    this.stage.addEventListener("dblclick", (e) => {
      if (e.target.closest && e.target.closest(".galaxy-views")) return;
      if (this.hitPhoto(e.clientX, e.clientY)) return;
      this.resetView();
    });

    // 悬停（仅鼠标类设备）：环放慢 + 卡片提亮 + 浮出标题
    if (matchMedia("(hover: hover)").matches) {
      this.stage.addEventListener("pointermove", (e) => {
        if (e.buttons) return;
        this.mouseAt = [e.clientX, e.clientY];
        this.hoverDirty = true;
      });
      this.stage.addEventListener("pointerleave", () => {
        this.mouseAt = null;
        this.hoverDirty = true;
      });
    }

    // 键盘：←/→ 拨环，↑/↓ 仰角，+/− 远近，0 复位
    document.addEventListener("keydown", (e) => {
      if (document.body.dataset.mode !== "galaxy") return;
      if ($("#lightbox").classList.contains("open")) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const kick = 1.6 * (Math.PI / 180);
      if (e.key === "ArrowLeft") this.phiVel += kick;
      else if (e.key === "ArrowRight") this.phiVel -= kick;
      else if (e.key === "ArrowUp") {
        this.fly = null;
        this.elev = Math.min(this.ELEV_MAX, this.elev + 0.06);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        this.fly = null;
        this.elev = Math.max(this.ELEV_MIN, this.elev - 0.06);
        e.preventDefault();
      } else if (e.key === "+" || e.key === "=") this.zoomBy(0.9);
      else if (e.key === "-") this.zoomBy(1 / 0.9);
      else if (e.key === "0") this.resetView();
    });

    // 视角预设按钮；按钮上不启动拖拽（免得从按钮上拖出误操作）
    const views = document.querySelector(".galaxy-views");
    if (views) {
      views.addEventListener("pointerdown", (e) => e.stopPropagation());
      views.querySelectorAll("[data-view]").forEach((b) =>
        b.addEventListener("click", () => {
          const v = this.VIEWS[b.dataset.view];
          if (v) this.flyTo(v, 1.0);
        })
      );
    }
  },
  // 手动矩形命中：返回被指到的、视觉最前的照片（getBoundingClientRect
  // 给出的就是 3D 投影后的屏幕包围盒）
  hitPhoto(x, y) {
    let hit = null, best = Infinity;
    for (const it of this.items) {
      if (it.op < 0.25) continue;
      const r = it.el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (it.lastDepth < best) { best = it.lastDepth; hit = it; }
    }
    return hit;
  },
  setHovered(it) {
    if (this.hovered === it) return;
    if (this.hovered) this.hovered.el.classList.remove("hovered");
    this.hovered = it;
    if (it) it.el.classList.add("hovered");
  },
  // 点了土星：心跳脉冲（行星轻轻提亮、呼吸一下）
  poke() {
    this.pulse = 1;
  },
  zoomBy(f) {
    this.fly = null;
    this.zoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, this.zoom * f));
  },
  flyTo(v, dur) {
    this.fly = {
      t0: performance.now() / 1000,
      dur: dur || 0.9,
      from: { elev: this.elev, zoom: this.zoom },
      to: { elev: v.elev, zoom: v.zoom },
    };
  },
  resetView() { this.flyTo({ elev: this.ELEV_DEF, zoom: this.ZOOM_DEF }, 1.1); },
  // 最远弧点回收：该处照片最小最暗（还时常被土星掩食），淡出换图最不显眼。
  // tail 接力 +1，环上照片互不重复、持续遍历整个相册
  recycle(it) {
    it.lastSwap = performance.now();
    this.tail = (this.tail + 1) % PHOTOS.length;
    it.photoIdx = this.tail;
    const p = PHOTOS[it.photoIdx];
    it.ready = false; // 触发淡出；新缩略图 onload 后自动淡入（见 buildPhotos）
    it.img.alt = photoName(p);
    it.cap.textContent = photoName(p);
    setThumb(it.img, p);
  },

  /* ----- 设置面板的存取（右上角 ⚙ → 星河漫游） ----- */
  loadCfg() {
    let cfg = { speed: this.DEF_SPEED, planet: this.DEF_PLANET, size: this.DEF_SIZE,
                count: this.DEF_COUNT, orbit: this.DEF_ORBIT };
    try {
      const raw = JSON.parse(localStorage.getItem("galaxyCfg") || "{}");
      // 隧道时代的 slots/near/depth 语义已不存在，丢弃
      delete raw.slots; delete raw.near; delete raw.depth;
      cfg = Object.assign(cfg, raw);
    } catch (e) { /* 存了坏数据就回落默认 */ }
    // 越界值（比如手改过 localStorage）夹回滑条范围
    const clamp = (v, lo, hi, dflt) => (isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
    cfg.speed = clamp(+cfg.speed, 0, this.SPEED_MAX, this.DEF_SPEED);
    cfg.planet = clamp(+cfg.planet, this.PLANET_MIN, this.PLANET_MAX, this.DEF_PLANET);
    cfg.size = clamp(+cfg.size, this.SIZE_MIN, this.SIZE_MAX, this.DEF_SIZE);
    cfg.count = Math.round(clamp(+cfg.count, this.COUNT_MIN, this.COUNT_MAX, this.DEF_COUNT));
    cfg.orbit = clamp(+cfg.orbit, this.ORBIT_MIN, this.ORBIT_MAX, this.DEF_ORBIT);
    this.cfg = cfg;
    this.ORBIT_W = cfg.orbit;
    SaturnSky.scale = cfg.planet;
  },
  saveCfg() {
    localStorage.setItem("galaxyCfg", JSON.stringify(this.cfg));
  },
  setSpeed(v) { this.cfg.speed = v; this.saveCfg(); },
  setPlanet(v) { this.cfg.planet = v; this.saveCfg(); SaturnSky.scale = v; },
  setSize(v) { this.cfg.size = v; this.saveCfg(); this.layout(); },
  // 环绕半径：不动 DOM，各槽位半径整体平移（保留各自 ±2 的抖动量），下一帧生效
  setOrbit(v) {
    const dv = v - this.ORBIT_W;
    this.ORBIT_W = v;
    for (const it of this.items) it.r += dv;
    this.cfg.orbit = v; this.saveCfg(); this.layout();
  },
  // 照片数量：槽位数变了要重建；滑条连续拖动时防抖，免得照片反复消失重载
  setCount(v) {
    v = Math.round(v);
    if (v === this.cfg.count) return;
    this.cfg.count = v; this.saveCfg();
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.buildPhotos(), 250);
  },
  resetCfg() {
    this.setSpeed(this.DEF_SPEED);
    this.setPlanet(this.DEF_PLANET);
    this.setSize(this.DEF_SIZE);
    this.setOrbit(this.DEF_ORBIT);
    this.setCount(this.DEF_COUNT); // 数量变了会经 setCount 触发重建
  },

  /* ----- 背景：星幕 canvas -----
   * 星星固定在世界空间的球壳上（半径 600–1100，与 WebGL 星幕 800–1200 交错），
   * 每帧用与照片、土星同一台的相机做投影，视差天然一致；带闪烁与少量星芒。 */
  initStarfield() {
    const cv = el("canvas");
    cv.id = "galaxyStars";
    cv.setAttribute("aria-hidden", "true");
    this.stage.insertBefore(cv, this.space);
    this.starCv = cv;
    this.starCtx = cv.getContext("2d");
    this.stars = [];
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
    this.stars = Array.from({ length: N }, () => {
      const th = rand(0, Math.PI * 2);
      const ph = Math.acos(rand(-1, 1));
      const r = rand(600, 1100);
      return {
        x: r * Math.sin(ph) * Math.cos(th),
        y: r * Math.cos(ph),
        z: r * Math.sin(ph) * Math.sin(th),
        r: rand(0.5, 1.7),
        tw: rand(0.6, 2.2),          // 闪烁频率
        ph: rand(0, Math.PI * 2),    // 闪烁相位
        c: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
        bright: Math.random() < 0.08, // 少量亮星画星芒
      };
    });
  },
  drawStars(view, P, W, H) {
    const g = this.starCtx;
    if (!g) return;
    const t = performance.now() / 1000;
    const cx = W / 2, cy = H / 2;
    g.clearRect(0, 0, W, H);
    for (const s of this.stars) {
      const vx = view[0] * s.x + view[4] * s.y + view[8] * s.z + view[12];
      const vy = view[1] * s.x + view[5] * s.y + view[9] * s.z + view[13];
      const vz = view[2] * s.x + view[6] * s.y + view[10] * s.z + view[14];
      if (vz > -20) continue; // 相机背后
      const inv = P / -vz;
      const x = cx + vx * inv, y = cy - vy * inv;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const a = 0.38 + 0.62 * Math.abs(Math.sin(t * s.tw + s.ph));
      g.globalAlpha = a;
      g.fillStyle = s.c;
      g.beginPath();
      g.arc(x, y, s.r, 0, 6.2832);
      g.fill();
      if (s.bright) {
        // 亮星的十字星芒
        const L = s.r * 4;
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
    // 相机几何（perspective / 环半径 / 星幕）要等页面真正显示出来才量得到
    // 尺寸，所以放在这里重排；土星那层同理，首次进入时才初始化
    this.layout();
    if (!this.skyTried) {
      this.skyTried = true;
      SaturnSky.init(this.stage);
    } else {
      SaturnSky.resize();
    }
    this.running = true;
    // 首次进场：从远景缓动飞入默认机位；之后再进入保持上次视角
    if (!this.enteredOnce) {
      this.enteredOnce = true;
      if (!this.reduceMotion && this.items.length) {
        this.elev = 0.7;
        this.zoom = 2.6;
        this.flyTo({ elev: this.ELEV_DEF, zoom: this.ZOOM_DEF }, 1.8);
      }
    }
  },
  leave() {
    this.running = false;
    this.setHovered(null);
  },
};

/* ---------- 幻灯片 ----------
 * 照片多了圆点放不下，位置提示用两样东西替代：
 * 顶部 2px 进度发丝（CSS 动画，时长 = DUR，与自动播放严格同周期，暂停即冻结）
 * + 右下角 Cormorant 斜体计数器（03 / 151）。 */
const Slideshow = {
  idx: 0,
  timer: null,
  front: null,
  playing: true,
  DUR: 5000, // 每张停留时长（ms），进度条动画时长在 init 里设成同一个值
  init() {
    this.a = $("#slideA");
    this.b = $("#slideB");
    this.front = this.a;
    this.bar = $("#slideBar");
    this.bar.style.animationDuration = this.DUR + "ms";
    $("#slidePrev").addEventListener("click", () => this.go(this.idx - 1));
    $("#slideNext").addEventListener("click", () => this.go(this.idx + 1));
    $("#slidePlay").addEventListener("click", () => {
      this.playing = !this.playing;
      $("#slidePlay").textContent = this.playing ? "⏸" : "▶";
      this.bar.style.animationPlayState = this.playing ? "running" : "paused";
      if (this.playing) this.auto();
      else if (this.timer) clearTimeout(this.timer); // 暂停要真的停，连已排程的那张也取消
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
    // 进页面的第一张直接呈现，不做 2.2s 淡入（不然先得盯几秒纯色背景）
    if (instant) back.style.transition = "none";
    back.classList.remove("show");
    void back.offsetWidth; // 重启动画
    back.classList.add("show");
    if (instant) requestAnimationFrame(() => { back.style.transition = ""; });
    this.front.classList.remove("show");
    this.front = back;
    const name = photoName(p);
    const cap = $("#slideCaption");
    $("#slideCapTitle").textContent = name;
    const d = $("#slideCapDate");
    d.textContent = p.date || "";
    d.style.display = p.date ? "" : "none";
    cap.style.display = name ? "" : "none";
    $("#slideCounter").textContent =
      String(this.idx + 1).padStart(2, "0") + " / " + PHOTOS.length;
    // 进度条与自动播放同周期：每张重启一次，暂停时冻结
    this.bar.classList.remove("run");
    void this.bar.offsetWidth;
    if (this.playing) this.bar.classList.add("run");
    this.bar.style.animationPlayState = this.playing ? "running" : "paused";
    if (this.playing) this.auto();
  },
  auto() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.go(this.idx + 1), this.DUR);
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
  resumeGalaxy: false,
  homePolaroid: false,
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
  open(i, opts) {
    const box = $("#lightbox");
    // 星河的照片层是持续变化的 3D 合成层；隔着 backdrop-filter 继续推进和
    // 回收槽位会产生明显闪烁。首次打开时暂停，翻页不重复改写恢复状态。
    if (!box.classList.contains("open")) {
      this.resumeGalaxy = document.body.dataset.mode === "galaxy" && Galaxy.running;
      if (this.resumeGalaxy) Galaxy.running = false;
      this.homePolaroid = !!(opts && opts.homePolaroid);
    }
    this.idx = i;
    this.render();
    box.classList.add("open");
  },
  close() {
    $("#lightbox").classList.remove("open");
    if (this.homePolaroid && HOME_POLAROID.render && PHOTOS.length) {
      HOME_POLAROID.render(this.idx);
    }
    if (this.resumeGalaxy && document.body.dataset.mode === "galaxy") Galaxy.running = true;
    this.resumeGalaxy = false;
    this.homePolaroid = false;
  },
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
  for (let i = 0; i < 12; i++) {
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

/* ---------- 音乐播放器 ---------- */
function initMusic() {
  const btn = $("#musicToggle");
  if (!SITE_CONFIG.music || !SITE_CONFIG.music.enabled) {
    btn.style.display = "none";
    return;
  }
  MusicBox.init();
}

/* ---------- 右上角「本页设置」面板 ----------
 * ⚙ 按钮在每个子页面下打开不同的设置面板：面板定义在 defs 里，想给别的
 * 子页面加设置再登记一项即可；没有登记的子页面会直接隐藏 ⚙ 按钮。
 * 目前有两页：
 *   3D 相册（ring）：旋转速度 + 图片大小 + 镜头远近；
 *   星河漫游（galaxy）：星环自转速度 + 行星大小 + 照片大小。
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
        {
          label: "镜头远近",
          min: Ring.ZOOM_MIN, max: Ring.ZOOM_MAX, step: 0.05,
          get: () => Ring.cfg.zoom,
          set: (v) => Ring.setZoom(v),
          fmt: (v) => v.toFixed(2) + "×",
        },
      ],
      reset: () => Ring.resetCfg(),
    },
    galaxy: {
      title: "🌌 星河漫游设置",
      rows: [
        {
          label: "星环自转速度",
          min: 0, max: Galaxy.SPEED_MAX, step: 0.002,
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
          label: "照片大小",
          min: Galaxy.SIZE_MIN, max: Galaxy.SIZE_MAX, step: 0.05,
          get: () => Galaxy.cfg.size,
          set: (v) => Galaxy.setSize(v),
          fmt: (v) => v.toFixed(2) + "×",
        },
        {
          label: "照片数量",
          min: Galaxy.COUNT_MIN, max: Galaxy.COUNT_MAX, step: 1,
          get: () => Galaxy.cfg.count,
          set: (v) => Galaxy.setCount(v),
          fmt: (v) => Math.round(v) + " 张",
        },
        {
          label: "环绕半径",
          min: Galaxy.ORBIT_MIN, max: Galaxy.ORBIT_MAX, step: 1,
          get: () => Galaxy.cfg.orbit,
          set: (v) => Galaxy.setOrbit(v),
          fmt: (v) => Math.round((v / Galaxy.ORBIT_REF) * 100) + "%",
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
