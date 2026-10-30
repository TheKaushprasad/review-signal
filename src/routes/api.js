import { Router } from 'express';
import { csvToRecords, guessTextColumn, guessColumn } from '../lib/csv.js';
import { classifyReviews, activeEngine } from '../classifiers/index.js';
import { createDataset, putDataset, getDataset, updateReview } from '../lib/store.js';
import { saveDataset, loadDataset, listDatasets, updateReviewDb, deleteDataset } from '../lib/db.js';
import { sheetsEnabled, supabaseEnabled, openaiEnabled, config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import { generateInsights } from '../lib/insights.js';
import {
  readSheet, writeAllClassification, writeOneClassification, CLASS_HEADERS,
} from '../sheets/sheets.js';

export const router = Router();

const AUTHOR_HINTS = ['author', 'reviewer', 'user', 'customer', 'name', 'email'];
const DATE_HINTS = ['date', 'time', 'created', 'timestamp', 'submitted'];

// Find where our classification columns already live (so re-runs overwrite
// them), or return headers.length to append a fresh block after the data.
function findClassBlock(headers) {
  for (let i = 0; i + CLASS_HEADERS.length <= headers.length; i++) {
    if (CLASS_HEADERS.every((h, k) => headers[i + k] === h)) return i;
  }
  return headers.length;
}

// Turn raw records (with an assigned 1-based rowNumber each) into review objects.
function buildReviews(headers, rows, textColumn) {
  const authorCol = guessColumn(headers, AUTHOR_HINTS);
  const dateCol = guessColumn(headers, DATE_HINTS);
  return rows
    .map(({ rowNumber, record }) => ({
      id: `r${rowNumber}`,
      rowNumber,
      author: authorCol ? String(record[authorCol] ?? '') : '',
      date: dateCol ? String(record[dateCol] ?? '') : '',
      text: String(record[textColumn] ?? '').trim(),
    }))
    .filter(r => r.text !== '');
}

// Public runtime config for the browser (anon key is browser-safe).
router.get('/config', (req, res) => {
  res.json({
    engine: activeEngine(),
    sheetsEnabled,
    insights: openaiEnabled,
    supabase: supabaseEnabled
      ? { enabled: true, url: config.supabase.url, anonKey: config.supabase.anonKey }
      : { enabled: false },
  });
});

// Dataset-level AI Summary (OpenAI). Stateless: the client sends the classified
// reviews; one model call returns a decision-ready summary.
router.post('/insights', async (req, res) => {
  if (!openaiEnabled) return res.status(501).json({ error: 'AI Summary is not enabled on this server (no OpenAI key).' });
  try {
    const insights = await generateInsights(req.body?.reviews);
    res.json({ insights });
  } catch (err) {
    console.error('insights error:', err);
    res.status(500).json({ error: err.message || 'Could not generate the summary.' });
  }
});

router.get('/health', (req, res) => {
  res.json({ engine: activeEngine(), sheetsEnabled, supabaseEnabled, signedIn: Boolean(req.user) });
});

// Persist for a signed-in user (best effort), else keep in memory. Responds.
async function finishDataset(req, res, { name, source, reviews, wroteBack }) {
  if (req.user && supabaseEnabled) {
    try {
      const saved = await saveDataset(req.accessToken, req.user.id, { name, engine: activeEngine(), source, reviews });
      const ds = putDataset({ id: saved.id, name, source, reviews: saved.reviews, userId: req.user.id, persisted: true, createdAt: saved.createdAt });
      return res.json(serializeDataset(ds, { wroteBack, saved: true }));
    } catch (err) {
      const ds = createDataset({ name, source, reviews });
      return res.json(serializeDataset(ds, { wroteBack, saved: false, saveError: err.message }));
    }
  }
  const ds = createDataset({ name, source, reviews });
  return res.json(serializeDataset(ds, { wroteBack, saved: false }));
}

// --- 3-step ingest (prepare → classify in batches → commit) ------------------
// Classification is split into small client-driven batches so no single request
// processes the whole sheet — which would exceed serverless function timeouts
// (e.g. ~10s on Vercel Hobby) on anything but tiny inputs.

// 1) Parse the CSV / read the sheet and return UNCLASSIFIED reviews + source.
//    Fast: no model calls.
router.post('/datasets/prepare', async (req, res) => {
  try {
    const { kind } = req.body;

    if (kind === 'csv') {
      const { content, filename, textColumn } = req.body;
      if (!content) return res.status(400).json({ error: 'Missing CSV content.' });
      const { headers, records } = csvToRecords(content);
      if (!headers.length) return res.status(400).json({ error: 'Could not read any columns from the CSV.' });
      const col = textColumn && headers.includes(textColumn) ? textColumn : guessTextColumn(headers);
      const rows = records.map((record, i) => ({ rowNumber: i + 2, record }));
      const reviews = buildReviews(headers, rows, col);
      if (!reviews.length) return res.status(400).json({ error: `No non-empty reviews found in column "${col}".` });
      return res.json({ name: filename || 'Uploaded CSV', source: { type: 'csv', textColumn: col }, reviews });
    }

    if (kind === 'sheet') {
      if (!sheetsEnabled) {
        return res.status(400).json({ error: 'Google Sheets is not configured on the server. Set GOOGLE_APPLICATION_CREDENTIALS (or GOOGLE_CREDENTIALS_JSON) and share the sheet with the service account.' });
      }
      const { spreadsheetId, sheetName, textColumn, writeBack = true } = req.body;
      if (!spreadsheetId) return res.status(400).json({ error: 'Missing spreadsheetId.' });
      const { sheetName: resolved, headers, rows } = await readSheet(spreadsheetId, sheetName);
      const col = textColumn && headers.includes(textColumn) ? textColumn : guessTextColumn(headers);
      const reviews = buildReviews(headers, rows, col);
      if (!reviews.length) return res.status(400).json({ error: `No non-empty reviews found in column "${col}".` });
      const classStartColIndex = findClassBlock(headers);
      const source = {
        type: 'sheet', spreadsheetId, sheetName: resolved, textColumn: col,
        classStartColIndex, writeBack: Boolean(writeBack),
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      };
      return res.json({ name: `${resolved} (Google Sheet)`, source, reviews });
    }

    return res.status(400).json({ error: 'kind must be "csv" or "sheet".' });
  } catch (err) {
    console.error('prepare error:', err);
    res.status(500).json({ error: err.message || 'Could not read the input.' });
  }
});

// 2) Classify ONE batch of reviews. The client calls this repeatedly with chunks.
router.post('/classify', async (req, res) => {
  try {
    const reviews = Array.isArray(req.body?.reviews) ? req.body.reviews : [];
    if (!reviews.length) return res.json({ reviews: [] });
    if (reviews.length > 50) return res.status(400).json({ error: 'Batch too large (max 50 reviews).' });
    const out = await classifyReviews(reviews);
    res.json({ reviews: out });
  } catch (err) {
    console.error('classify error:', err);
    res.status(500).json({ error: err.message || 'Classification failed.' });
  }
});

// 3) Commit a fully-classified dataset: write back to the sheet (one call) and
//    persist to Supabase when signed in (one bulk insert). Both are single
//    operations regardless of size, so they stay well under the timeout.
router.post('/datasets/commit', async (req, res) => {
  try {
    const { name, source, reviews, writeBack } = req.body || {};
    if (!source || !Array.isArray(reviews) || !reviews.length) {
      return res.status(400).json({ error: 'Missing source or reviews.' });
    }
    let wroteBack = false;
    const doWrite = writeBack ?? source.writeBack;
    if (source.type === 'sheet' && doWrite && source.spreadsheetId) {
      await writeAllClassification(source.spreadsheetId, source.sheetName, source.classStartColIndex, reviews);
      wroteBack = true;
    }
    return finishDataset(req, res, { name, source, reviews, wroteBack });
  } catch (err) {
    console.error('commit error:', err);
    res.status(500).json({ error: err.message || 'Could not save the dataset.' });
  }
});

// Return a dataset from the in-session cache, hydrating from Supabase if the
// user owns a persisted one that isn't cached yet.
async function getOrHydrate(req, id) {
  const mem = getDataset(id);
  if (mem) {
    // A persisted dataset is owned — only its owner may read it from the cache.
    // Anyone else falls through to the DB, where RLS returns nothing.
    if (!mem.persisted) return mem;
    if (req.user && mem.userId === req.user.id) return mem;
  }
  if (req.user && supabaseEnabled) {
    const ds = await loadDataset(req.accessToken, id);
    if (ds) { putDataset(ds); return ds; }
  }
  return null;
}

// List the signed-in user's saved datasets.
router.get('/my/datasets', requireAuth, async (req, res) => {
  try {
    res.json({ datasets: await listDatasets(req.accessToken) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/my/datasets/:id', requireAuth, async (req, res) => {
  try {
    await deleteDataset(req.accessToken, req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/datasets/:id', async (req, res) => {
  const ds = await getOrHydrate(req, req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found.' });
  res.json(serializeDataset(ds, {}));
});

// Edit a single review. Stateless: the client sends the new values, plus the
// sheet `source` and `review` when a write-back is needed — so this works on
// serverless hosts where the in-memory cache may be gone. Persists to the DB
// when the caller is signed in (RLS confirms ownership).
router.patch('/datasets/:id/reviews/:rid', async (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const k of ['sentiment', 'category', 'likeliness', 'nps']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  // keep the in-session cache current when present (local dev convenience)
  updateReview(req.params.id, req.params.rid, patch);

  let saved = null, saveError = null;
  if (req.user && supabaseEnabled) {
    try { await updateReviewDb(req.accessToken, req.params.rid, patch); saved = true; }
    catch (err) { saved = false; saveError = err.message; }
  }

  let synced = false, syncError = null;
  const src = body.source;
  if (src && src.type === 'sheet' && src.writeBack && src.spreadsheetId) {
    try {
      const merged = { ...(body.review || {}), ...patch };
      await writeOneClassification(src.spreadsheetId, src.sheetName, src.classStartColIndex, merged);
      synced = true;
    } catch (err) { syncError = err.message; }
  }
  res.json({ ok: true, synced, syncError, saved, saveError });
});

// Push every classification to the sheet. Stateless: the client sends the
// sheet `source` and the full `reviews` array.
router.post('/datasets/:id/writeback', async (req, res) => {
  const { source, reviews } = req.body || {};
  if (!source || source.type !== 'sheet' || !source.spreadsheetId) {
    return res.status(400).json({ error: 'This dataset is not backed by a Google Sheet.' });
  }
  try {
    const result = await writeAllClassification(source.spreadsheetId, source.sheetName, source.classStartColIndex, reviews || []);
    res.json({ synced: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function serializeDataset(ds, extra) {
  const s = ds.source || {};
  // Sheet datasets carry their full source to the client so edits/write-back
  // can be stateless (the client sends it back — works on serverless hosts).
  const source = s.type === 'sheet'
    ? {
        type: 'sheet', textColumn: s.textColumn, writeBack: Boolean(s.writeBack),
        url: s.url || null, spreadsheetId: s.spreadsheetId, sheetName: s.sheetName,
        classStartColIndex: s.classStartColIndex,
      }
    : { type: s.type || 'csv', textColumn: s.textColumn, writeBack: false, url: null };
  return {
    datasetId: ds.id,
    name: ds.name,
    engine: activeEngine(),
    persisted: Boolean(ds.persisted),
    source,
    reviews: ds.reviews.map(({ id, rowNumber, author, date, text, sentiment, likeliness, category, nps, edited }) =>
      ({ id, rowNumber, author, date, text, sentiment, likeliness, category, nps, edited: Boolean(edited) })),
    ...extra,
  };
}
