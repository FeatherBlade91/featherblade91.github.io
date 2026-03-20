const state = { data: null, view: 'ideas', workspace: [], dragId: null };
const viewMeta = {
  ideas: ['Daily Ideas', '按卡片浏览每日灵感，不做时间轴，只保留时间标签。'],
  crosslinks: ['Crosslinks', '像桥梁一样浏览非显然连接，适合头脑风暴与二次组合。'],
  concepts: ['Concept Lines', '长期研究主线，作为全站骨架。']
};

const els = {
  grid: document.getElementById('cardGrid'), detail: document.getElementById('detailBody'), stats: document.getElementById('stats'),
  title: document.getElementById('viewTitle'), desc: document.getElementById('viewDesc'), search: document.getElementById('searchInput'),
  category: document.getElementById('categoryFilter'), sort: document.getElementById('dateSort'), workspaceList: document.getElementById('workspaceList'),
  workspaceDrop: document.getElementById('workspaceDrop'), template: document.getElementById('cardTemplate')
};

fetch('./data/atlas.json').then(r => r.json()).then(data => { state.data = data; bind(); render(); });

function bind() {
  document.querySelectorAll('.seg').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    state.view = btn.dataset.view; render();
  }));
  [els.search, els.category, els.sort].forEach(el => el.addEventListener('input', render));
  els.workspaceDrop.addEventListener('dragover', e => e.preventDefault());
  els.workspaceDrop.addEventListener('drop', e => { e.preventDefault(); if (state.dragId) addToWorkspace(state.dragId); });
}

function currentItems() {
  let items = state.data[state.view];
  const q = els.search.value.trim().toLowerCase();
  const cat = els.category.value;
  if (state.view === 'concepts') items = items.map(x => ({...x, date:'长期', category:'主线', snippet: x.body.slice(0,180)}));
  if (state.view === 'crosslinks') items = items.map(x => ({...x, category:'crosslink', snippet: x.deep || x.contrast, tags: extractTags(x.title + ' ' + x.a_b)}));
  items = items.filter(x => {
    const hay = JSON.stringify(x).toLowerCase();
    return (!q || hay.includes(q)) && (!cat || x.category === cat);
  });
  items.sort((a,b)=> els.sort.value==='asc' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date)));
  return items;
}

function render() {
  const [t,d] = viewMeta[state.view]; els.title.textContent = t; els.desc.textContent = d;
  const items = currentItems(); els.stats.textContent = `${items.length} 条`;
  els.grid.innerHTML = '';
  items.forEach(item => els.grid.appendChild(makeCard(item)));
  renderWorkspace();
}

function makeCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  node.querySelector('.type').textContent = item.category || '条目';
  node.querySelector('.date').textContent = item.date || '未标注';
  node.querySelector('.title').textContent = item.title;
  node.querySelector('.snippet').textContent = item.snippet || item.value || item.deep || '';
  const tags = node.querySelector('.tags');
  (item.tags || []).slice(0,5).forEach(t => { const s = document.createElement('span'); s.className='tag'; s.textContent=t; tags.appendChild(s);});
  node.querySelector('.detail-btn').addEventListener('click', () => showDetail(item));
  node.querySelector('.add-btn').addEventListener('click', () => addToWorkspace(keyOf(item), item));
  node.addEventListener('dragstart', ()=> state.dragId = keyOf(item));
  return node;
}

function showDetail(item) {
  let txt = `${item.title}\n\n时间：${item.date || '长期'}\n分类：${item.category || '条目'}\n`;
  if (item.sources) txt += `\n来源：\n- ${item.sources.join('\n- ')}\n`;
  if (item.value) txt += `\n价值：\n${item.value}\n`;
  if (item.next) txt += `\n下一步：\n${item.next}\n`;
  if (item.a_b) txt += `\nA / B 两端：\n${item.a_b}\n`;
  if (item.contrast) txt += `\n表面无关：\n${item.contrast}\n`;
  if (item.deep) txt += `\n深层连接点：\n${item.deep}\n`;
  if (item.failure) txt += `\n类比失效点：\n${item.failure}\n`;
  if (item.outputs) txt += `\n新产物：\n${item.outputs}\n`;
  if (item.body && state.view === 'concepts') txt += `\n全文：\n${item.body}`;
  els.detail.textContent = txt;
}

function keyOf(item){ return `${item.date || 'na'}::${item.title}`; }
function addToWorkspace(id, itemObj) {
  const all = [...(state.data.ideas||[]), ...(state.data.crosslinks||[]), ...(state.data.concepts||[])].map(x => ({...x, category:x.category||'主线'}));
  const item = itemObj || all.find(x => keyOf(x)===id || `${x.date||'na'}::${x.title}`===id);
  if (!item) return;
  if (!state.workspace.find(x => keyOf(x)===keyOf(item))) state.workspace.push(item);
  renderWorkspace();
}
function renderWorkspace() {
  els.workspaceList.innerHTML='';
  state.workspace.forEach((item, idx) => {
    const div = document.createElement('div'); div.className='workspace-item'; div.draggable=true;
    div.innerHTML = `<strong>${item.title}</strong><div class="small">${item.date || '长期'} · ${item.category || '条目'}</div>`;
    div.addEventListener('click', ()=>showDetail(item));
    div.addEventListener('dragstart', ()=> state.dragId = `ws-${idx}`);
    div.addEventListener('dragover', e=> e.preventDefault());
    div.addEventListener('drop', e => {
      e.preventDefault();
      const from = Number((state.dragId||'').replace('ws-',''));
      if (Number.isNaN(from)) return;
      const [m] = state.workspace.splice(from,1);
      state.workspace.splice(idx,0,m);
      renderWorkspace();
    });
    els.workspaceList.appendChild(div);
  });
}
function extractTags(s){ return [...new Set((s.match(/[A-Za-z]{4,}|[\u4e00-\u9fff]{2,6}/g)||[]))].slice(0,8); }
