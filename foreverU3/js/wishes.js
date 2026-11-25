/* Wish list: things to do together, checked off with photos and/or words.
 * Everyone can read it; only the two signed-in members can change it (RLS in supabase/wishes.sql).
 * Check-in photos go through the normal upload pipeline, so they also land in the album. */
(() => {
  'use strict';
  const auth = window.ForeverAuth, client = auth?.client;
  const byId = id => document.getElementById(id);
  const list = byId('wishList'), empty = byId('wishEmpty'), notice = byId('wishNotice');
  const progress = byId('wishProgress'), addButton = byId('wishAdd');
  const table = 'forever_wishes';
  const columns = 'id,title,detail,author,created_at,done_on,done_by,done_note,done_photos';
  const MAX_PHOTOS = 10;
  let wishes = [], me = null, filter = 'all', loaded = false, syncing = false, again = false;

  const node = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  };
  const check = r => { if (r.error) throw r.error; return r.data; };
  const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间
  const fmtDate = d => { const [y, m, day] = d.split('-'); return `${y} 年 ${+m} 月 ${+day} 日`; };

  /* ---------- 列表 ---------- */
  function render() {
    const done = wishes.filter(w => w.done_on).length;
    progress.textContent = wishes.length ? `已经一起完成 ${done} / ${wishes.length} 件` : '';
    addButton.hidden = !me;
    const shown = wishes
      .filter(w => filter === 'all' || (filter === 'done') === !!w.done_on)
      // 没做的在前（按许愿先后），做完的在后（最近完成的在前）
      .sort((a, b) => (!!a.done_on - !!b.done_on) ||
        (a.done_on ? b.done_on.localeCompare(a.done_on) : a.created_at.localeCompare(b.created_at)));
    list.replaceChildren(...shown.map(card));
    empty.hidden = !loaded || shown.length > 0;
    empty.textContent = !wishes.length
      ? (me ? '还没有心愿。点「许个心愿」写下第一件想一起做的事。' : '还没有心愿。')
      : filter === 'done' ? '还没有完成的心愿，加油呀。' : '心愿都完成啦！再许一个吧。';
  }
  function card(w) {
    const li = node('li', 'wish-card glass' + (w.done_on ? ' done' : ''));
    li.dataset.wishId = w.id;
    const mark = node('span', 'wish-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = w.done_on ? '✓' : '';
    const body = node('div', 'wish-body');
    body.append(node('h3', 'wish-name', w.title));
    if (w.detail) body.append(node('p', 'wish-detail', w.detail));
    const meta = node('p', 'wish-meta');
    meta.textContent = w.done_on
      ? `${fmtDate(w.done_on)} 完成${w.done_by ? ' · ' + w.done_by + ' 打卡' : ''}`
      : `${w.author} 许下的心愿`;
    body.append(meta);
    if (w.done_on) {
      if (w.done_note) body.append(node('p', 'wish-note', w.done_note));
      if (w.done_photos?.length) body.append(photoStrip(w.done_photos));
    }
    li.append(mark, body);
    if (me) {
      const actions = node('div', 'wish-actions');
      const act = (label, fn, cls = '') => {
        const b = node('button', 'wish-act' + cls, label);
        b.type = 'button';
        b.addEventListener('click', fn);
        actions.append(b);
      };
      if (w.done_on) {
        act('编辑打卡', () => openDone(w));
        act('撤销完成', () => undo(w));
      } else act('完成打卡', () => openDone(w), ' primary');
      act('修改', () => openEdit(w));
      act('删除', () => remove(w), ' danger');
      li.append(actions);
    }
    return li;
  }
  function photoStrip(ids) {
    const strip = node('div', 'wish-photos');
    for (const id of ids) {
      const p = window.ForeverAlbum?.findUpload(id);
      const b = node('button', 'wish-photo');
      b.type = 'button';
      if (p) {
        const img = node('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = p.thumb;
        img.onerror = () => { img.onerror = null; img.src = p.src; };
        b.append(img, node('span', 'wish-photo-cap', p.caption));
        b.setAttribute('aria-label', `看照片「${p.caption}」的大图`);
        b.addEventListener('click', () => window.ForeverAlbum.openUpload(id));
      } else {
        // 未归档的照片只对登录成员可见；归档上线后所有人都能看
        b.disabled = true;
        b.classList.add('pending');
        b.append(node('span', 'wish-photo-cap', '照片归档中'));
      }
      strip.append(b);
    }
    return strip;
  }

  /* ---------- 同步 ---------- */
  async function sync() {
    if (!client) return;
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      wishes = check(await client.from(table).select(columns).order('created_at').limit(1000));
      loaded = true;
      notice.textContent = '';
      render();
    } catch (_) {
      notice.textContent = navigator.onLine ? '心愿清单暂时没有加载成功，正在自动重试。' : '网络已断开。';
    } finally {
      syncing = false;
      if (again) { again = false; sync(); }
    }
  }

  /* ---------- 弹窗 ---------- */
  const dialog = node('dialog', 'wish-dialog');
  dialog.setAttribute('aria-labelledby', 'wishDialogTitle');
  document.body.append(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog && !dialog.dataset.busy) dialog.close(); });
  dialog.addEventListener('cancel', e => { if (dialog.dataset.busy) e.preventDefault(); });

  function shell(title) {
    dialog.replaceChildren();
    const head = node('header');
    const h = node('h2', '', title);
    h.id = 'wishDialogTitle';
    const close = node('button', 'wish-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => { if (!dialog.dataset.busy) dialog.close(); });
    head.append(h, close);
    const form = node('form');
    form.noValidate = true; // 用下面统一的中文提示，不弹浏览器原生气泡
    const error = node('p', 'wish-error');
    error.setAttribute('role', 'alert');
    dialog.append(head, form);
    return { form, error };
  }
  function field(label, input) {
    const l = node('label', 'wish-field');
    l.append(node('span', '', label), input);
    return l;
  }
  function textInput(name, value, max, multiline = false) {
    const i = node(multiline ? 'textarea' : 'input');
    i.name = name;
    i.maxLength = max;
    i.value = value || '';
    if (multiline) i.rows = 3; else i.type = 'text';
    return i;
  }
  function submitRow(label, error) {
    const row = node('div', 'wish-submit');
    const b = node('button', 'wish-primary', label);
    b.type = 'submit';
    row.append(error, b);
    return { row, button: b };
  }
  async function busy(button, fn) {
    dialog.dataset.busy = '1';
    button.disabled = true;
    try { return await fn(); }
    finally { delete dialog.dataset.busy; button.disabled = false; }
  }
  const errorText = e => e?.message && /[一-龥]/.test(e.message)
    ? e.message : navigator.onLine ? '保存失败，请稍后再试。' : '网络已断开，请联网后重试。';

  // 许愿 / 修改
  function openEdit(w) {
    if (!me) { auth.open(() => openEdit(w)); return; }
    const { form, error } = shell(w ? '修改心愿' : '许个心愿');
    const title = textInput('title', w?.title, 80);
    title.required = true;
    title.placeholder = '比如：一起去看一次海上日出';
    const detail = textInput('detail', w?.detail, 500, true);
    detail.placeholder = '想怎么做、在哪里……（可不填）';
    const { row, button } = submitRow(w ? '保存' : '许下心愿', error);
    form.append(field('心愿', title), field('补充说明', detail), row);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const values = { title: title.value.trim(), detail: detail.value.trim() };
      if (!values.title) { error.textContent = '写下想做的事吧。'; return; }
      error.textContent = '';
      await busy(button, async () => {
        try {
          check(w ? await client.from(table).update(values).eq('id', w.id)
                  : await client.from(table).insert(values));
          dialog.close();
          await sync();
        } catch (err) { error.textContent = errorText(err); }
      });
    });
    dialog.showModal();
    title.focus();
  }

  // 完成打卡：照片（每张要命名，同时进相册）和 / 或一段文字，至少一样
  function openDone(w) {
    if (!me) { auth.open(() => openDone(w)); return; }
    const { form, error } = shell(w.done_on ? '编辑打卡' : `完成打卡 · ${w.title}`);
    const date = node('input');
    date.type = 'date';
    date.name = 'date';
    date.required = true;
    date.max = today();
    date.value = w.done_on || today();
    const note = textInput('note', w.done_note, 1000, true);
    note.placeholder = '那天发生了什么，想记下的话……';

    // 已有照片可以移出打卡（照片本身仍留在相册里）
    let kept = [...(w.done_photos || [])];
    const keptBox = node('div', 'wish-pick-list');
    function renderKept() {
      keptBox.replaceChildren(...kept.map(id => {
        const p = window.ForeverAlbum?.findUpload(id);
        const item = node('div', 'wish-pick');
        const img = node('img');
        img.alt = '';
        if (p) img.src = p.thumb;
        const name = node('span', 'wish-pick-name', p ? p.caption : '照片归档中');
        const x = node('button', 'wish-pick-remove', '移出');
        x.type = 'button';
        x.setAttribute('aria-label', `从打卡中移出 ${p ? p.caption : '这张照片'}`);
        x.addEventListener('click', () => { kept = kept.filter(k => k !== id); renderKept(); });
        item.append(img, name, x);
        return item;
      }));
    }
    renderKept();

    // 新照片：每张一个必填名称（默认取文件名）
    const fresh = [];
    const freshBox = node('div', 'wish-pick-list');
    const picker = node('input');
    picker.type = 'file';
    picker.accept = 'image/jpeg,image/png,image/webp';
    picker.multiple = true;
    picker.className = 'wish-file';
    picker.addEventListener('change', () => {
      for (const file of picker.files) {
        if (kept.length + fresh.length >= MAX_PHOTOS) { error.textContent = `每个心愿最多 ${MAX_PHOTOS} 张照片。`; break; }
        const entry = { file, uploadId: null, url: URL.createObjectURL(file) };
        entry.name = textInput('photoName', file.name.replace(/\.[^.]+$/, '').slice(0, 200), 200);
        entry.name.required = true;
        entry.name.setAttribute('aria-label', '照片名称');
        entry.name.placeholder = '给这张照片起个名字';
        fresh.push(entry);
      }
      picker.value = '';
      renderFresh();
    });
    function renderFresh() {
      freshBox.replaceChildren(...fresh.map(entry => {
        const item = node('div', 'wish-pick');
        const img = node('img');
        img.alt = '';
        img.src = entry.url;
        const x = node('button', 'wish-pick-remove', entry.uploadId ? '已上传' : '移除');
        x.type = 'button';
        x.disabled = !!entry.uploadId;
        x.addEventListener('click', () => {
          URL.revokeObjectURL(entry.url);
          fresh.splice(fresh.indexOf(entry), 1);
          renderFresh();
        });
        item.append(img, entry.name, x);
        return item;
      }));
    }
    dialog.addEventListener('close', () => fresh.forEach(f => URL.revokeObjectURL(f.url)), { once: true });

    const photos = node('div', 'wish-field');
    photos.append(node('span', '', '照片（会同时放进相册，每张都要起名字）'), keptBox, freshBox, picker);
    const hint = node('p', 'wish-hint', '照片和文字至少留下一样。每张不超过 12MB，支持 JPEG / PNG / WebP。');
    const { row, button } = submitRow(w.done_on ? '保存打卡' : '打卡完成', error);
    form.append(field('完成日期', date), photos, field('想说的话', note), hint, row);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = note.value.trim();
      if (!date.value) { error.textContent = '请选择完成日期。'; return; }
      if (!text && !kept.length && !fresh.length) { error.textContent = '至少放一张照片，或者写几句话。'; return; }
      if (fresh.some(f => !f.name.value.trim())) { error.textContent = '每张照片都需要一个名字。'; return; }
      error.textContent = '';
      await busy(button, async () => {
        try {
          // 已传成功的照片记下 id，重试时不会重复上传
          for (const [i, entry] of fresh.entries()) {
            if (entry.uploadId) continue;
            button.textContent = `正在上传照片 ${i + 1} / ${fresh.length}`;
            entry.uploadId = await window.ForeverUploads.upload(entry.file, entry.name.value.trim(), date.value);
            entry.name.disabled = true;
            renderFresh();
          }
          button.textContent = '正在保存';
          check(await client.from(table).update({
            done_on: date.value, done_note: text,
            done_photos: [...kept, ...fresh.map(f => f.uploadId)],
          }).eq('id', w.id));
          dialog.close();
          window.ForeverUploads.refresh();
          await sync();
        } catch (err) {
          const uploaded = fresh.filter(f => f.uploadId).length;
          error.textContent = (uploaded ? `已上传 ${uploaded} 张，` : '') + errorText(err) + ' 再点一次会接着保存。';
        } finally { button.textContent = w.done_on ? '保存打卡' : '打卡完成'; }
      });
    });
    dialog.showModal();
  }

  function confirmBox(title, text, label, action) {
    const { form, error } = shell(title);
    const { row, button } = submitRow(label, error);
    button.classList.add('danger');
    form.append(node('p', 'wish-hint', text), row);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      await busy(button, async () => {
        try { await action(); dialog.close(); await sync(); }
        catch (err) { error.textContent = errorText(err); }
      });
    });
    dialog.showModal();
    button.focus();
  }
  function undo(w) {
    confirmBox('撤销完成', `「${w.title}」会回到「还想做」，打卡的文字会清空。照片仍保留在相册里。`, '撤销完成',
      async () => check(await client.from(table).update({ done_on: null }).eq('id', w.id)));
  }
  function remove(w) {
    confirmBox('删除心愿', `确定删除「${w.title}」吗？删除后无法恢复；打卡用过的照片仍保留在相册里。`, '删除',
      async () => check(await client.from(table).delete().eq('id', w.id)));
  }

  /* ---------- 启动 ---------- */
  document.querySelectorAll('.wish-filters [data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('.wish-filters [data-filter]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    render();
  }));
  addButton.addEventListener('click', () => openEdit(null));
  if (!client) { notice.textContent = '心愿清单加载失败，请刷新页面重试。'; addButton.hidden = true; return; }
  auth.onChange(state => {
    me = state?.name || null;
    if (!me && dialog.open) dialog.close();
    render();
    sync();
  });
  client.channel('foreveru-wishes').on('postgres_changes', { event: '*', schema: 'public', table }, () => sync()).subscribe();
  // 相册合并了新照片（含未归档的）后，重画打卡里的照片
  window.addEventListener('forever-album-changed', render);
  window.addEventListener('forever-album-ready', render);
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden && document.body.dataset.mode === 'wishes') sync(); }, 60000);
})();
