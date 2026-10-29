import { Router } from 'express';
import { csvToRecords, guessTextColumn, guessColumn, recordsToCSV } from '../lib/csv.js';
import { classifyReviews, activeEngine } from '../classifiers/index.js';
import { createDataset, putDataset, getDataset, updateReview } from '../lib/store.js';
import { saveDataset, loadDataset, listDatasets, updateReviewDb, deleteDataset } from '../lib/db.js';
import { sheetsEnabled, supabaseEnabled, config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
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
    supabase: supabaseEnabled
      ? { enabled: true, url: config.supabase.url, anonKey: config.supabase.anonKey }
      : { enabled: false },
  });
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

// Create a dataset from a CSV upload or a Google Sheet.
router.post('/datasets', async (req, res) => {
  try {
    const { kind } = req.body;

    if (kind === 'csv') {
      const { content, filename, textColumn } = req.body;
      if (!content) return res.status(400).json({ error: 'Missing CSV content.' });
      const { headers, records } = csvToRecords(content);
      if (!headers.length) return res.status(400).json({ error: 'Could not read any columns from the CSV.' });
      const col = textColumn && headers.includes(textColumn) ? textColumn : guessTextColumn(headers);
      const rows = records.map((record, i) => ({ rowNumber: i + 2, record }));
      let reviews = buildReviews(headers, rows, col);
      if (!reviews.length) return res.status(400).json({ error: `No non-empty reviews found in column "${col}".` });
      reviews = await classifyReviews(reviews);
      return finishDataset(req, res, {
        name: filename || 'Uploaded CSV',
        source: { type: 'csv', textColumn: col },
        reviews, wroteBack: false,
      });
    }

    if (kind === 'sheet') {
      if (!sheetsEnabled) {
        return res.status(400).json({ error: 'Google Sheets is not configured on the server. Set GOOGLE_APPLICATION_CREDENTIALS and share the sheet with the service account.' });
      }
      const { spreadsheetId, sheetName, textColumn, writeBack = true } = req.body;
      if (!spreadsheetId) return res.status(400).json({ error: 'Missing spreadsheetId.' });
      const { sheetName: resolved, headers, rows } = await readSheet(spreadsheetId, sheetName);
      const col = textColumn && headers.includes(textColumn) ? textColumn : guessTextColumn(headers);
      let reviews = buildReviews(headers, rows, col);
      if (!reviews.length) return res.status(400).json({ error: `No non-empty reviews found in column "${col}".` });
      reviews = await classifyReviews(reviews);

      const classStartColIndex = findClassBlock(headers);
      const source = {
        type: 'sheet', spreadsheetId, sheetName: resolved, textColumn: col,
        classStartColIndex, writeBack: Boolean(writeBack),
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      };

      let wroteBack = false;
      if (writeBack) {
        await writeAllClassification(spreadsheetId, resolved, classStartColIndex, reviews);
        wroteBack = true;
      }
      return finishDataset(req, res, { name: `${resolved} (Google Sheet)`, source, reviews, wroteBack });
    }

    return res.status(400).json({ error: 'kind must be "csv" or "sheet".' });
  } catch (err) {
    console.error('ingest error:', err);
    res.status(500).json({ error: err.message || 'Classification failed.' });
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

// Edit a single review: update the cache, persist to the DB (if owned), and
// write back to the sheet (if sheet-backed).
router.patch('/datasets/:id/reviews/:rid', async (req, res) => {
  const ds = await getOrHydrate(req, req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found.' });
  const review = updateReview(ds.id, req.params.rid, req.body || {});
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  let saved = null, saveError = null;
  if (ds.persisted && req.user) {
    try { await updateReviewDb(req.accessToken, review.id, req.body || {}); saved = true; }
    catch (err) { saved = false; saveError = err.message; }
  }

  let synced = false, syncError = null;
  if (ds.source.type === 'sheet' && ds.source.writeBack) {
    try {
      await writeOneClassification(ds.source.spreadsheetId, ds.source.sheetName, ds.source.classStartColIndex, review);
      synced = true;
    } catch (err) { syncError = err.message; }
  }
  res.json({ review, synced, syncError, saved, saveError });
});

// Push every current classification to the sheet.
router.post('/datasets/:id/writeback', async (req, res) => {
  const ds = await getOrHydrate(req, req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found.' });
  if (ds.source.type !== 'sheet') return res.status(400).json({ error: 'This dataset is not backed by a Google Sheet.' });
  try {
    const result = await writeAllClassification(ds.source.spreadsheetId, ds.source.sheetName, ds.source.classStartColIndex, ds.reviews);
    res.json({ synced: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export the classified dataset as a CSV download.
router.get('/datasets/:id/export', async (req, res) => {
  const ds = await getOrHydrate(req, req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found.' });
  const headers = ['author', 'date', 'review', ...CLASS_HEADERS];
  const records = ds.reviews.map(r => ({
    author: r.author, date: r.date, review: r.text,
    'Sentiment': r.sentiment, 'Category': r.category,
    'Likeliness (1-5)': r.likeliness, 'NPS Impact (1-5)': r.nps,
  }));
  const csv = recordsToCSV(headers, records);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="review-signal-export.csv"');
  res.send(csv);
});

function serializeDataset(ds, extra) {
  return {
    datasetId: ds.id,
    name: ds.name,
    engine: activeEngine(),
    persisted: Boolean(ds.persisted),
    source: {
      type: ds.source.type,
      textColumn: ds.source.textColumn,
      writeBack: Boolean(ds.source.writeBack),
      url: ds.source.url || null,
    },
    reviews: ds.reviews.map(({ id, author, date, text, sentiment, likeliness, category, nps, edited }) =>
      ({ id, author, date, text, sentiment, likeliness, category, nps, edited: Boolean(edited) })),
    ...extra,
  };
}
