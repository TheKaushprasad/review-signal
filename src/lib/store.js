import { randomUUID } from 'node:crypto';

// In-memory dataset store. A dataset is one uploaded sheet/CSV plus its
// classified reviews and the metadata needed to write corrections back to
// the source Google Sheet. For v1 this lives in process memory; swap for a
// real DB when multi-user persistence is needed (see README non-goals).

const datasets = new Map();

export function createDataset({ name, source, reviews }) {
  const id = randomUUID();
  datasets.set(id, {
    id,
    name,
    source,              // { type:'csv'|'sheet', ...sheet metadata }
    reviews,             // [{ id, rowIndex, author, date, text, sentiment, likeliness, category, nps, edited }]
    createdAt: new Date().toISOString(),
  });
  return datasets.get(id);
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
