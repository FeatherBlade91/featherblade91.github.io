/* ============================================================
 * 管理端：通过 GitHub REST API 把照片直接提交到仓库
 * 流程：读 ref → 读 base tree → 上传 blob → 建新 tree →
 *       建新 commit → 更新 ref（一次提交包含图片 + photos.json）
 * ============================================================ */

const $ = (s) => document.querySelector(s);
const el = (t, c) => { const d = document.createElement(t); if (c) d.className = c; return d; };

const state = {
  token: "",
  owner: "",
  repo: "",
  branch: "main",
  prefix: "",               // 仓库内子目录前缀，如 "foreverU3/"
  manifest: { photos: [] }, // 当前线上的 photos.json 内容
  pending: [],              // 待上传 { file, dataUrl, date, caption }
  deletions: new Set(),     // 标记删除的 src
};

/* ---------- 日志 ---------- */
function log(msg, cls) {
  $("#logCard").hidden = false;
  const line = el("span", cls || "");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  $("#log").appendChild(line);
  $("#log").scrollTop = $("#log").scrollHeight;
}

/* ---------- GitHub API ---------- */
async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${state.owner}/${state.repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub API ${res.status}: ${body.message || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- 连接仓库，读取 photos.json ---------- */
async function connect() {
  state.owner = $("#inOwner").value.trim();
  state.repo = $("#inRepo").value.trim();
  state.branch = $("#inBranch").value.trim() || "main";
  state.token = $("#inToken").value.trim();
  const pp = (SITE_CONFIG.repo && SITE_CONFIG.repo.pathPrefix) || "";
  state.prefix = pp ? pp.replace(/\/*$/, "/") : "";
  if (!state.owner || !state.repo || !state.token) {
    log("请填完整用户名、仓库名和 Token", "err");
    return;
  }
  if ($("#chkSaveToken").checked) {
    localStorage.setItem("albumAdmin", JSON.stringify({
      owner: state.owner, repo: state.repo, branch: state.branch, token: state.token,
    }));
  } else {
    localStorage.removeItem("albumAdmin");
  }
  log(`正在连接 ${state.owner}/${state.repo} ...`);
  try {
    const data = await gh(`/contents/${state.prefix}photos.json?ref=${state.branch}`).catch((e) => {
      if (String(e.message).includes("404")) return null;
      throw e;
    });
    if (data) {
      const text = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      state.manifest = JSON.parse(text);
      log(`连接成功，线上已有 ${(state.manifest.photos || []).length} 张照片`, "ok");
    } else {
      state.manifest = { photos: [] };
      log("连接成功，仓库里还没有 photos.json，首次提交时会自动创建", "ok");
    }
    $("#uploadCard").hidden = false;
    $("#listCard").hidden = false;
    renderPhotoList();
  } catch (e) {
    log("连接失败：" + e.message, "err");
  }
}

/* ---------- 现有照片列表 ---------- */
function renderPhotoList() {
  const box = $("#photoList");
  box.innerHTML = "";
  const photos = state.manifest.photos || [];
  if (!photos.length) {
    box.innerHTML = '<p class="hint">还没有照片，先上传第一张吧。</p>';
    return;
  }
  photos.forEach((p, i) => {
    const row = el("div", "photo-row");
    if (state.deletions.has(p.src)) row.classList.add("deleted");
    const img = el("img");
    img.src = p.src;
    img.loading = "lazy";
    row.appendChild(img);

    const fields = el("div", "pv-fields");
    const dateIn = el("input");
    dateIn.type = "date";
    dateIn.value = p.date || "";
    dateIn.addEventListener("change", () => { p.date = dateIn.value; });
    const capIn = el("input");
    capIn.type = "text";
    capIn.placeholder = "这张照片的故事…";
    capIn.value = p.caption || "";
    capIn.addEventListener("input", () => { p.caption = capIn.value; });
    fields.appendChild(dateIn);
    fields.appendChild(capIn);
    row.appendChild(fields);

    const del = el("button", "row-del" + (state.deletions.has(p.src) ? " undo" : ""));
    del.textContent = state.deletions.has(p.src) ? "恢复" : "删除";
    del.addEventListener("click", () => {
      if (state.deletions.has(p.src)) state.deletions.delete(p.src);
      else state.deletions.add(p.src);
      renderPhotoList();
    });
    row.appendChild(del);
    box.appendChild(row);
  });
}

/* ---------- 选择待上传照片 ---------- */
function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = () => {
      state.pending.push({
        file,
        dataUrl: reader.result,
        date: new Date().toISOString().slice(0, 10),
        caption: "",
      });
      renderPending();
    };
    reader.readAsDataURL(file);
  }
}

function renderPending() {
  const box = $("#previewList");
  box.innerHTML = "";
  state.pending.forEach((item, i) => {
    const row = el("div", "preview-item");
    const img = el("img");
    img.src = item.dataUrl;
    row.appendChild(img);
    const fields = el("div", "pv-fields");
    const dateIn = el("input");
    dateIn.type = "date";
    dateIn.value = item.date;
    dateIn.addEventListener("change", () => { item.date = dateIn.value; });
    const capIn = el("input");
    capIn.type = "text";
    capIn.placeholder = "这张照片的故事…";
    capIn.addEventListener("input", () => { item.caption = capIn.value; });
    fields.appendChild(dateIn);
    fields.appendChild(capIn);
    row.appendChild(fields);
    const rm = el("button", "pv-remove");
    rm.textContent = "✕";
    rm.addEventListener("click", () => { state.pending.splice(i, 1); renderPending(); });
    row.appendChild(rm);
    box.appendChild(row);
  });
  $("#btnUpload").disabled = !state.pending.length && !state.deletions.size;
}

/* ---------- 提交：一次 commit 包含新图片 + 更新后的 photos.json ---------- */
async function commitAll(withImages) {
  const btn = withImages ? $("#btnUpload") : $("#btnSaveManifest");
  btn.disabled = true;
  try {
    log("读取分支引用…");
    const ref = await gh(`/git/ref/heads/${state.branch}`);
    const baseCommit = ref.object.sha;
    const commit = await gh(`/git/commits/${baseCommit}`);
    const baseTree = commit.tree.sha;

    const tree = [];

    // 1. 上传新图片 blob
    const newEntries = [];
    for (const item of state.pending) {
      log(`上传图片：${item.file.name} (${(item.file.size / 1024).toFixed(0)} KB)…`);
      const base64 = item.dataUrl.split(",")[1];
      const blob = await gh("/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: base64, encoding: "base64" }),
      });
      const safe = item.file.name.replace(/[^\w.\-]/g, "_");
      const path = `${state.prefix}photos/${Date.now()}-${safe}`;
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      newEntries.push({ src: path.replace(new RegExp("^" + state.prefix), ""), date: item.date, caption: item.caption });
    }

    // 2. 合成新的 photos.json
    const kept = (state.manifest.photos || []).filter((p) => !state.deletions.has(p.src));
    const manifest = { photos: kept.concat(newEntries) };
    log("更新 photos.json…");
    tree.push({
      path: `${state.prefix}photos.json`,
      mode: "100644",
      type: "blob",
      content: JSON.stringify(manifest, null, 2),
    });

    // 3. 新 tree → commit → 更新 ref
    log("创建提交…");
    const newTree = await gh("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    const msg = newEntries.length
      ? `💌 上传 ${newEntries.length} 张新照片`
      : `📝 更新相册清单`;
    const newCommit = await gh("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [baseCommit] }),
    });
    await gh(`/git/refs/heads/${state.branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    state.manifest = manifest;
    state.pending = [];
    state.deletions.clear();
    renderPending();
    renderPhotoList();
    log(`✅ 提交成功！GitHub Pages 会在 1~2 分钟后更新线上相册。`, "ok");
  } catch (e) {
    log("提交失败：" + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 背景泡泡（简化版） ---------- */
function initBubbles() {
  const box = $("#bubbles");
  for (let i = 0; i < 16; i++) {
    const b = el("span", "bubble");
    const size = 12 + Math.random() * 60;
    b.style.width = b.style.height = size + "px";
    b.style.left = Math.random() * 100 + "vw";
    b.style.setProperty("--dur", 12 + Math.random() * 14 + "s");
    b.style.setProperty("--delay", -Math.random() * 24 + "s");
    b.style.setProperty("--sway", (Math.random() * 120 - 60) + "px");
    b.style.setProperty("--op", 0.3 + Math.random() * 0.5);
    box.appendChild(b);
  }
}

/* ---------- 启动 ---------- */
(function boot() {
  initBubbles();
  // 预填仓库信息
  const saved = JSON.parse(localStorage.getItem("albumAdmin") || "null");
  const cfg = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.repo) || {};
  $("#inOwner").value = (saved && saved.owner) || cfg.owner || "";
  $("#inRepo").value = (saved && saved.repo) || cfg.name || "";
  $("#inBranch").value = (saved && saved.branch) || cfg.branch || "main";
  if (saved && saved.token) {
    $("#inToken").value = saved.token;
    $("#chkSaveToken").checked = true;
  }

  $("#btnConnect").addEventListener("click", connect);
  $("#btnUpload").addEventListener("click", () => commitAll(true));
  $("#btnSaveManifest").addEventListener("click", () => commitAll(false));

  const dz = $("#dropZone");
  const fi = $("#inFiles");
  dz.addEventListener("click", () => fi.click());
  fi.addEventListener("change", () => { addFiles(fi.files); fi.value = ""; });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    addFiles(e.dataTransfer.files);
  });
})();




/* ============================================================
 * 本地模式：扫描 photos/ 文件夹，登记 / 编辑照片清单
 * 通过 File System Access API 直接读写 photos.json
 * JPG 自动读取 EXIF 拍摄日期；日期、标题留空则相册不显示该项
 * ============================================================ */
const local = {
  dirHandle: null,
  rows: [], // { name, src, file, thumbUrl, date, caption, include, registered, missing }
};

/* ---------- EXIF 拍摄日期提取（JPEG） ---------- */
async function exifDate(file) {
  try {
    if (file.type !== "image/jpeg") return null;
    const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let off = 2;
    while (off + 4 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      const len = (buf[off + 2] << 8) | (buf[off + 3] & 0xff);
      if (marker === 0xda) break; // SOS，后面是图像数据
      if (marker === 0xe1 && String.fromCharCode(...buf.slice(off + 4, off + 10)) === "Exif\0\0") {
        return parseTIFF(buf, off + 10);
      }
      off += 2 + len;
    }
  } catch (e) { /* 解析失败就当没有 */ }
  return null;
}

function parseTIFF(buf, tiff) {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset);
    const le = String.fromCharCode(buf[tiff], buf[tiff + 1]) === "II";
    const u16 = (o) => dv.getUint16(o, le);
    const u32 = (o) => dv.getUint32(o, le);
    const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 2, 1, 2, 4, 8, 4, 8];
    const fmt = (s) => {
      const m = s.match(/(\d{4}):(\d{2}):(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    };
    function readIFD(ifdOff) {
      const out = {};
      const n = u16(ifdOff);
      for (let i = 0; i < n; i++) {
        const e = ifdOff + 2 + i * 12;
        if (e + 12 > buf.length) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        const size = (TYPE_SIZE[type] || 1) * count;
        const valOff = size <= 4 ? e + 8 : tiff + u32(e + 8);
        if (tag === 0x9003 || tag === 0x0132) { // DateTimeOriginal / DateTime
          out.date = String.fromCharCode(...buf.slice(valOff, valOff + Math.min(count, 32)));
        } else if (tag === 0x8769) { // Exif IFD 指针
          out.exifPtr = tiff + u32(valOff);
        }
      }
      return out;
    }
    const ifd0 = readIFD(tiff + u32(tiff + 4));
    if (ifd0.exifPtr) {
      const sub = readIFD(ifd0.exifPtr);
      if (sub.date) return fmt(sub.date);
    }
    return ifd0.date ? fmt(ifd0.date) : null;
  } catch (e) {
    return null;
  }
}

/* ---------- 扫描本地文件夹 ---------- */
async function scanLocal() {
  if (!local.dirHandle) return;
  log("扫描本地 photos/ 文件夹…");
  for (const r of local.rows) if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
  local.rows = [];

  // 读取现有 photos.json
  let registered = new Map();
  try {
    const jh = await local.dirHandle.getFileHandle("photos.json");
    const manifest = JSON.parse(await (await jh.getFile()).text());
    for (const p of manifest.photos || []) registered.set(p.src, p);
  } catch (e) { /* 没有就当空清单 */ }

  // 遍历 photos/
  const photosDir = await local.dirHandle.getDirectoryHandle("photos");
  const names = [];
  for await (const [name, handle] of photosDir.entries()) {
    if (handle.kind === "file" && /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) names.push(name);
  }
  names.sort();

  for (const name of names) {
    const src = `photos/${name}`;
    const fh = await photosDir.getFileHandle(name);
    const file = await fh.getFile();
    const old = registered.get(src);
    registered.delete(src);
    local.rows.push({
      name, src, file,
      thumbUrl: URL.createObjectURL(file),
      date: old ? old.date || "" : (await exifDate(file)) || new Date(file.lastModified).toISOString().slice(0, 10),
      caption: old ? old.caption || "" : "",
      include: true,
      registered: !!old,
    });
  }
  // 清单里有、但文件已不在的条目 → 保存时自动剔除
  for (const [src, p] of registered) {
    local.rows.push({ name: src, src, file: null, thumbUrl: null, date: p.date || "", caption: p.caption || "", include: false, registered: true, missing: true });
  }
  renderLocal();
  const fresh = local.rows.filter((r) => !r.registered).length;
  log(`扫描完成：${local.rows.length - fresh - local.rows.filter(r=>r.missing).length} 张已登记，${fresh} 张待登记`, "ok");
}

/* ---------- 渲染列表 ---------- */
function renderLocal() {
  const box = $("#localList");
  box.innerHTML = "";
  for (const r of local.rows) {
    const row = el("div", "photo-row" + (r.missing ? " deleted" : ""));

    if (r.thumbUrl) {
      const img = el("img");
      img.src = r.thumbUrl;
      img.loading = "lazy";
      row.appendChild(img);
    } else {
      const ph = el("div");
      ph.textContent = "🚫";
      ph.style.cssText = "width:84px;height:64px;display:flex;align-items:center;justify-content:center;font-size:24px;";
      row.appendChild(ph);
    }

    const fields = el("div", "pv-fields");
    const badge = el("span", "row-badge " + (r.missing ? "badge-missing" : r.registered ? "badge-ok" : "badge-new"));
    badge.textContent = r.missing ? "文件缺失，保存时剔除" : r.registered ? "已登记" : "待登记";
    fields.appendChild(badge);
    if (!r.missing) {
      const dateIn = el("input");
      dateIn.type = "date";
      dateIn.value = r.date;
      dateIn.title = "留空则相册不显示日期";
      dateIn.addEventListener("change", () => { r.date = dateIn.value; });
      const capIn = el("input");
      capIn.type = "text";
      capIn.placeholder = "标题 / 文案（可留空）";
      capIn.value = r.caption;
      capIn.addEventListener("input", () => { r.caption = capIn.value; });
      fields.appendChild(dateIn);
      fields.appendChild(capIn);
      const nameTag = el("span", "row-filename");
      nameTag.textContent = r.name;
      fields.appendChild(nameTag);
    }
    row.appendChild(fields);

    if (!r.missing) {
      const toggle = el("button", "row-del" + (r.include ? "" : " undo"));
      toggle.textContent = r.include ? "不收录" : "恢复收录";
      toggle.addEventListener("click", () => {
        r.include = !r.include;
        renderLocal();
      });
      row.appendChild(toggle);
    }
    box.appendChild(row);
  }
  const inc = local.rows.filter((r) => r.include && !r.missing).length;
  $("#localSummary").textContent = `将保存 ${inc} 条记录`;
}

/* ---------- 保存 photos.json ---------- */
async function saveLocal() {
  if (!local.dirHandle) return;
  const btn = $("#btnLocalSave");
  btn.disabled = true;
  try {
    const photos = local.rows
      .filter((r) => r.include && !r.missing)
      .map((r) => {
        const p = { src: r.src };
        if (r.date) p.date = r.date;
        if (r.caption) p.caption = r.caption;
        return p;
      });
    photos.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const jh = await local.dirHandle.getFileHandle("photos.json", { create: true });
    const jw = await jh.createWritable();
    await jw.write(JSON.stringify({ photos }, null, 2));
    await jw.close();
    log(`✅ photos.json 已保存（${photos.length} 条），刷新相册首页即可看到。`, "ok");
    await scanLocal();
  } catch (e) {
    log("保存失败：" + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 本地模式启动 ---------- */
(function bootLocal() {
  const btnPick = $("#btnPickDir");
  if (!window.showDirectoryPicker) {
    btnPick.disabled = true;
    btnPick.textContent = "当前浏览器不支持本地管理（请用 Chrome / Edge）";
    return;
  }
  btnPick.addEventListener("click", async () => {
    try {
      local.dirHandle = await showDirectoryPicker({ mode: "readwrite" });
      $("#localDirName").textContent = "✓ " + local.dirHandle.name;
      $("#localBody").hidden = false;
      $("#btnRescan").hidden = false;
      await scanLocal();
    } catch (e) { /* 用户取消 */ }
  });
  $("#btnRescan").addEventListener("click", scanLocal);
  $("#btnLocalSave").addEventListener("click", saveLocal);
})();
