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
  const columns = 'id,title,detail,author,created_at,done_on,done_by,done_note,done_photos,done_album';
  const MAX_UPLOADS = 10;  // done_photos：本次新上传的照片（数据库上限）
  const MAX_PICKED = 24;   // done_album：从相册里挑的老照片（数据库上限）
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  // 心愿里存着两种照片凭据：上传过的用 uuid，相册里的老照片用 photos/ 路径
  const photoKeys = w => [...(w.done_photos || []), ...(w.done_album || [])];
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
    addButton.hidden = false; // 未登录也显示，点了先登录
    const shown = wishes
      .filter(w => filter === 'all' || (filter === 'done') === !!w.done_on)
      // 没做的在前（按许愿先后），做完的在后（最近完成的在前）
      .sort((a, b) => (!!a.done_on - !!b.done_on) ||
        (a.done_on ? b.done_on.localeCompare(a.done_on) : a.created_at.localeCompare(b.created_at)));
    list.replaceChildren(...shown.map(card));
    empty.hidden = !loaded || shown.length > 0;
    empty.textContent = !wishes.length
      ? (me ? '还没有心愿。点「许个心愿」写下第一件想一起做的事。' : '还没有心愿。登录后点「许个心愿」写下第一件想一起做的事。')
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
      const keys = photoKeys(w);
      if (keys.length) body.append(photoStrip(keys));
    }
    li.append(mark, body);
    {
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
  function photoStrip(keys) {
    const strip = node('div', 'wish-photos');
    for (const key of keys) {
      const p = window.ForeverAlbum?.findByKey(key);
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
        b.addEventListener('click', () => window.ForeverAlbum.openByKey(key));
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

  /* ---------- 相册选图器 ----------
   * 整本相册的缩略图网格，按时间段筛选，点图选中 / 取消。
   * 一次只允许开一个；关掉时把选好的 key 交回打卡弹窗。 */
  const pickerDialog = node('dialog', 'wish-picker');
  pickerDialog.setAttribute('aria-labelledby', 'wishPickerTitle');
  document.body.append(pickerDialog);

  function openPicker({ chosen, limit, onDone }) {
    // 新的在前；同一刻（或都没有拍摄时间）的照片按名字排，顺序才稳定
    const all = (window.ForeverAlbum?.listPhotos() || []).slice()
      .sort((a, b) => (b.when || '').localeCompare(a.when || '') ||
        a.caption.localeCompare(b.caption, 'zh-Hans-CN'));
    let picked = new Set(chosen);
    let from = '', to = '';

    pickerDialog.replaceChildren();
    const head = node('header');
    const h = node('h2', '', '从相册里选照片');
    h.id = 'wishPickerTitle';
    const close = node('button', 'wish-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    head.append(h, close);

    // 时间段筛选：两个日期框 + 几个常用快捷段
    const bar = node('div', 'wish-picker-bar');
    const dateBox = node('div', 'wish-picker-dates');
    const mkDate = (label, onInput) => {
      const l = node('label', 'wish-picker-date');
      const i = node('input');
      i.type = 'date';
      i.addEventListener('change', onInput);
      l.append(node('span', '', label), i);
      dateBox.append(l);
      return i;
    };
    const fromInput = mkDate('从', () => { from = fromInput.value; renderGrid(); });
    const toInput = mkDate('到', () => { to = toInput.value; renderGrid(); });

    const quick = node('div', 'wish-picker-quick');
    const dates = all.map(p => p.date).filter(Boolean).sort();
    const shift = days => new Date(Date.now() + 8 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
    const ranges = [
      { label: '全部', from: '', to: '' },
      { label: '最近 7 天', from: shift(7), to: '' },
      { label: '最近 30 天', from: shift(30), to: '' },
      { label: '最近一年', from: shift(365), to: '' },
    ];
    // 相册里有哪些年份，就给哪些年份一个按钮
    const years = [...new Set(dates.map(d => d.slice(0, 4)))].sort().reverse();
    for (const y of years) ranges.push({ label: `${y} 年`, from: `${y}-01-01`, to: `${y}-12-31` });
    const quickButtons = ranges.map(r => {
      const b = node('button', 'wish-picker-chip', r.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        from = r.from; to = r.to;
        fromInput.value = from; toInput.value = to;
        renderGrid();
      });
      quick.append(b);
      return { b, r };
    });
    bar.append(dateBox, quick);

    const count = node('p', 'wish-picker-count');
    const grid = node('div', 'wish-picker-grid');
    const none = node('p', 'wish-hint wish-picker-none');
    const foot = node('div', 'wish-picker-foot');
    const clear = node('button', 'wish-act', '清空选择');
    clear.type = 'button';
    clear.addEventListener('click', () => { picked = new Set(); renderGrid(); });
    const confirm = node('button', 'wish-primary', '选好了');
    confirm.type = 'button';
    confirm.addEventListener('click', () => { onDone([...picked]); pickerDialog.close(); });
    foot.append(clear, confirm);

    function inRange(p) {
      if (!from && !to) return true;
      if (!p.date) return false; // 没有日期的照片只在「全部」里出现
      return (!from || p.date >= from) && (!to || p.date <= to);
    }
    function renderGrid() {
      const shown = all.filter(inRange);
      quickButtons.forEach(({ b, r }) =>
        b.setAttribute('aria-selected', String(r.from === from && r.to === to)));
      grid.replaceChildren(...shown.map(p => {
        const cell = node('button', 'wish-shot');
        cell.type = 'button';
        cell.setAttribute('aria-pressed', String(picked.has(p.key)));
        const img = node('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = p.thumb;
        img.onerror = () => { img.onerror = null; img.src = p.src; };
        const cap = node('span', 'wish-shot-cap', p.caption);
        const when = node('span', 'wish-shot-date', p.when || '没有日期');
        cell.append(img, node('span', 'wish-shot-tick', '✓'), cap, when);
        cell.title = `${p.caption}${p.when ? ' · ' + p.when : ''}`;
        cell.addEventListener('click', () => {
          if (picked.has(p.key)) picked.delete(p.key);
          else if (picked.size >= limit) { count.dataset.warn = '1'; renderCount(); return; }
          else picked.add(p.key);
          delete count.dataset.warn;
          renderGrid();
        });
        return cell;
      }));
      none.hidden = shown.length > 0;
      none.textContent = all.length
        ? '这段时间里没有照片，换个时间段看看。'
        : '相册还没有照片。可以先用下面的「上传新照片」添加。';
      renderCount();
    }
    function renderCount() {
      const scope = from || to
        ? `这段时间 ${all.filter(inRange).length} 张 / 共 ${all.length} 张`
        : `相册共 ${all.length} 张`;
      count.textContent = count.dataset.warn
        ? `最多选 ${limit} 张，先取消几张再选。`
        : `${scope} · 已选 ${picked.size} 张`;
      confirm.textContent = picked.size ? `选好了（${picked.size} 张）` : '选好了';
    }
    renderGrid();

    close.addEventListener('click', () => pickerDialog.close());
    pickerDialog.addEventListener('click', e => { if (e.target === pickerDialog) pickerDialog.close(); });
    pickerDialog.append(head, bar, count, grid, none, foot);
    pickerDialog.showModal();
  }

  // 完成打卡：以从相册选照片为主，也可以直接上传新照片，或者只写一段话
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

    // 已选中的相册照片（含上次打卡留下的），可以移出；照片本身仍留在相册里
    let kept = photoKeys(w);
    const keptBox = node('div', 'wish-chosen');
    function renderKept() {
      keptBox.replaceChildren(...kept.map(key => {
        const p = window.ForeverAlbum?.findByKey(key);
        const item = node('div', 'wish-chosen-item');
        const img = node('img');
        img.alt = '';
        img.loading = 'lazy';
        if (p) {
          img.src = p.thumb;
          img.onerror = () => { img.onerror = null; img.src = p.src; };
        }
        const cap = node('span', 'wish-chosen-cap', p ? p.caption : '照片归档中');
        const x = node('button', 'wish-chosen-remove', '✕');
        x.type = 'button';
        x.setAttribute('aria-label', `从打卡中移出 ${p ? p.caption : '这张照片'}`);
        x.addEventListener('click', () => { kept = kept.filter(k => k !== key); renderKept(); });
        item.append(img, cap, x);
        return item;
      }));
      pickButton.textContent = kept.length ? `从相册里挑照片（已选 ${kept.length} 张）` : '从相册里挑照片';
      keptEmpty.hidden = kept.length > 0;
    }
    const pickButton = node('button', 'wish-pick-open', '从相册里挑照片');
    pickButton.type = 'button';
    pickButton.addEventListener('click', () => openPicker({
      chosen: kept, limit: MAX_PICKED,
      onDone: keys => { kept = keys; error.textContent = ''; renderKept(); },
    }));
    const keptEmpty = node('p', 'wish-hint', '还没挑照片。点上面的按钮翻相册，可以按时间段筛。');
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
        if (fresh.length >= MAX_UPLOADS) { error.textContent = `一次最多上传 ${MAX_UPLOADS} 张新照片。`; break; }
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
    photos.append(node('span', '', '这次打卡的照片'), pickButton, keptBox, keptEmpty);

    // 相册里还没有的照片，可以当场上传（上传后也会进相册）
    const uploadBox = node('details', 'wish-upload-more');
    uploadBox.append(node('summary', '', '相册里没有？上传新照片'), freshBox, picker,
      node('p', 'wish-hint', `每张都要起个名字，会同时放进相册。一次最多 ${MAX_UPLOADS} 张，每张不超过 12MB，支持 JPEG / PNG / WebP。`));
    if (fresh.length) uploadBox.open = true;

    const hint = node('p', 'wish-hint', '照片和文字至少留下一样。');
    const { row, button } = submitRow(w.done_on ? '保存打卡' : '打卡完成', error);
    form.append(field('完成日期', date), photos, uploadBox, field('想说的话', note), hint, row);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = note.value.trim();
      if (!date.value) { error.textContent = '请选择完成日期。'; return; }
      if (!text && !kept.length && !fresh.length) { error.textContent = '至少挑一张照片，或者写几句话。'; return; }
      if (fresh.some(f => !f.name.value.trim())) { error.textContent = '每张新照片都需要一个名字。'; return; }
      if (kept.filter(isUuid).length + fresh.length > MAX_UPLOADS) {
        error.textContent = `上传的照片一次最多 ${MAX_UPLOADS} 张（含上次打卡留下的）。`; return;
      }
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
          // 上传过的照片按 uuid 存 done_photos，相册里的老照片按路径存 done_album
          check(await client.from(table).update({
            done_on: date.value, done_note: text,
            done_photos: [...kept.filter(isUuid), ...fresh.map(f => f.uploadId)],
            done_album: kept.filter(k => !isUuid(k)),
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
    if (!me) { auth.open(() => undo(w)); return; }
    confirmBox('撤销完成', `「${w.title}」会回到「还想做」，打卡的文字会清空。照片仍保留在相册里。`, '撤销完成',
      async () => check(await client.from(table).update({ done_on: null }).eq('id', w.id)));
  }
  function remove(w) {
    if (!me) { auth.open(() => remove(w)); return; }
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
  if (!client) { notice.textContent = '心愿清单加载失败，请刷新页面重试。'; return; }
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
