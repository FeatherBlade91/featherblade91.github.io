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
  deletions: new Set(),     // 标记移入回收站的照片对象
  deletionHistory: [],
  originalSources: new Map(),
  currentPhotoIndex: 0,
  committing: false,
  pendingCommit: null,
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
    $("#tokenStatus").textContent = "请填写 GitHub Token";
    $("#inToken").focus();
    return;
  }
  log(`正在连接 ${state.owner}/${state.repo} ...`);
  try {
    await gh(`/git/ref/heads/${state.branch}`);
    if ($("#chkSaveToken").checked) localStorage.setItem("albumAdminToken", state.token);
    else localStorage.removeItem("albumAdminToken");
    $("#tokenStatus").textContent = "✓ 已连接";
    $("#authModal").hidden = true;
    log("GitHub 连接成功", "ok");
    const pendingCommit = state.pendingCommit;
    state.pendingCommit = null;
    if (pendingCommit !== null) await commitAll(pendingCommit);
  } catch (e) {
    $("#tokenStatus").textContent = "连接失败，请检查 Token 权限";
    log("连接失败：" + e.message, "err");
  }
}

async function loadPublicManifest() {
  const cfg = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.repo) || {};
  state.owner = cfg.owner || "";
  state.repo = cfg.name || "";
  state.branch = cfg.branch || "main";
  const pp = cfg.pathPrefix || "";
  state.prefix = pp ? pp.replace(/\/*$/, "/") : "";
  try {
    const response = await fetch(`photos.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.manifest = await response.json();
    state.originalSources = new Map((state.manifest.photos || []).map((photo) => [photo, photo.src]));
    renderPhotoList();
  } catch (error) {
    $("#reviewLoader").textContent = "相册读取失败";
    $("#editorStatus").textContent = error.message;
  }
}

function openAuth(pendingCommit = null) {
  state.pendingCommit = pendingCommit;
  $("#authModal").hidden = false;
  requestAnimationFrame(() => $("#inToken").focus());
}

function compactDate(date) {
  return String(date || "").replace(/\D/g, "").slice(0, 8);
}

function canonicalDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (!/^\d{8}$/.test(digits)) throw new Error("日期请填写 8 位数字，例如 20260825");
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error("日期无效，请检查 YYYYMMDD");
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function fileNameFromSrc(src) {
  return String(src || "").split("/").pop() || "";
}

function normalizePhotoName(value, currentSrc) {
  let name = String(value || "").trim();
  if (!name) throw new Error("文件名不能为空");
  if (!/\.[a-z0-9]+$/i.test(name)) {
    const extension = fileNameFromSrc(currentSrc).match(/(\.[^.]+)$/);
    if (extension) name += extension[1];
  }
  if (name === "." || name === ".." || /[\\/:*?"<>|\u0000-\u001f]/.test(name)) {
    throw new Error("文件名含有无效字符");
  }
  if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(name)) {
    throw new Error("请保留图片扩展名（jpg、png、webp、gif 或 svg）");
  }
  const oldExtension = fileNameFromSrc(currentSrc).match(/\.[^.]+$/)?.[0].toLowerCase();
  const newExtension = name.match(/\.[^.]+$/)?.[0].toLowerCase();
  if (oldExtension && newExtension !== oldExtension) throw new Error("改名时不能更改图片扩展名");
  return name;
}

function photoPreviewSrc(photo) {
  const src = state.originalSources.get(photo) || photo.src;
  if (!state.owner || !state.repo) return src;
  const path = `${state.prefix}${src}`.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/${encodeURIComponent(state.branch)}/${path}`;
}

function markForTrash(photo) {
  if (!photo || state.deletions.has(photo)) return;
  state.deletions.add(photo);
  state.deletionHistory.push(photo);
}

function restorePhoto(photo) {
  state.deletions.delete(photo);
  state.deletionHistory = state.deletionHistory.filter((item) => item !== photo);
}

function undoTrash() {
  try { syncEditorToPhoto(); }
  catch (e) {
    $("#editorStatus").textContent = e.message;
    return;
  }
  while (state.deletionHistory.length) {
    const photo = state.deletionHistory.pop();
    if (!state.deletions.has(photo)) continue;
    state.deletions.delete(photo);
    renderPhotoList();
    $("#editorStatus").textContent = `已恢复 ${fileNameFromSrc(photo.src)}`;
    return;
  }
}

function selectPhoto(index, focus) {
  const photos = state.manifest.photos || [];
  if (!photos.length) return;
  state.currentPhotoIndex = (index + photos.length) % photos.length;
  renderPhotoEditor(focus);
  document.querySelectorAll("#photoList .photo-row").forEach((row, i) => {
    row.classList.toggle("active", i === state.currentPhotoIndex);
  });
}

function renderPhotoEditor(focus) {
  const photos = state.manifest.photos || [];
  const editor = $("#photoEditor");
  if (!photos.length) {
    editor.hidden = true;
    $("#reviewEmpty").hidden = false;
    return;
  }
  state.currentPhotoIndex = Math.min(state.currentPhotoIndex, photos.length - 1);
  const p = photos[state.currentPhotoIndex];
  editor.hidden = false;
  $("#reviewEmpty").hidden = true;
  $("#editorCounter").textContent = `${String(state.currentPhotoIndex + 1).padStart(3, "0")} / ${String(photos.length).padStart(3, "0")}`;
  $("#editorImage").classList.remove("ready");
  $("#reviewLoader").hidden = false;
  $("#editorImage").src = photoPreviewSrc(p);
  $("#editorName").value = fileNameFromSrc(p.src);
  $("#editorCaption").value = p.caption || "";
  $("#editorDate").value = compactDate(p.date);
  $("#editorFilename").textContent = p.src;
  $("#editorStatus").textContent = state.deletions.has(p) ? "保存后移入回收站" : "";
  $("#btnTrashCurrent").textContent = state.deletions.has(p) ? "撤销回收" : "移入回收站";
  if (focus) requestAnimationFrame(() => $(focus).focus());
}

function syncEditorToPhoto() {
  const photos = state.manifest.photos || [];
  const p = photos[state.currentPhotoIndex];
  if (!p) return;
  p.src = `photos/${normalizePhotoName($("#editorName").value, state.originalSources.get(p) || p.src)}`;
  p.caption = $("#editorCaption").value.trim();
  p.date = canonicalDate($("#editorDate").value);
}

async function saveCurrentPhoto() {
  try {
    syncEditorToPhoto();
  } catch (e) {
    $("#editorStatus").textContent = e.message;
    (e.message.includes("日期") ? $("#editorDate") : $("#editorName")).focus();
    return;
  }
  if (!state.token) {
    openAuth(false);
    return;
  }
  await commitAll(false);
}

/* ---------- 现有照片列表 ---------- */
function renderPhotoList() {
  const photos = state.manifest.photos || [];
  if (!photos.length) {
    renderPhotoEditor();
    return;
  }
  renderPhotoEditor();
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
  $("#btnUpload").disabled = !state.pending.length;
}

function thumbPath(src) {
  return String(src).replace(/^photos\//, "thumbs/");
}

function repositoryPath(src) {
  return `${state.prefix}${src}`;
}

function setTreeEntry(entries, path, entry) {
  entries.set(path, { path, mode: "100644", type: "blob", ...entry });
}

function validateDestinations(photos) {
  const destinations = new Set();
  for (const photo of photos) {
    if (state.deletions.has(photo)) continue;
    const normalized = `photos/${normalizePhotoName(fileNameFromSrc(photo.src), photo.src)}`;
    if (destinations.has(normalized)) throw new Error(`文件名重复：${fileNameFromSrc(normalized)}`);
    destinations.add(normalized);
    photo.src = normalized;
  }
}

/* ---------- 提交：一次 commit 包含新图片 + 更新后的 photos.json ---------- */
async function commitAll(withImages) {
  if (state.committing) return;
  if (!state.token) {
    openAuth(withImages);
    return;
  }
  if ((state.manifest.photos || []).length) {
    try { syncEditorToPhoto(); }
    catch (e) {
      $("#editorStatus").textContent = e.message;
      (e.message.includes("日期") ? $("#editorDate") : $("#editorName")).focus();
      return;
    }
  }
  try { validateDestinations(state.manifest.photos || []); }
  catch (e) {
    $("#editorStatus").textContent = e.message;
    return;
  }
  state.committing = true;
  const saveButtons = [$("#btnUpload"), $("#btnSaveManifest"), $("#btnSaveCurrent")];
  saveButtons.forEach((button) => { button.disabled = true; });
  try {
    log("读取分支引用…");
    const ref = await gh(`/git/ref/heads/${state.branch}`);
    const baseCommit = ref.object.sha;
    const commit = await gh(`/git/commits/${baseCommit}`);
    const baseTree = commit.tree.sha;

    const baseTreeData = await gh(`/git/trees/${baseTree}?recursive=1`);
    if (baseTreeData.truncated) throw new Error("仓库文件列表过大，无法安全执行改名或回收站操作");
    const blobs = new Map((baseTreeData.tree || [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry.sha]));
    const treeEntries = new Map();
    const managedPaths = new Set();
    for (const photo of state.manifest.photos || []) {
      const originalSrc = state.originalSources.get(photo) || photo.src;
      managedPaths.add(repositoryPath(originalSrc));
      managedPaths.add(repositoryPath(thumbPath(originalSrc)));
    }
    for (const photo of state.manifest.photos || []) {
      if (state.deletions.has(photo)) continue;
      for (const target of [repositoryPath(photo.src), repositoryPath(thumbPath(photo.src))]) {
        if (blobs.has(target) && !managedPaths.has(target)) {
          throw new Error(`目标文件已存在：${target.replace(state.prefix, "")}`);
        }
      }
    }

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
      const path = `${state.prefix}photos/${Date.now()}-${newEntries.length}-${safe}`;
      setTreeEntry(treeEntries, path, { sha: blob.sha });
      newEntries.push({ src: path.replace(new RegExp("^" + state.prefix), ""), date: item.date, caption: item.caption });
    }

    // 2. 改名与删除都迁移已有 blob；删除项进入仓库 trash/ 文件夹。
    const trashStamp = new Date().toISOString().replace(/[:.]/g, "-");
    const moves = [];
    for (const [index, photo] of (state.manifest.photos || []).entries()) {
      const oldSrc = state.originalSources.get(photo) || photo.src;
      const oldPaths = [oldSrc, thumbPath(oldSrc)];
      if (state.deletions.has(photo)) {
        for (const oldPath of oldPaths) {
          const oldRepoPath = repositoryPath(oldPath);
          const sha = blobs.get(oldRepoPath);
          if (!sha) {
            if (oldPath === oldSrc) throw new Error(`仓库中找不到原图，无法移入回收站：${oldSrc}`);
            continue;
          }
          const kind = oldPath.startsWith("thumbs/") ? "thumbs" : "photos";
          const trashPath = `${state.prefix}trash/${kind}/${trashStamp}-${index}-${fileNameFromSrc(oldPath)}`;
          moves.push({ oldRepoPath, newRepoPath: trashPath, sha });
        }
        continue;
      }
      if (photo.src === oldSrc) continue;
      const newPaths = [photo.src, thumbPath(photo.src)];
      for (let pathIndex = 0; pathIndex < oldPaths.length; pathIndex++) {
        const oldRepoPath = repositoryPath(oldPaths[pathIndex]);
        const sha = blobs.get(oldRepoPath);
        if (!sha) {
          if (pathIndex === 0) throw new Error(`仓库中找不到原图：${oldPaths[pathIndex]}`);
          continue;
        }
        moves.push({ oldRepoPath, newRepoPath: repositoryPath(newPaths[pathIndex]), sha });
      }
    }
    for (const move of moves) setTreeEntry(treeEntries, move.oldRepoPath, { sha: null });
    for (const move of moves) setTreeEntry(treeEntries, move.newRepoPath, { sha: move.sha });

    // 3. 合成新的 photos.json
    const kept = (state.manifest.photos || []).filter((photo) => !state.deletions.has(photo));
    const manifest = { photos: kept.map((photo) => ({ ...photo })).concat(newEntries) };
    log("更新 photos.json…");
    setTreeEntry(treeEntries, `${state.prefix}photos.json`, {
      content: JSON.stringify(manifest, null, 2),
    });

    // 4. 新 tree → commit → 更新 ref
    log("创建提交…");
    const newTree = await gh("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: [...treeEntries.values()] }),
    });
    const msg = newEntries.length
      ? `💌 上传 ${newEntries.length} 张新照片`
      : state.deletions.size
        ? `🗑️ 整理相册并移入回收站`
        : `📝 更新相册名称与日期`;
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
    state.deletionHistory = [];
    state.originalSources = new Map((manifest.photos || []).map((photo) => [photo, photo.src]));
    renderPending();
    renderPhotoList();
    $("#uploadCard").hidden = true;
    log(`✅ 提交成功！GitHub Pages 会在 1~2 分钟后更新线上相册。`, "ok");
  } catch (e) {
    log("提交失败：" + e.message, "err");
  } finally {
    state.committing = false;
    saveButtons.forEach((button) => { button.disabled = false; });
    $("#btnUpload").disabled = !state.pending.length;
  }
}

