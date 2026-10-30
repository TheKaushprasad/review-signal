const CATS = ['UI/UX', 'Employee', 'App bug', 'Payment', 'Order/Service', 'Other'];
const SENTI = ['positive', 'neutral', 'negative'];
const SC = { positive: 'pos', neutral: 'neu', negative: 'neg' };
const SL = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let dataset = null;                         // { datasetId, source, reviews, engine }
const filters = { senti: 'all', q: '', sort: 'nps', cat: null, page: 0, needsReview: false };
const PAGE_SIZE = 50;

/* ---------- helpers ---------- */
async function api(path, opts = {}) {
  const auth = await authHeader();
  return fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  });
}
let toastTimer;
function toast(msg, isErr) {
  $('#toastMsg').textContent = msg;
  $('#toast').classList.toggle('err', !!isErr);
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2100);
}
function showLoading(msg) { $('#loadingMsg').textContent = msg; $('#loading').hidden = false; }
function hideLoading() { $('#loading').hidden = true; }
function stars(n) {
  let o = '';
  for (let i = 1; i <= 5; i++) o += `<span class="${i <= n ? '' : 'off'}">★</span>`;
  return `<span class="stars" title="${n} / 5">${o}</span>`;
}
function npsColor(n) {
  if (n >= 4) return ['var(--neg-soft)', 'var(--neg)'];
  if (n === 3) return ['var(--neu-soft)', 'var(--neu)'];
  return ['var(--pos-soft)', 'var(--pos)'];
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- config + auth ---------- */
let supa = null;       // Supabase client (null when accounts are disabled)
let authUser = null;   // current signed-in user, or null

async function boot() {
  let cfg;
  try { cfg = await api('/config'); }
  catch { cfg = { engine: 'mock', sheetsEnabled: false, supabase: { enabled: false } }; }

  const label = cfg.engine === 'jev' ? 'Jev · TypeSafe AI' : 'a built-in offline classifier';
  $('#engineName').textContent = label;
  $('#engineTag').textContent = cfg.engine === 'jev' ? 'Jev' : 'Mock engine';
  await initAuth(cfg.supabase);
}

async function initAuth(sb) {
  if (!sb || !sb.enabled || !window.supabase) { updateAuthUI(); return; }
  supa = window.supabase.createClient(sb.url, sb.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  supa.auth.onAuthStateChange((_e, session) => { authUser = session?.user || null; updateAuthUI(); });
  const { data } = await supa.auth.getSession();
  authUser = data?.session?.user || null;
  updateAuthUI();
}

async function authHeader() {
  if (!supa) return {};
  const { data } = await supa.auth.getSession();
  const t = data?.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function updateAuthUI() {
  const available = Boolean(supa);
  const signedIn = Boolean(authUser);
  $('#signInBtn').hidden = !available || signedIn;
  $('#userChip').hidden = !signedIn;
  $('#myDataBtn').hidden = !signedIn;
  if (signedIn) $('#userEmail').textContent = authUser.email || 'Account';
}

/* auth modal */
let authMode = 'signin';
function openAuth() { $('#authModal').hidden = false; setAuthMode('signin'); authFeedback(''); }
function closeAuth() { $('#authModal').hidden = true; }
function setAuthMode(m) {
  authMode = m;
  $('#authTitle').textContent = m === 'signin' ? 'Sign in' : 'Create account';
  $('#authSubmit').textContent = m === 'signin' ? 'Sign in' : 'Sign up';
  $('#authSwitchText').textContent = m === 'signin' ? 'New here?' : 'Already have an account?';
  $('#authSwitch').textContent = m === 'signin' ? 'Create an account' : 'Sign in';
}
function authFeedback(msg, ok) {
  const el = $('#authMsg'); el.hidden = !msg; el.textContent = msg || '';
  el.className = 'feedback ' + (ok ? 'ok' : 'err');
}
async function submitAuth(e) {
  e.preventDefault();
  if (!supa) return;
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  authFeedback(''); $('#authSubmit').disabled = true;
  try {
    if (authMode === 'signin') {
      const { error } = await supa.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      closeAuth(); toast('Signed in');
    } else {
      const { data, error } = await supa.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (data.session) { closeAuth(); toast('Account created'); }
      else authFeedback('Account created — check your email to confirm, then sign in.', true);
    }
  } catch (err) { authFeedback(err.message || 'Authentication failed.', false); }
  finally { $('#authSubmit').disabled = false; }
}
async function signOut() {
  if (!supa) return;
  await supa.auth.signOut();
  toast('Signed out');
}

/* my datasets */
async function openMyData() {
  $('#dataModal').hidden = false;
  const list = $('#dataList');
  list.innerHTML = '<p class="dm-empty">Loading…</p>';
  try {
    const { datasets } = await api('/my/datasets');
    if (!datasets.length) { list.innerHTML = '<p class="dm-empty">No saved datasets yet. Classify something while signed in and it shows up here.</p>'; return; }
    list.innerHTML = datasets.map(d => `
      <div class="data-item" data-id="${d.id}">
        <div class="di-main"><b>${esc(d.name)}</b><small>${d.reviewCount} reviews · ${new Date(d.createdAt).toLocaleDateString()} ${new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
        <button class="di-del" data-del="${d.id}" type="button" aria-label="Delete">✕</button>
      </div>`).join('');
  } catch (err) { list.innerHTML = `<p class="feedback err" style="margin:10px 0">${esc(err.message)}</p>`; }
}
function closeMyData() { $('#dataModal').hidden = true; }
async function openSavedDataset(id) {
  closeMyData(); showLoading('Loading dataset…');
  try { openDashboard(await api('/datasets/' + id)); }
  catch (err) { toast(err.message, true); }
  finally { hideLoading(); }
}
async function deleteSavedDataset(id, el) {
  try { await api('/my/datasets/' + id, { method: 'DELETE' }); el.remove(); toast('Dataset deleted'); }
  catch (err) { toast(err.message, true); }
}

function wireAuth() {
  $('#signInBtn').addEventListener('click', openAuth);
  $('#authClose').addEventListener('click', closeAuth);
  $('#authModal').addEventListener('click', e => { if (e.target.id === 'authModal') closeAuth(); });
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authSwitch').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
  $('#signOutBtn').addEventListener('click', signOut);
  $('#myDataBtn').addEventListener('click', openMyData);
  $('#dataClose').addEventListener('click', closeMyData);
  $('#dataModal').addEventListener('click', e => { if (e.target.id === 'dataModal') closeMyData(); });
  $('#dataList').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteSavedDataset(del.dataset.del, del.closest('.data-item')); return; }
    const item = e.target.closest('.data-item');
    if (item) openSavedDataset(item.dataset.id);
  });
}

