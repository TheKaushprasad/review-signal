const CATS = ['UI/UX', 'Employee', 'App bug', 'Payment', 'Order/Service', 'Other'];
const SENTI = ['positive', 'neutral', 'negative'];
const SC = { positive: 'pos', neutral: 'neu', negative: 'neg' };
const SL = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let dataset = null;                         // { datasetId, source, reviews, engine }
const filters = { senti: 'all', q: '', sort: 'nps', cat: null };

/* ---------- helpers ---------- */
function api(path, opts) {
  return fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
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

/* ---------- engine badge ---------- */
async function loadHealth() {
  try {
    const h = await api('/health');
    const label = h.engine === 'jev' ? 'Jev · TypeSafe AI' : 'a built-in offline classifier';
    $('#engineName').textContent = label;
    $('#engineTag').textContent = h.engine === 'jev' ? 'Jev' : 'Mock engine';
    if (!h.sheetsEnabled) {
      $('#sheetNote').textContent = 'Server note: Google Sheets is not configured yet, so sheet loading is disabled. Set GOOGLE_APPLICATION_CREDENTIALS to enable it. CSV upload works now.';
      $('#loadSheetBtn').disabled = true;
    }
  } catch { /* server may still be starting */ }
}

/* ---------- connect view ---------- */
function parseSheetId(v) {
  v = v.trim();
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : v;
}

function wireConnect() {
  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  const drop = $('#drop'), fileInput = $('#fileInput');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) ingestFile(fileInput.files[0]); });
  ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) ingestFile(f); });

  $('#sampleBtn').addEventListener('click', loadSample);
  $('#loadSheetBtn').addEventListener('click', loadSheet);
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

async function ingestCSV(content, filename) {
  connectMsg('', true);
  showLoading('Classifying reviews…');
  try {
    const data = await api('/datasets', { method: 'POST', body: JSON.stringify({ kind: 'csv', content, filename }) });
    openDashboard(data);
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

async function loadSheet() {
  const id = parseSheetId($('#sheetId').value);
  if (!id) return connectMsg('Paste a Google Sheet ID or URL first.', false);
  connectMsg('', true);
  showLoading('Reading sheet and classifying…');
  try {
    const data = await api('/datasets', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'sheet', spreadsheetId: id,
        sheetName: $('#sheetTab').value.trim() || undefined,
        writeBack: $('#writeBack').checked,
      }),
    });
    openDashboard(data);
    if (data.wroteBack) toast('Classifications written to the sheet');
  } catch (err) { connectMsg(err.message, false); }
  finally { hideLoading(); }
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
  $('#dashSubtitle').textContent = sub;
  renderAll();
}

function renderAll() { renderTiles(); renderCats(); renderNps(); renderRows(); }

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
  $('#rows').innerHTML = rows.map(r => {
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
}

/* ---------- edits ---------- */
async function onEdit(id, field, value) {
  const r = dataset.reviews.find(x => x.id === id);
  if (!r) return;
  r[field] = value; r.edited = true;
  renderAll();
  try {
    const res = await api(`/datasets/${dataset.datasetId}/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
    if (res.synced) toast(`Synced ${field} to the sheet`);
    else if (res.syncError) toast(`Saved locally — sheet sync failed: ${res.syncError}`, true);
    else toast(`Saved ${field}`);
  } catch (err) { toast(err.message, true); }
}

function wireDashboard() {
  $('#rows').addEventListener('change', e => {
    const sel = e.target.closest('select');
    if (sel) onEdit(sel.dataset.id, sel.dataset.field, sel.value);
  });
  $('#sentiSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filters.senti = b.dataset.s;
    [...e.currentTarget.children].forEach(x => x.setAttribute('aria-pressed', x === b));
    renderRows();
  });
  $('#searchInput').addEventListener('input', e => { filters.q = e.target.value.toLowerCase().trim(); renderRows(); });
  $('#sortSel').addEventListener('change', e => { filters.sort = e.target.value; renderRows(); });
  const toggleCat = c => { filters.cat = filters.cat === c ? null : c; renderCats(); renderRows(); };
  $('#catPanel').addEventListener('click', e => { const row = e.target.closest('.catrow'); if (row) toggleCat(row.dataset.cat); });
  $('#catPanel').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.catrow'); if (row) { e.preventDefault(); toggleCat(row.dataset.cat); }
  });

  $('#exportBtn').addEventListener('click', () => { window.location = `/api/datasets/${dataset.datasetId}/export`; });
  $('#syncAllBtn').addEventListener('click', async () => {
    showLoading('Writing all classifications to the sheet…');
    try { const r = await api(`/datasets/${dataset.datasetId}/writeback`, { method: 'POST' }); toast(`Synced ${r.cells} cells to the sheet`); }
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

loadHealth();
wireConnect();
wireDashboard();