/* ---------- 背景泡泡（简化版） ---------- */
function initBubbles() {
  const box = $("#bubbles");
  if (!box) return;
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

function initPhotoEditor() {
  $("#editorImage").addEventListener("load", () => {
    $("#reviewLoader").hidden = true;
    $("#editorImage").classList.add("ready");
  });
  $("#editorImage").addEventListener("error", () => {
    $("#reviewLoader").hidden = false;
    $("#reviewLoader").textContent = "图片读取失败";
  });
  $("#editorName").addEventListener("input", () => {
    $("#editorStatus").textContent = "尚未保存";
  });
  $("#editorCaption").addEventListener("input", () => {
    const p = (state.manifest.photos || [])[state.currentPhotoIndex];
    if (p) p.caption = $("#editorCaption").value;
  });
  $("#editorDate").addEventListener("input", () => {
    $("#editorDate").setCustomValidity("");
  });
  $("#editorDate").addEventListener("blur", () => {
    try {
      const date = canonicalDate($("#editorDate").value);
      $("#editorDate").value = compactDate(date);
      $("#editorDate").setCustomValidity("");
    } catch (e) {
      if ($("#editorDate").value) {
        $("#editorDate").setCustomValidity(e.message);
        $("#editorStatus").textContent = e.message;
      }
    }
  });
  $("#editorDate").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCurrentPhoto();
    }
  });
  $("#btnPrevPhoto").addEventListener("click", () => {
    try { syncEditorToPhoto(); } catch (e) { $("#editorStatus").textContent = e.message; return; }
    selectPhoto(state.currentPhotoIndex - 1);
  });
  $("#btnNextPhoto").addEventListener("click", () => {
    try { syncEditorToPhoto(); } catch (e) { $("#editorStatus").textContent = e.message; return; }
    selectPhoto(state.currentPhotoIndex + 1);
  });
  $("#btnSaveCurrent").addEventListener("click", saveCurrentPhoto);
  $("#btnTrashCurrent").addEventListener("click", () => {
    try { syncEditorToPhoto(); }
    catch (error) { $("#editorStatus").textContent = error.message; return; }
    const photo = state.manifest.photos[state.currentPhotoIndex];
    if (state.deletions.has(photo)) restorePhoto(photo);
    else markForTrash(photo);
    renderPhotoEditor();
  });
  document.addEventListener("keydown", (e) => {
    if ($("#listCard").hidden || !(state.manifest.photos || []).length) return;
    const target = e.target;
    const editing = target && target.matches("input, textarea, select");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCurrentPhoto();
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      const input = $("#editorName");
      input.focus();
      const dot = input.value.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !editing) {
      e.preventDefault();
      undoTrash();
      return;
    }
    if (e.key === "Delete" && !editing) {
      e.preventDefault();
      try { syncEditorToPhoto(); }
      catch (err) {
        $("#editorStatus").textContent = err.message;
        return;
      }
      const photo = state.manifest.photos[state.currentPhotoIndex];
      markForTrash(photo);
      renderPhotoList();
      selectPhoto(state.currentPhotoIndex + 1);
      return;
    }
    if (e.key === "ArrowLeft" && !editing) {
      e.preventDefault();
      try { syncEditorToPhoto(); } catch (err) { $("#editorStatus").textContent = err.message; return; }
      selectPhoto(state.currentPhotoIndex - 1);
    } else if (e.key === "ArrowRight" && !editing) {
      e.preventDefault();
      try { syncEditorToPhoto(); } catch (err) { $("#editorStatus").textContent = err.message; return; }
      selectPhoto(state.currentPhotoIndex + 1);
    }
  });
}