/* ---------- connect view (CSV upload) ---------- */
function wireConnect() {
  const drop = $('#drop'), fileInput = $('#fileInput');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) ingestFile(fileInput.files[0]); });
  ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) ingestFile(f); });

  $('#sampleBtn').addEventListener('click', loadSample);
}

function connectMsg(msg, ok) {
  const el = $('#connectMsg');
  el.hidden = !msg; el.textContent = msg || '';
  el.className = 'feedback ' + (ok ? 'ok' : 'err');
}

function ingestFile(file) {
  const reader = new FileReader();
  reader.onload = () => ingestCSV(reader.result, file.name);
  reader.onerror = () => connectMsg('Could not read that file.', false);
  reader.readAsText(file);
}

// Read → classify in small batches (with progress) → commit. Keeping each
// request small is what lets large sheets work on serverless hosts.
async function runPipeline(prepareBody) {
  showLoading('Reading…');
  const prep = await api('/datasets/prepare', { method: 'POST', body: JSON.stringify(prepareBody) });
  const all = prep.reviews, N = all.length, BATCH = 20, CONCURRENCY = 3;

  // Split into batches and process a few in parallel — faster on big sheets,
  // while each request stays small enough to never hit a serverless timeout.
  const batches = [];
  for (let i = 0; i < N; i += BATCH) batches.push({ idx: batches.length, slice: all.slice(i, i + BATCH) });
  const results = new Array(batches.length);
  let done = 0;
  async function worker(queue) {
    for (const b of queue) {
      const r = await api('/classify', { method: 'POST', body: JSON.stringify({ reviews: b.slice }) });
      results[b.idx] = r.reviews;
      done += b.slice.length;
      showLoading(`Classifying… ${Math.min(done, N)} / ${N}`);
    }
  }
  const queues = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => []);
  batches.forEach((b, i) => queues[i % queues.length].push(b));
  await Promise.all(queues.map(worker));
  const classified = results.flat();

  showLoading(prepareBody.writeBack ? 'Saving + writing to sheet…' : 'Saving…');
  return api('/datasets/commit', {
    method: 'POST',
    body: JSON.stringify({ name: prep.name, source: prep.source, reviews: classified, writeBack: prepareBody.writeBack }),
  });
}

