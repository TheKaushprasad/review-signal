import {
  CATEGORIES, clampScore, confidenceToLikeliness,
} from './schema.js';

// Offline, deterministic, zero-dependency classifier. Keyword-driven.
// Good enough to run the whole app without any API key, and to give the
// dashboard realistic-looking signal. Swap for Jev by setting CLASSIFIER=jev.

const POS = ['love', 'great', 'excellent', 'amazing', 'perfect', 'best', 'awesome', 'smooth', 'fast', 'kind', 'helpful', 'beautiful', 'impressive', 'nice', 'easy', 'thank'];
const NEG = ['crash', 'bug', 'error', 'broken', 'slow', 'late', 'cold', 'worst', 'terrible', 'awful', 'hate', 'annoying', 'fail', 'failed', 'wrong', 'refund', 'charged', 'rejected', 'lost', 'never', 'wasted', 'disappointed', "doesn't", "won't", 'unable', 'stuck'];

const CATEGORY_KEYWORDS = {
  'App bug': ['crash', 'bug', 'error', 'freeze', 'froze', 'glitch', 'broken', 'load', 'loading', 'lag', 'reset', 'slow'],
  'Payment': ['pay', 'payment', 'charge', 'charged', 'refund', 'billing', 'bill', 'card', 'upi', 'transaction', 'money', 'price', 'cost', 'invoice'],
  'Order/Service': ['order', 'delivery', 'deliver', 'driver', 'late', 'cold', 'arrived', 'tracking', 'service', 'cancel', 'missing', 'wait'],
  'Employee': ['agent', 'support', 'staff', 'rep', 'representative', 'driver', 'employee', 'team', 'person', 'rude', 'kind', 'helpful'],
  'UI/UX': ['ui', 'ux', 'interface', 'design', 'screen', 'button', 'menu', 'layout', 'navigation', 'font', 'dark mode', 'home screen', 'search', 'filter', 'address'],
};

function countHits(text, words) {
  let n = 0;
  for (const w of words) if (text.includes(w)) n++;
  return n;
}

function classifyOne(text) {
  const t = String(text || '').toLowerCase();

  // Sentiment
  const pos = countHits(t, POS);
  const neg = countHits(t, NEG);
  let sentiment, conf;
  if (neg > pos) { sentiment = 'negative'; conf = 0.6 + Math.min(0.35, (neg - pos) * 0.1); }
  else if (pos > neg) { sentiment = 'positive'; conf = 0.6 + Math.min(0.35, (pos - neg) * 0.1); }
  else { sentiment = 'neutral'; conf = pos === 0 ? 0.55 : 0.5; }

  // Category: best keyword match (Employee beats Order/Service only on a tie-break
  // when a person word is present; UI/UX is the fallback for interface words).
  let best = 'Other', bestScore = 0;
  for (const cat of CATEGORIES) {
    const kws = CATEGORY_KEYWORDS[cat];
    if (!kws) continue;
    const score = countHits(t, kws);
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  const category = bestScore === 0 ? 'Other' : best;

  // NPS impact: negative + strong language => higher harm.
  let nps = 2;
  if (sentiment === 'negative') nps = 4 + (neg >= 3 ? 1 : 0);
  else if (sentiment === 'neutral') nps = 3 - (pos > 0 ? 1 : 0);
  else nps = 2;
  // Churn-signal words push it to the top.
  if (/(refund|double charged|never came|crash|wasted|cancel|churn|uninstall)/.test(t)) nps = clampScore(nps + 1);

  return {
    sentiment,
    likeliness: confidenceToLikeliness(conf),
    category,
    nps: clampScore(nps),
  };
}

export async function classify(reviews) {
  return reviews.map(r => ({ ...r, ...classifyOne(r.text) }));
}

export const engine = 'mock';