/* ---------- 启动 ---------- */
(function boot() {
  initPhotoEditor();
  // 预填仓库信息
  const cfg = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.repo) || {};
  $("#inOwner").value = cfg.owner || "";
  $("#inRepo").value = cfg.name || "";
  $("#inBranch").value = cfg.branch || "main";

  const savedToken = localStorage.getItem("albumAdminToken") || "";
  if (savedToken) {
    $("#inToken").value = savedToken;
    $("#chkSaveToken").checked = true;
    state.token = savedToken;
  }

  loadPublicManifest();

  fetch("/__github_token")
    .then((r) => r.ok ? r.json() : Promise.reject(new Error("本机桥接服务不可用")))
    .then((data) => {
      if (!data.token) throw new Error(data.error || "未找到 gh 登录");
      $("#inToken").value = data.token;
      state.token = data.token;
      $("#tokenStatus").textContent = "✓ 已读取本机 gh 凭据";
    })
    .catch(() => {});

  $("#btnConnect").addEventListener("click", connect);
  $("#btnUpload").addEventListener("click", () => commitAll(true));
  $("#btnSaveManifest").addEventListener("click", () => commitAll(false));
  $("#btnOpenAuth").addEventListener("click", () => openAuth(null));
  $("#btnCloseAuth").addEventListener("click", () => { $("#authModal").hidden = true; state.pendingCommit = null; });
  $("#btnOpenUpload").addEventListener("click", () => { $("#uploadCard").hidden = false; });
  $("#btnCloseUpload").addEventListener("click", () => { $("#uploadCard").hidden = true; });
  $("#authModal").addEventListener("click", (event) => {
    if (event.target === $("#authModal")) $("#btnCloseAuth").click();
  });
  $("#uploadCard").addEventListener("click", (event) => {
    if (event.target === $("#uploadCard")) $("#btnCloseUpload").click();
  });

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