async function ingestCSV(content, filename) {
  connectMsg('', true);
  showLoading('Reading CSV…');
  try {
    openDashboard(await runPipeline({ kind: 'csv', content, filename }));
  } catch (err) { connectMsg(err.message, false); }
  finally { hideLoading(); }
}

async function loadSample() {
  showLoading('Loading sample…');
  try {
    const content = await fetch('sample-reviews.csv').then(r => r.text());
    await ingestCSV(content, 'Sample app reviews');
  } catch (err) { connectMsg('Could not load the sample dataset.', false); hideLoading(); }
}

/* ---------- dashboard ---------- */
function openDashboard(data) {
  dataset = data;
  $('#connectView').hidden = true;
  $('#dashView').hidden = false;
  $('#newBtn').hidden = false;
  const chip = $('#sourceChip');
  chip.hidden = false;
  $('#sourceName').textContent = `${data.name} · ${data.reviews.length} reviews`;
  $('#syncAllBtn').hidden = data.source.type !== 'sheet';
  const sub = data.source.type === 'sheet'
    ? `${data.reviews.length} reviews classified from your Google Sheet. Edits sync back to column "${data.source.textColumn}"'s neighbours.`
    : `${data.reviews.length} reviews classified from ${esc(data.name)}. Edit any chip — corrections update the metrics and the export.`;
  $('#dashSubtitle').textContent = sub + (data.persisted ? ' · saved to your account' : '');
  if (data.saveError) toast('Classified, but saving to your account failed: ' + data.saveError, true);
  renderAll();
}

function renderAll() { renderTiles(); renderCats(); renderNps(); renderTrends(); renderStats(); renderRows(); }

// Low-confidence queue count + how much the user has had to correct the AI.
function renderStats() {
  const rs = dataset.reviews;
  const nr = rs.filter(r => r.likeliness <= 2).length;
  const edited = rs.filter(r => r.edited).length;
  const agree = rs.length ? Math.round((rs.length - edited) / rs.length * 100) : 100;
  const nrc = $('#nrCount'); if (nrc) nrc.textContent = nr;
  const btn = $('#needsReviewBtn');
  if (btn) { btn.hidden = nr === 0 && !filters.needsReview; btn.setAttribute('aria-pressed', String(filters.needsReview)); }
  const ag = $('#agreeStat');
  if (ag) ag.textContent = edited ? `${agree}% AI agreement · ${edited} edited` : `${agree}% AI agreement`;
}

// Sentiment trend over time (only when reviews carry parseable dates).
function renderTrends() {
  const card = $('#trendsCard'); if (!card) return;
  const score = { positive: 1, neutral: 0, negative: -1 };
  const byDate = new Map();
  for (const r of dataset.reviews) {
    const d = String(r.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(score[r.sentiment] ?? 0);
  }
  const pts = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, arr]) => ({ d, v: arr.reduce((a, b) => a + b, 0) / arr.length }));
  if (pts.length < 2) { card.hidden = true; return; }
  card.hidden = false;
  const W = 280, Hh = 72, pad = 6;
  const x = i => pad + i * (W - 2 * pad) / (pts.length - 1);
  const y = v => pad + (1 - (v + 1) / 2) * (Hh - 2 * pad);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)} ` +
    pts.map((p, i) => `L${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ') +
    ` L${x(pts.length - 1).toFixed(1)},${Hh - pad} L${x(0).toFixed(1)},${Hh - pad} Z`;
  $('#trendsBody').innerHTML = `
    <svg viewBox="0 0 ${W} ${Hh}" width="100%" preserveAspectRatio="none" style="display:block;height:72px">
      <line x1="${pad}" y1="${y(0).toFixed(1)}" x2="${W - pad}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <path d="${area}" fill="var(--accent-soft)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div class="trend-x"><span>${pts[0].d}</span><span>more positive ↑</span><span>${pts[pts.length - 1].d}</span></div>`;
}

function renderPager(total, start, shown, pages) {
  const el = $('#pager'); if (!el) return;
  if (total <= PAGE_SIZE) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `
    <button class="pg" id="pgPrev" type="button" ${filters.page === 0 ? 'disabled' : ''}>‹ Prev</button>
    <span class="pg-info">${start + 1}–${start + shown} of ${total}</span>
    <button class="pg" id="pgNext" type="button" ${filters.page >= pages - 1 ? 'disabled' : ''}>Next ›</button>`;
}

