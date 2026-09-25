/* Persistent, member-only text chat. Supabase RLS is the authority for access. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(['Toggle','Dialog','Close','Status','Logout','Login','Password',
    'LoginError','LoginButton','Conversation','Scroll','History','Empty','Messages','New',
    'SyncError','Compose','Input','Counter','Send','Badge'].map(k => [k, byId('chat' + k)]));
  const config = window.FOREVER_CHAT_CONFIG;
  let client, user = null, member = null, channel = null, epoch = 0, activeId = null;
  let rows = new Map(), unread = 0, watermark = 0, ready = false, loading = false;
  let syncing = false, syncAgain = false, paging = false, realtime = false;
  const table = 'forever_chat_messages';
  const pageSize = 60;
  const columns = 'seq,id,sender_id,body,created_at';
  const mobile = matchMedia('(pointer: coarse)').matches;

  function status(text, state = '') {
    ui.Status.textContent = text;
    ui.Status.dataset.state = state;
  }
  function atBottom() { return ui.Scroll.scrollHeight - ui.Scroll.scrollTop - ui.Scroll.clientHeight < 80; }
  function clearUnread() {
    unread = 0;
    ui.Badge.hidden = true;
    ui.New.hidden = true;
    ui.Toggle.setAttribute('aria-label', '打开二人对话');
  }
  function bottom() { ui.Scroll.scrollTop = ui.Scroll.scrollHeight; clearUnread(); }
  function updateComposer() {
    ui.Send.disabled = !user || !ready || !ui.Input.value.trim() || ui.Input.value.length > 2000;
    const n = ui.Input.value.length;
    ui.Counter.textContent = n > 1600 ? `${n} / 2000` : mobile ? '写好后，轻点发送' : 'Enter 发送 · Shift + Enter 换行';
  }
  function pendingKey() { return 'foreveru-chat-pending:' + user.id; }
  function savePending() {
    if (!user) return;
    try {
      sessionStorage.setItem(pendingKey(), JSON.stringify([...rows.values()].filter(r => !r.seq)));
    } catch (_) { /* A storage restriction must not stop chatting. */ }
  }
  function restorePending() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()) || '[]');
      for (const row of saved) {
        if (row.sender_id === user.id && typeof row.body === 'string' && row.body.trim() && row.body.length <= 2000 && typeof row.id === 'string') {
          rows.set(row.id, { ...row, seq: null, delivery: 'failed' });
        }
      }
    } catch (_) { /* Ignore malformed local drafts. */ }
  }
  function node(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function render(forceBottom = false) {
    const stick = forceBottom || atBottom();
    const sorted = [...rows.values()].sort((a,b) => {
      if (a.seq && b.seq) return a.seq - b.seq;
      if (a.seq) return -1;
      if (b.seq) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
    const frag = document.createDocumentFragment();
    let day = '';
    for (const row of sorted) {
      const date = new Date(row.created_at);
      const stamp = date.toLocaleDateString('zh-CN', { month:'long', day:'numeric', year:'numeric' });
      if (day !== stamp) { frag.append(node('div','chat-day',stamp)); day = stamp; }
      const mine = row.sender_id === user?.id;
      const article = node('article','chat-message' + (mine ? ' mine' : ''));
      article.dataset.messageId = row.id;
      const name = mine ? member?.name : member?.name === 'LYK' ? 'DMY' : 'LYK';
      const meta = node('div','chat-message-meta');
      meta.append(node('span','',name || '我'), node('time','',date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})));
      article.append(meta,node('div','chat-bubble',row.body));
      if (mine) {
        if (row.delivery === 'failed') {
          const retry = node('button','chat-retry','未发送 · 点此重试');
          retry.type = 'button';
          retry.addEventListener('click', () => send(row));
          article.append(retry);
        } else article.append(node('span','chat-delivery',row.seq ? '已发送' : '发送中…'));
      }
      frag.append(article);
    }
    ui.Messages.replaceChildren(frag);
    ui.Empty.hidden = rows.size > 0 || !ready;
    if (stick) ui.Scroll.scrollTop = ui.Scroll.scrollHeight;
  }
  function merge(data, notify = false) {
    const wasBottom = atBottom();
    let changed = false;
    for (const row of data) {
      const previous = rows.get(row.id);
      const isNew = !previous;
      if (previous?.seq === row.seq && !previous?.delivery) continue;
      rows.set(row.id, row);
      changed = true;
      if (notify && isNew && row.sender_id !== user?.id && (!ui.Dialog.open || document.hidden || !wasBottom)) {
        unread++;
      }
    }
    if (changed) { savePending(); render(); }
    if (unread) {
      ui.Badge.textContent = unread > 99 ? '99+' : String(unread);
      ui.Badge.hidden = false;
      ui.Toggle.setAttribute('aria-label', `打开二人对话，${unread} 条未读消息`);
      ui.New.hidden = !ui.Dialog.open;
    }
  }
  function connectionStatus() {
    if (!user || !member) return;
    if (!navigator.onLine) status('网络已断开 · 恢复后继续同步', 'offline');
    else if (realtime) status(`${member.name} · 实时已连接`, 'connected');
    else status('正在重连 · 消息会自动补收', 'offline');
  }
  async function sync() {
    if (!user || !member) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    const current = epoch;
    try {
      if (!ready) {
        const { data, error } = await client.from(table).select(columns).order('seq', {ascending:false}).limit(pageSize);
        if (error) throw error;
        if (current !== epoch) return;
        merge(data);
        watermark = data.reduce((n,r) => Math.max(n,r.seq),0);
        ready = true;
        ui.History.hidden = data.length < pageSize;
        render(true);
      } else {
        // Keep the fetch cursor separate from live events: receiving a newer event
        // must not skip older messages missed during a disconnection.
        let more = true;
        while (more) {
          const { data, error } = await client.from(table).select(columns).gt('seq',watermark).order('seq').limit(200);
          if (error) throw error;
          if (current !== epoch) return;
          merge(data,true);
          if (data.length) watermark = Math.max(watermark,...data.map(r=>r.seq));
          more = data.length === 200;
        }
        // Overlap catches late-committing transactions and confirms pending retries.
        const { data, error } = await client.from(table).select(columns).order('seq',{ascending:false}).limit(pageSize);
        if (error) throw error;
        if (current !== epoch) return;
        merge(data,true);
      }
      ui.SyncError.textContent = '';
      connectionStatus();
      updateComposer();
    } catch (_) {
      if (current !== epoch) return;
      ui.SyncError.textContent = navigator.onLine ? '消息暂时没有同步成功，正在自动重试。' : '网络已断开，已写好的内容会保留。';
      status('等待同步 · 稍后自动重试','offline');
    } finally {
      if (current === epoch) {
        syncing = false;
        if (syncAgain) { syncAgain = false; setTimeout(sync,0); }
      }
    }
  }
  async function history() {
    if (paging || !ready) return;
    paging = true;
    ui.History.disabled = true;
    ui.History.textContent = '正在翻阅…';
    const current = epoch;
    const oldHeight = ui.Scroll.scrollHeight;
    const oldTop = ui.Scroll.scrollTop;
    const first = Math.min(...[...rows.values()].filter(r=>r.seq).map(r=>r.seq));
    try {
      const {data,error} = await client.from(table).select(columns).lt('seq',first).order('seq',{ascending:false}).limit(pageSize);
      if (error) throw error;
      if (current !== epoch) return;
      merge(data);
      ui.History.hidden = data.length < pageSize;
      ui.Scroll.scrollTop = oldTop + ui.Scroll.scrollHeight - oldHeight;
      ui.SyncError.textContent = '';
    } catch (_) {
      if (current === epoch) ui.SyncError.textContent = '更早的消息暂时未能加载，请再试一次。';
    } finally {
      if (current === epoch) {
        paging = false;
        ui.History.disabled = false;
        ui.History.textContent = '查看更早的消息';
      }
    }
  }
  async function send(row) {
    if (!user || row.sender_id !== user.id || row.delivery === 'sending' || rows.get(row.id)?.seq) return;
    const current = epoch;
    row.delivery = 'sending';
    rows.set(row.id,row);
    savePending();
    render(true);
    try {
      if (!navigator.onLine) throw new Error('offline');
      const { data, error } = await client.from(table).insert({id:row.id,sender_id:user.id,body:row.body}).select(columns).single();
      if (current !== epoch) return;
      if (error) {
        // A timed-out request may already have committed. Reusing the UUID makes
        // retries idempotent and cannot duplicate the message.
        const existing = await client.from(table).select(columns).eq('id',row.id).maybeSingle();
        if (current !== epoch) return;
        if (existing.error || !existing.data) throw error;
        merge([existing.data]);
      } else merge([data]);
      ui.SyncError.textContent = '';
    } catch (_) {
      if (current !== epoch || rows.get(row.id)?.seq) return;
      row.delivery = 'failed';
      rows.set(row.id,row);
      savePending();
      render();
    }
  }
  async function sessionChanged(session) {
    const id = session?.user?.id || null;
    if (id === activeId) return;
    activeId = id;
    const current = ++epoch;
    const oldChannel = channel;
    channel = null;
    if (oldChannel) client.removeChannel(oldChannel);
    user = session?.user || null;
    member = null;
    rows = new Map();
    ready = false; realtime = false; syncing = false; syncAgain = false; paging = false; watermark = 0;
    clearUnread();
    ui.Messages.replaceChildren();
    ui.Input.value = '';
    ui.SyncError.textContent = '';
    ui.Conversation.hidden = true;
    ui.Login.hidden = false;
    ui.Logout.hidden = true;
    updateComposer();
    if (!user) { status('只属于我们的聊天角落'); return; }
    status('正在打开我们的对话…');
    const {data,error} = await client.from('forever_chat_members').select('name').eq('user_id',user.id).maybeSingle();
    if (current !== epoch) return;
    if (error || !data) {
      ui.LoginError.textContent = error ? '暂时无法验证身份，请稍后重新登录。' : '这个账号还不是对话成员。';
      await client.auth.signOut({scope:'local'});
      return;
    }
    member = data;
    restorePending();
    ui.Login.hidden = true;
    ui.Conversation.hidden = false;
    ui.Conversation.dataset.identity = member.name;
    ui.Logout.hidden = false;
    ui.Logout.textContent = '退出 ' + member.name;
    ui.Password.value = '';
    channel = client.channel('foreveru-chat-' + user.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table}, payload => {
        if (current === epoch) merge([payload.new],true);
      })
      .subscribe(state => {
        if (current !== epoch) return;
        realtime = state === 'SUBSCRIBED';
        connectionStatus();
        if (realtime) sync();
      });
    await sync();
  }

  ui.Toggle.addEventListener('click',() => {
    ui.Dialog.showModal();
    ui.Toggle.setAttribute('aria-expanded','true');
    bottom();
    if (user) { sync(); if (!mobile) ui.Input.focus(); }
  });
  ui.Close.addEventListener('click',()=>ui.Dialog.close());
  ui.Dialog.addEventListener('close',()=>{
    ui.Toggle.setAttribute('aria-expanded','false');
    ui.Toggle.focus();
  });
  ui.Dialog.addEventListener('click',event=>{
    const box = ui.Dialog.getBoundingClientRect();
    if (event.target === ui.Dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) ui.Dialog.close();
  });
  ui.New.addEventListener('click',bottom);
  ui.Scroll.addEventListener('scroll',()=>{if (ui.Dialog.open && !document.hidden && atBottom()) clearUnread();});
  ui.History.addEventListener('click',history);
  ui.Input.addEventListener('input',updateComposer);
  ui.Input.addEventListener('keydown',event=>{
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !mobile) {
      event.preventDefault();
      ui.Compose.requestSubmit();
    }
  });
  ui.Compose.addEventListener('submit',event=>{
    event.preventDefault();
    const body = ui.Input.value.trim();
    if (!user || !ready || !body || body.length > 2000) return;
    const row = {id:crypto.randomUUID(),sender_id:user.id,body,created_at:new Date().toISOString(),delivery:'queued'};
    ui.Input.value = '';
    updateComposer();
    send(row);
    ui.Input.focus();
  });
  ui.Login.addEventListener('submit',async event=>{
    event.preventDefault();
    if (loading || !client) return;
    loading = true;
    ui.LoginButton.disabled = true;
    ui.LoginError.textContent = '';
    const name = new FormData(ui.Login).get('identity');
    try {
      const {data,error} = await client.auth.signInWithPassword({email:config.accounts[name],password:ui.Password.value});
      if (error) throw error;
      await sessionChanged(data.session);
    } catch (error) {
      ui.LoginError.textContent = error.status === 400 ? '身份或密码不对，再检查一下吧。' : error.status === 429 ? '尝试次数有点多，请稍后再试。' : '暂时连接不上，请检查网络后重试。';
    } finally { loading = false; ui.LoginButton.disabled = false; }
  });
  ui.Logout.addEventListener('click',async()=>{
    ui.Logout.disabled = true;
    try {
      if (user) { try { sessionStorage.removeItem(pendingKey()); } catch (_) {} }
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) throw error;
      await sessionChanged(null);
    } catch (_) { ui.SyncError.textContent = '退出未完成，请检查网络后重试。'; }
    finally { ui.Logout.disabled = false; }
  });
  window.addEventListener('online',()=>{connectionStatus();sync();});
  window.addEventListener('offline',connectionStatus);
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden && user) { sync(); if (ui.Dialog.open && atBottom()) clearUnread(); }
  });

  if (!window.supabase || !config?.url || !config?.publishableKey) {
    status('对话暂时无法连接','offline');
    ui.LoginError.textContent = '聊天组件加载失败，请刷新页面重试。';
    ui.LoginButton.disabled = true;
    return;
  }
  // Bound requests, including auth, so a broken connection never leaves the UI stuck.
  const boundedFetch = async (url,options = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort,15000);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    try { return await fetch(url,{...options,signal:controller.signal}); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort',abort); }
  };
  client = window.supabase.createClient(config.url,config.publishableKey,{
    auth:{storageKey:'foreveru-chat-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
    global:{fetch:boundedFetch}
  });
  client.auth.onAuthStateChange((_event,session)=>{
    // Do not await another auth operation inside Supabase's auth-lock callback.
    setTimeout(()=>sessionChanged(session).catch(()=>status('暂时无法连接，请刷新重试','offline')),0);
  });
  setInterval(()=>{if (user && !document.hidden) sync();},30000);
  updateComposer();
})();
