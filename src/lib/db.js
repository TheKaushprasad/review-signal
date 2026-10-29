import { userClient } from './supabase.js';

// All queries run through a per-user client, so Supabase Row-Level Security
// guarantees a user can only read/write their own rows. We also set user_id
// explicitly on insert to satisfy the insert policy.

// Persist a freshly classified dataset. Returns the DB dataset id and the
// reviews with their new DB ids attached (keyed by row_number).
export async function saveDataset(accessToken, userId, { name, engine, source, reviews }) {
  const sb = userClient(accessToken);

  const { data: ds, error: e1 } = await sb.from('datasets').insert({
    user_id: userId,
    name,
    engine,
    source_type: source.type,
    source_meta: source,
  }).select('id, created_at').single();
  if (e1) throw new Error(e1.message);

  const rows = reviews.map(r => ({
    dataset_id: ds.id, user_id: userId,
    row_number: r.rowNumber ?? null,
    author: r.author || '', date: r.date || '', text: r.text,
    sentiment: r.sentiment, likeliness: r.likeliness, category: r.category, nps: r.nps,
    edited: Boolean(r.edited),
  }));
  // Insert in chunks so very large sheets don't hit payload limits.
  const CHUNK = 500;
  const inserted = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error: e2 } = await sb.from('reviews').insert(rows.slice(i, i + CHUNK)).select('id, row_number');
    if (e2) throw new Error(e2.message);
    inserted.push(...data);
  }

  const byRow = new Map(inserted.map(x => [x.row_number, x.id]));
  const withIds = reviews.map(r => ({ ...r, id: byRow.get(r.rowNumber ?? null) || r.id }));
  return { id: ds.id, createdAt: ds.created_at, reviews: withIds };
}

// Load a persisted dataset (dataset row + its reviews) owned by the user.
export async function loadDataset(accessToken, id) {
  const sb = userClient(accessToken);
  const { data: ds, error } = await sb.from('datasets').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!ds) return null;
  const { data: reviews, error: e2 } = await sb.from('reviews')
    .select('*').eq('dataset_id', id).order('row_number', { ascending: true });
  if (e2) throw new Error(e2.message);
  return {
    id: ds.id,
    name: ds.name,
    createdAt: ds.created_at,
    userId: ds.user_id,
    persisted: true,
    source: ds.source_meta || { type: ds.source_type },
    reviews: (reviews || []).map(r => ({
      id: r.id, rowNumber: r.row_number, author: r.author, date: r.date, text: r.text,
      sentiment: r.sentiment, likeliness: r.likeliness, category: r.category, nps: r.nps,
      edited: Boolean(r.edited),
    })),
  };
}

export async function listDatasets(accessToken) {
  const sb = userClient(accessToken);
  const { data, error } = await sb.from('datasets')
    .select('id, name, engine, source_type, created_at, reviews(count)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(d => ({
    id: d.id, name: d.name, engine: d.engine, sourceType: d.source_type,
    createdAt: d.created_at,
    reviewCount: Array.isArray(d.reviews) ? (d.reviews[0]?.count ?? 0) : 0,
  }));
}

export async function updateReviewDb(accessToken, reviewId, patch) {
  const sb = userClient(accessToken);
  const fields = { edited: true };
  for (const k of ['sentiment', 'category', 'likeliness', 'nps']) {
    if (patch[k] !== undefined) fields[k] = patch[k];
  }
  const { error } = await sb.from('reviews').update(fields).eq('id', reviewId);
  if (error) throw new Error(error.message);
}

export async function deleteDataset(accessToken, id) {
  const sb = userClient(accessToken);
  const { error } = await sb.from('datasets').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