function renderTiles() {
  const rs = dataset.reviews, total = rs.length || 1;
  const c = s => rs.filter(r => r.sentiment === s).length;
  const pos = c('positive'), neu = c('neutral'), neg = c('negative');
  const pct = n => Math.round(n / total * 100);
  const avg = k => (rs.reduce((a, r) => a + r[k], 0) / total).toFixed(1);
  $('#tiles').innerHTML = `
    <div class="tile"><div class="k">Reviews</div><div class="v mono">${rs.length}</div><div class="sub">classified</div></div>
    <div class="tile"><div class="k">Sentiment</div><div class="v mono">${pct(pos)}<small>% pos</small></div>
      <div class="senti-split" title="${pos} positive · ${neu} neutral · ${neg} negative">
        <span style="width:${pct(pos)}%;background:var(--pos)"></span>
        <span style="width:${pct(neu)}%;background:var(--neu)"></span>
        <span style="width:${pct(neg)}%;background:var(--neg)"></span></div></div>
    <div class="tile"><div class="k">Avg likeliness</div><div class="v mono">${avg('likeliness')}<small> / 5</small></div><div class="sub">classifier confidence</div></div>
    <div class="tile"><div class="k">Avg NPS impact</div><div class="v mono">${avg('nps')}<small> / 5</small></div><div class="sub">higher = more harmful</div></div>`;
}

function renderCats() {
  const rs = dataset.reviews;
  const counts = CATS.map(cat => ({ cat, n: rs.filter(r => r.category === cat).length }));
  const max = Math.max(1, ...counts.map(x => x.n));
  $('#catPanel').innerHTML = counts.map(({ cat, n }) => `
    <div class="catrow" data-cat="${esc(cat)}" data-active="${filters.cat === cat ? 1 : 0}" role="button" tabindex="0" aria-pressed="${filters.cat === cat}">
      <div class="top"><span class="n"><b>${cat}</b></span><span class="c">${n}</span></div>
      <div class="track"><i style="width:${n / max * 100}%"></i></div>
    </div>`).join('');
}

function renderNps() {
  const rs = dataset.reviews;
  const rows = CATS.map(cat => {
    const xs = rs.filter(r => r.category === cat);
    return { cat, avg: xs.length ? xs.reduce((a, r) => a + r.nps, 0) / xs.length : 0 };
  }).filter(x => x.avg > 0).sort((a, b) => b.avg - a.avg);
  const overall = (rs.reduce((a, r) => a + r.nps, 0) / (rs.length || 1)).toFixed(1);
  $('#npsPanel').innerHTML = `
    <div class="lead"><span class="big mono">${overall}</span><span class="scale">/ 5 avg</span>
      <span class="label">Top drivers<br>${rows.slice(0, 3).map(r => r.cat).join(' · ') || '—'}</span></div>
    ${rows.map(r => `<div class="npsrow"><span class="nm">${r.cat}</span>
      <span class="bar"><i style="width:${r.avg / 5 * 100}%"></i></span>
      <span class="sc mono">${r.avg.toFixed(1)}</span></div>`).join('')}`;
}

function visible() {
  let out = dataset.reviews.filter(r => {
    if (filters.senti !== 'all' && r.sentiment !== filters.senti) return false;
    if (filters.cat && r.category !== filters.cat) return false;
    if (filters.needsReview && r.likeliness > 2) return false;
    if (filters.q && !((r.text + ' ' + r.author).toLowerCase().includes(filters.q))) return false;
    return true;
  });
  const by = {
    nps: (a, b) => b.nps - a.nps,
    like: (a, b) => b.likeliness - a.likeliness,
    recent: (a, b) => String(b.date).localeCompare(String(a.date)),
  };
  return out.sort(by[filters.sort]);
}

function sentiSelect(r) {
  const opts = SENTI.map(s => `<option value="${s}" ${s === r.sentiment ? 'selected' : ''}>${SL[s]}</option>`).join('');
  return `<span class="chip ${SC[r.sentiment]}">${SL[r.sentiment]}<select data-id="${r.id}" data-field="sentiment" aria-label="Edit sentiment">${opts}</select></span>`;
}
function catSelect(r) {
  const opts = CATS.map(c => `<option value="${esc(c)}" ${c === r.category ? 'selected' : ''}>${c}</option>`).join('');
  return `<span class="chip cat">${esc(r.category)}<select data-id="${r.id}" data-field="category" aria-label="Edit category">${opts}</select></span>`;
}

