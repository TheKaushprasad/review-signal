import { randomUUID } from 'node:crypto';

// In-session cache of datasets. Guests live here only (cleared on restart).
// Signed-in users also have their datasets persisted in Supabase; this cache
// holds the active copy so edits/export/write-back don't round-trip the DB.
// Each dataset: { id, name, source, reviews, userId?, persisted?, createdAt }

const datasets = new Map();

export function putDataset(ds) {
  if (!ds.id) ds.id = randomUUID();
  if (!ds.createdAt) ds.createdAt = new Date().toISOString();
  datasets.set(ds.id, ds);
  return ds;
}

// Back-compat helper for guest datasets.
export function createDataset(d) {
  return putDataset({ ...d });
}

export function getDataset(id) {
  return datasets.get(id) || null;
}

export function updateReview(id, reviewId, patch) {
  const ds = datasets.get(id);
  if (!ds) return null;
  const r = ds.reviews.find(x => x.id === reviewId);
  if (!r) return null;
  const allowed = ['sentiment', 'category', 'likeliness', 'nps'];
  for (const k of allowed) {
    if (patch[k] !== undefined) r[k] = patch[k];
  }
  r.edited = true;
  return r;
}
