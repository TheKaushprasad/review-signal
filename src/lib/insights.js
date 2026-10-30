import { config } from '../config.js';
import { CATEGORIES } from '../classifiers/schema.js';

// Dataset-level "AI Summary" via OpenAI. Jev does the per-review labels; this
// turns the whole classified set into a decision-ready executive summary.
// We send a COMPACT digest (aggregates + a sample of the worst reviews), not
// every row, so the call stays cheap and within token limits at any size.

function buildDigest(reviews) {
  const n = reviews.length || 1;
  const senti = reviews.reduce((m, r) => { m[r.sentiment] = (m[r.sentiment] || 0) + 1; return m; }, {});
  const cats = CATEGORIES.map(c => {
    const xs = reviews.filter(r => r.category === c);
    return { category: c, count: xs.length, avgNps: xs.length ? +(xs.reduce((a, r) => a + r.nps, 0) / xs.length).toFixed(2) : 0 };
  }).filter(x => x.count);
  const avgNps = +(reviews.reduce((a, r) => a + r.nps, 0) / n).toFixed(2);
  // Representative negatives: most harmful first, capped so the prompt stays small.
  const negSamples = reviews
    .filter(r => r.sentiment === 'negative')
    .sort((a, b) => b.nps - a.nps)
    .slice(0, 15)
    .map(r => `[${r.category}] ${String(r.text).slice(0, 200)}`);
  return { n: reviews.length, senti, cats, avgNps, negSamples };
}

export async function generateInsights(reviews) {
  if (!config.openai.apiKey) throw new Error('OpenAI is not configured on the server.');
  if (!Array.isArray(reviews) || !reviews.length) throw new Error('No reviews to summarize.');

  const d = buildDigest(reviews);
  const system = 'You are a sharp product analyst. Given classified customer reviews, write a concise, decision-ready summary a PM can act on today. Be specific and quantitative, reference the categories and counts, and avoid fluff. Respond ONLY with JSON.';
  const user =
    `Dataset: ${d.n} reviews.\n` +
    `Sentiment counts: ${JSON.stringify(d.senti)}.\n` +
    `Average NPS impact (1 = negligible, 5 = severe detractor driver): ${d.avgNps}.\n` +
    `Category breakdown (count, avg NPS impact): ${JSON.stringify(d.cats)}.\n` +
    `Representative negative reviews:\n- ${d.negSamples.join('\n- ') || '(none)'}\n\n` +
    `Return JSON with exactly these keys:\n` +
    `  headline: one punchy sentence capturing the overall state.\n` +
    `  topProblems: array of up to 3 objects { title, category, detail } — the biggest issues, each tied to a category and why it matters (cite counts/NPS).\n` +
    `  npsDrivers: 1-2 sentences on what is most dragging NPS down.\n` +
    `  recommendations: array of up to 4 short, concrete action strings, highest impact first.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(content); } catch { parsed = { headline: content }; }
  return parsed;
}