function renderRows() {
  const rows = visible();
  $('#empty').hidden = rows.length > 0;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (filters.page >= pages) filters.page = pages - 1;
  if (filters.page < 0) filters.page = 0;
  const start = filters.page * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  $('#rows').innerHTML = pageRows.map(r => {
    const [bg, fg] = npsColor(r.nps);
    const ed = r.edited ? `<div class="edited" data-id="${r.id}">● edited${dataset.source.type === 'sheet' ? ' · synced' : ''}</div>` : '';
    return `<tr>
      <td class="c-review rv"><div class="txt">${esc(r.text)}</div>
        <div class="meta">${r.author ? '@' + esc(r.author) : ''}${r.author && r.date ? ' · ' : ''}${esc(r.date)}</div>${ed}</td>
      <td>${sentiSelect(r)}</td>
      <td>${catSelect(r)}</td>
      <td>${stars(r.likeliness)}</td>
      <td><span class="npsflag mono" style="background:${bg};color:${fg}">${r.nps}</span></td>
    </tr>`;
  }).join('');
  renderPager(rows.length, start, pageRows.length, pages);
}

/* ---------- edits ---------- */
async function onEdit(id, field, value) {
  const r = dataset.reviews.find(x => x.id === id);
  if (!r) return;
  r[field] = value; r.edited = true;
  renderAll();

  // A guest CSV dataset needs no server round-trip — the client is the source
  // of truth and export is client-side. Only hit the server when we must
  // persist (signed in) or write back to a sheet.
  const needsServer = dataset.persisted || dataset.source.type === 'sheet';
  if (!needsServer) { toast(`Saved ${field}`); return; }

  try {
    const res = await api(`/datasets/${dataset.datasetId}/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value, source: dataset.source, review: r }),
    });
    if (res.synced) toast(`Synced ${field} to the sheet`);
    else if (res.syncError) toast(`Saved — sheet sync failed: ${res.syncError}`, true);
    else if (res.saved) toast(`Saved ${field} to your account`);
    else if (res.saveError) toast(`Saved locally — account save failed: ${res.saveError}`, true);
    else toast(`Saved ${field}`);
  } catch (err) { toast(err.message, true); }
}

// Build and download the classified CSV entirely in the browser.
function exportCsv() {
  const q = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const header = ['author', 'date', 'review', 'Sentiment', 'Category', 'Likeliness (1-5)', 'NPS Impact (1-5)'];
  const lines = [header.join(',')];
  for (const r of dataset.reviews) {
    lines.push([r.author, r.date, r.text, r.sentiment, r.category, r.likeliness, r.nps].map(q).join(','));
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'review-signal-export.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireDashboard() {
  $('#rows').addEventListener('change', e => {
    const sel = e.target.closest('select');
    if (sel) onEdit(sel.dataset.id, sel.dataset.field, sel.value);
  });
  $('#sentiSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filters.senti = b.dataset.s; filters.page = 0;
    [...e.currentTarget.children].forEach(x => x.setAttribute('aria-pressed', x === b));
    renderRows();
  });
  $('#searchInput').addEventListener('input', e => { filters.q = e.target.value.toLowerCase().trim(); filters.page = 0; renderRows(); });
  $('#sortSel').addEventListener('change', e => { filters.sort = e.target.value; filters.page = 0; renderRows(); });
  const nrBtn = $('#needsReviewBtn');
  if (nrBtn) nrBtn.addEventListener('click', () => { filters.needsReview = !filters.needsReview; filters.page = 0; renderStats(); renderRows(); });
  const pager = $('#pager');
  if (pager) pager.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'pgPrev') filters.page--; else if (b.id === 'pgNext') filters.page++;
    renderRows();
  });
  const toggleCat = c => { filters.cat = filters.cat === c ? null : c; filters.page = 0; renderCats(); renderRows(); };
  $('#catPanel').addEventListener('click', e => { const row = e.target.closest('.catrow'); if (row) toggleCat(row.dataset.cat); });
  $('#catPanel').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.catrow'); if (row) { e.preventDefault(); toggleCat(row.dataset.cat); }
  });

  $('#exportBtn').addEventListener('click', exportCsv);
  $('#syncAllBtn').addEventListener('click', async () => {
    showLoading('Writing all classifications to the sheet…');
    try {
      const r = await api(`/datasets/${dataset.datasetId}/writeback`, {
        method: 'POST',
        body: JSON.stringify({ source: dataset.source, reviews: dataset.reviews }),
      });
      toast(`Synced ${r.cells} cells to the sheet`);
    }
    catch (err) { toast(err.message, true); }
    finally { hideLoading(); }
  });

  $('#newBtn').addEventListener('click', () => {
    dataset = null;
    $('#dashView').hidden = true; $('#connectView').hidden = false;
    $('#sourceChip').hidden = true; $('#newBtn').hidden = true;
    connectMsg('', true);
  });
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  });
}

boot();
wireConnect();
wireDashboard();
wireAuth();
