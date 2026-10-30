// The single source of truth for what the classifier produces.
// Both the mock and the Jev adapter return objects in this shape, and the
// Jev question spec below is built directly from these definitions.

export const SENTIMENTS = ['positive', 'neutral', 'negative'];

export const CATEGORIES = [
  'UI/UX',
  'Employee',
  'App bug',
  'Payment',
  'Order/Service',
  'Other',
];

// Descriptions double as the human-readable guidance AND the Jev `criteria`.
const SENTIMENT_CRITERIA = {
  positive: 'The reviewer is satisfied, pleased, or praising the product or service.',
  neutral: 'The reviewer is mixed, factual, or indifferent with no strong positive or negative lean.',
  negative: 'The reviewer is frustrated, disappointed, or complaining about a problem.',
};

const CATEGORY_CRITERIA = {
  'UI/UX': 'About the interface, design, layout, navigation, ease of use, or visual experience.',
  'Employee': 'About a staff member, support agent, or delivery/driver person and how they behaved.',
  'App bug': 'About crashes, errors, freezes, broken features, or technical malfunctions.',
  'Payment': 'About billing, charges, refunds, payment methods, or transaction failures.',
  'Order/Service': 'About the order itself, delivery, fulfillment, timing, or the service received.',
  'Other': 'Does not clearly fit any of the other categories (e.g. pricing, general remarks).',
};

// NPS impact: how much this review signals detractor behaviour (likelihood to
// hurt Net Promoter Score). 1 = negligible, 5 = severe detractor driver.
// Modelled as a choice question (Jev's choice type is the proven contract);
// each label maps to a 1-5 number via NPS_SCORE below.
const NPS_CRITERIA = {
  negligible: 'Negligible impact — a promoter or harmless remark.',
  minor: 'Minor impact — small gripe, unlikely to lower a score.',
  moderate: 'Moderate impact — a real issue that could nudge the score down.',
  high: 'High impact — a clear detractor driver.',
  severe: 'Severe impact — strong detractor signal likely to cause churn.',
};

export const NPS_SCORE = { negligible: 1, minor: 2, moderate: 3, high: 4, severe: 5 };

// Does the review contain an actionable suggestion / feedback the team could act on?
const SUGGESTION_CRITERIA = {
  yes: 'Contains a concrete suggestion, feature request, or an actionable complaint the team could do something about.',
  no: 'No actionable suggestion — just a rating, praise, or a vague remark.',
};

export const JEV_QUESTIONS = {
  sentiment: {
    type: 'choice',
    instructions: 'Classify the overall sentiment of this product review.',
    criteria: SENTIMENT_CRITERIA,
  },
  category: {
    type: 'choice',
    instructions: 'Which single factor is this review mainly about?',
    criteria: CATEGORY_CRITERIA,
  },
  nps_impact: {
    type: 'choice',
    instructions: "Rate how much this review threatens the product's Net Promoter Score.",
    criteria: NPS_CRITERIA,
  },
  suggestion: {
    type: 'choice',
    instructions: 'Does this review contain a concrete suggestion or actionable feedback?',
    criteria: SUGGESTION_CRITERIA,
  },
};

// Clamp helpers used when normalising any adapter's output.
export function clampScore(n, lo = 1, hi = 5) {
  n = Math.round(Number(n));
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeSentiment(s) {
  s = String(s || '').toLowerCase().trim();
  return SENTIMENTS.includes(s) ? s : 'neutral';
}

export function normalizeCategory(c) {
  c = String(c || '').trim();
  return CATEGORIES.includes(c) ? c : 'Other';
}

export function normalizeYesNo(v) {
  v = String(v || '').toLowerCase().trim();
  return (v === 'yes' || v === 'y' || v === 'true') ? 'yes' : 'no';
}

// Confidence (0..1) -> likeliness (1..5).
export function confidenceToLikeliness(conf) {
  const n = Number(conf);
  if (Number.isNaN(n)) return 3;
  return clampScore(Math.round(n * 5) || 1);
}
