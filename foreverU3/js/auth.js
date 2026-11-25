/* One sign-in for the whole site. Chat, uploads and the wish list follow this state;
 * Supabase RLS stays the authority for what each account may read or change. */
(() => {
  'use strict';
  const config = window.FOREVER_CHAT_CONFIG;
  const listeners = new Set();
  let client = null, state = null, resolved = false, activeId, pending = null;
  let epoch = 0, explicit = false, after = null, busy = false;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'float-btn auth-btn';
  const dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.setAttribute('aria-labelledby', 'authTitle');
  dialog.innerHTML = `<header><h2 id="authTitle">登录</h2><button type="button" class="auth-close" data-close aria-label="关闭">✕</button></header>
    <form data-form>
      <p class="auth-lead">登录后，就能聊天、上传照片、一起打卡心愿。</p>
      <fieldset class="auth-identities"><legend class="auth-sr">身份</legend><label><input type="radio" name="identity" value="LYK" checked/><span>LYK</span></label><label><input type="radio" name="identity" value="DMY"/><span>DMY</span></label></fieldset>
      <label class="auth-sr" for="authPassword">密码</label>
      <input id="authPassword" class="auth-password" name="password" type="password" autocomplete="current-password" placeholder="密码" required minlength="8" maxlength="128" />
      <p class="auth-error" data-error role="alert"></p>
      <button class="auth-primary" type="submit">登录</button>
    </form>
    <div data-account hidden>
      <p class="auth-lead">已登录为 <strong data-name></strong>。聊天、上传和心愿清单都使用这个身份。</p>
      <p class="auth-error" data-account-error role="alert"></p>
      <button class="auth-secondary" type="button" data-signout>退出登录</button>
    </div>`;
  document.body.append(button, dialog);
  const q = s => dialog.querySelector(s);
  const form = q('[data-form]'), account = q('[data-account]'), error = q('[data-error]');
  const submit = form.querySelector('[type=submit]'), signOutButton = q('[data-signout]');

  function render() {
    const name = state?.name;
    button.classList.toggle('signed-in', !!name);
    button.textContent = name || '';
    if (!name) button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg>';
    button.title = name ? `已登录：${name}` : '登录';
    button.setAttribute('aria-label', name ? `已登录为 ${name}，查看账号` : '登录');
    form.hidden = !!name;
    account.hidden = !name;
    q('#authTitle').textContent = name ? '账号' : '登录';
    q('[data-name]').textContent = name || '';
  }
  function emit(reason) {
    resolved = true;
    render();
    for (const fn of listeners) {
      try { fn(state, reason); } catch (e) { console.error(e); }
    }
  }
  // Concurrent calls for the same session share one membership check.
  function sessionChanged(session) {
    const id = session?.user?.id || null;
    if (resolved && id === activeId) return pending || Promise.resolve();
    activeId = id;
    const current = ++epoch;
    pending = (async () => {
      if (!id) {
        const reason = explicit ? 'signout' : 'expired';
        explicit = false;
        state = null;
        emit(reason);
        return;
      }
      const { data, error: failed } = await client.from('forever_chat_members').select('name').eq('user_id', id).maybeSingle();
      if (current !== epoch) return;
      if (failed || !data) {
        state = null;
        emit('error');
        if (failed) {
          // Keep the saved session: a network hiccup must not log anyone out.
          activeId = undefined;
          error.textContent = '暂时无法验证身份，请检查网络后重试。';
        } else {
          error.textContent = '这个账号还不是成员。';
          await client.auth.signOut({ scope: 'local' });
        }
        return;
      }
      error.textContent = '';
      state = Object.freeze({ user: session.user, name: data.name });
      emit('signin');
    })();
    return pending;
  }

  function open(then) {
    after = typeof then === 'function' ? then : null;
    q('[data-account-error]').textContent = '';
    render();
    dialog.showModal();
    if (!state && !matchMedia('(pointer: coarse)').matches) form.elements.password.focus();
  }
  async function signOut() {
    explicit = true;
    const { error: failed } = await client.auth.signOut({ scope: 'local' });
    if (failed) { explicit = false; throw failed; }
    await sessionChanged(null);
  }

  button.addEventListener('click', () => open());
  q('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { after = null; form.elements.password.value = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client) return;
    busy = true;
    submit.disabled = true;
    error.textContent = '';
    const name = new FormData(form).get('identity');
    try {
      const { data, error: failed } = await client.auth.signInWithPassword({ email: config.accounts[name], password: form.elements.password.value });
      if (failed) throw failed;
      await sessionChanged(data.session);
      if (state) {
        const then = after;
        dialog.close();
        then?.();
      }
    } catch (e) {
      error.textContent = e.status === 400 ? '密码错误' : e.status === 429 ? '尝试过多，请稍后再试' : '网络错误';
    } finally { busy = false; submit.disabled = false; }
  });
  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try { await signOut(); dialog.close(); }
    catch (_) { q('[data-account-error]').textContent = '退出未完成，请检查网络后重试。'; }
    finally { signOutButton.disabled = false; }
  });

  window.ForeverAuth = {
    get client() { return client; },
    get state() { return state; },
    // fn(state, reason): state is null or {user, name}; reason is init | signin | signout | expired | error.
    onChange(fn) {
      listeners.add(fn);
      if (resolved) fn(state, 'init');
      return () => listeners.delete(fn);
    },
    open,
    signOut,
  };

  if (!window.supabase || !config?.url || !config?.publishableKey) {
    error.textContent = '登录服务加载失败，请刷新页面重试。';
    submit.disabled = true;
    emit('error');
    return;
  }
  // Bound requests, including auth, so a broken connection never leaves the UI stuck.
  const boundedFetch = async (url, options = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    // Photo transfer can take longer on mobile networks; other requests remain bounded at 15s.
    const timer = setTimeout(abort, String(url).includes('/storage/v1/object') ? 120000 : 15000);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  };
  client = window.supabase.createClient(config.url, config.publishableKey, {
    // Storage key unchanged, so sessions signed in through the old chat panel carry over.
    auth: { storageKey: 'foreveru-chat-auth-fnrdwhbxrdakakwvgvyk', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: boundedFetch }
  });
  render();
  client.auth.onAuthStateChange((_event, session) => {
    // Do not await another auth operation inside Supabase's auth-lock callback.
    setTimeout(() => sessionChanged(session).catch(() => { error.textContent = '暂时无法验证身份，请稍后重试。'; }), 0);
  });
  window.addEventListener('online', () => {
    if (activeId === undefined && resolved) client.auth.getSession().then(r => sessionChanged(r.data.session));
  });
})();
