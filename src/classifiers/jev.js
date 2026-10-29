import { config } from '../config.js';
import {
  JEV_QUESTIONS, NPS_SCORE, clampScore, confidenceToLikeliness,
  normalizeSentiment, normalizeCategory,
} from './schema.js';

// Adapter for Jev by TypeSafe AI — a typed-decision classification model.
//
// Request  : POST {apiUrl}  (default https://api.typesafe.ai/v1/systemone)
//   headers: Authorization: Bearer <TYPESAFE_API_KEY>, Content-Type: application/json
//   body   : { state, model, questions: { <name>: {type, instructions, criteria|levels} } }
// Response : { model, answers: { <name>: {type, choice|score, probabilities, confidence} }, usage }
//
// The choice/probabilities/confidence shape is documented; the exact JSON key
// for a `score` answer is not fully published, so parseScore() reads it
// defensively (score / level / value / choice). Verify against docs.typesafe.ai
// if TypeSafe changes the contract.

function buildQuestions() {
  // All three questions use Jev's `choice` type. criteria maps each label to a
  // description Jev decides between.
  const q = {};
  for (const [name, def] of Object.entries(JEV_QUESTIONS)) {
    q[name] = { type: 'choice', instructions: def.instructions, criteria: def.criteria };
  }
  return q;
}

// POST with a per-attempt timeout and a couple of retries, so one transient
// network blip to the Jev API doesn't fail a whole batch.
async function postWithRetry(url, options, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function classifyOne(review) {
  const body = {
    state: review.text,
    model: config.jev.model,
    questions: buildQuestions(),
  };

  const res = await postWithRetry(config.jev.apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.jev.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Jev API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const a = data.answers || {};

  const sentiment = normalizeSentiment(a.sentiment?.choice);
  const category = normalizeCategory(a.category?.choice);
  // Likeliness = how confident Jev was about the sentiment call.
  const likeliness = confidenceToLikeliness(a.sentiment?.confidence ?? 0.6);
  // NPS impact: map the chosen level label -> 1..5.
  const nps = clampScore(NPS_SCORE[a.nps_impact?.choice] ?? 3);

  return { ...review, sentiment, category, likeliness, nps };
}

// Simple concurrency-limited map.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function classify(reviews) {
  if (!config.jev.apiKey) {
    throw new Error('CLASSIFIER=jev but TYPESAFE_API_KEY is not set.');
  }
  return mapLimit(reviews, config.jev.concurrency, classifyOne);
}

export const engine = 'jev';
