# Review Signal

Upload a Google Sheet (or CSV) of user reviews, classify every row with **Jev by
TypeSafe AI**, and work the results in an editable dashboard. Corrections you make
in the dashboard write straight back to the source sheet.

Each review is classified for:

| Field | Values |
|---|---|
| **Sentiment** | positive · neutral · negative |
| **Likeliness** | 1–5 (classifier confidence) |
| **Category** | UI/UX · Employee · App bug · Payment · Order/Service · Other |
| **NPS impact** | 1–5 (higher = more likely to hurt Net Promoter Score) |

The dashboard shows sentiment/likeliness/NPS tiles, a tappable category breakdown,
an NPS-impact-by-category panel, and a filterable, inline-editable review table.

---

## Quick start (zero setup)

```bash
npm install
npm start
```

Open **http://localhost:3000**, then click **"Try the sample dataset"** (or drop any
CSV). This runs the built-in **offline mock classifier** — no API key, no Google
account. Good for seeing the whole flow end to end.

---

## Turning on the real Jev engine

1. Copy `.env.example` to `.env`.
2. Set:
   ```
   CLASSIFIER=jev
   TYPESAFE_API_KEY=sk_...        # from https://docs.typesafe.ai
   ```
   (You can instead point `TYPESAFE_API_URL` at a LiteLLM or Netlify AI Gateway
   pass-through and use that gateway's key.)
3. `npm start`. The header will read "Classified by Jev · TypeSafe AI".

### How the Jev call is shaped
`src/classifiers/jev.js` sends one request per review to
`POST /v1/systemone`:

```jsonc
{
  "state": "<review text>",
  "model": "jev-latest",
  "questions": {
    "sentiment":  { "type": "choice", "instructions": "...", "criteria": { "positive": "...", "neutral": "...", "negative": "..." } },
    "category":   { "type": "choice", "instructions": "...", "criteria": { "UI/UX": "...", ... } },
    "nps_impact": { "type": "score",  "instructions": "...", "criteria": { "0": "...", ..., "4": "..." } }
  }
}
```

It reads `answers.<name>.choice` for the choice questions, uses the sentiment
answer's `confidence` as the 1–5 likeliness, and maps the `nps_impact` score level
(0–4) to 1–5. The choice/`confidence`/`probabilities` shape is documented; the exact
JSON key for a `score` answer is not fully published, so `parseScore()` reads it
defensively. Verify against the current TypeSafe docs if the contract changes.

---

## Turning on Google Sheets (load + write-back)

1. In Google Cloud: create a **service account**, enable the **Google Sheets API**,
   and download its JSON key.
2. **Share your spreadsheet** with the service account's `client_email` as **Editor**.
3. In `.env`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
   ```
4. `npm start`, choose the **Google Sheet** tab, paste the sheet ID or URL, pick
   whether to write results back, and classify.

On load (with write-back on), four columns — `Sentiment`, `Category`,
`Likeliness (1-5)`, `NPS Impact (1-5)` — are appended after your existing columns.
Editing a chip in the dashboard rewrites just that row's four cells; **Sync all to
sheet** rewrites them all.

---

## Turning on accounts + saved datasets (Supabase)

Optional. Without it the app is guest-only: datasets live in memory and are lost
on restart. With Supabase, signed-in users get their datasets saved to Postgres
(per-user, Row-Level Security) and a **My datasets** list to reopen them. Guests
keep working unchanged.

1. Create a Supabase project.
2. In the **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql) (creates the
   `datasets` and `reviews` tables + RLS policies; safe to re-run).
3. In **Project Settings → API**, copy into `.env`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...        # browser-safe
   SUPABASE_SERVICE_ROLE_KEY=eyJ...# secret, server-only
   ```
4. `npm start` — the header now shows **Sign in** (email/password); the startup
   log reads `Accounts: enabled`.

The anon key is sent to the browser by design (it only grants what RLS allows).
The service-role key is used server-side only (to verify tokens) and is never
sent to the client.

## AI Summary (OpenAI — optional)

Jev classifies every review; **OpenAI** turns the whole classified set into a
one-click **executive summary** (headline, top problems, NPS drivers,
recommended actions). It's a single model call over a compact digest of the
data, so it's cheap and fast at any size.

Set in `.env` (or Vercel env):
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # optional; any chat model that supports JSON mode
```
When set, an **AI Summary** card appears on the dashboard with a **Generate**
button. Without a key, the card is hidden and everything else works unchanged.

## Deploying to Vercel

The app ships with a serverless entry ([`api/index.js`](api/index.js)) and
[`vercel.json`](vercel.json) that route every request through the Express app, so
it runs on Vercel as-is. The guest flow is stateless (the browser holds the
dataset; export is client-side; sheet write-back sends its context in the
request), and signed-in data lives in Supabase — so nothing depends on
server memory between requests.

1. Push to GitHub and **Import** the repo in Vercel.
2. In the Vercel project's **Environment Variables**, add what you use:
   ```
   CLASSIFIER=jev
   TYPESAFE_API_KEY=...
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   GOOGLE_CREDENTIALS_JSON={...}   # the service-account JSON, inline (no file on Vercel)
   ```
   (Leave any out to disable that feature — the app still runs.)
3. Deploy. Then in **Supabase → Authentication → URL Configuration**, add your
   production domain `https://<your-app>.vercel.app/app` to the redirect list.

Note: Vercel has no persistent disk, so `GOOGLE_APPLICATION_CREDENTIALS` (a file
path) won't work there — use `GOOGLE_CREDENTIALS_JSON` instead.

## Architecture

```
src/
  server.js              Express app; serves the API and the dashboard
  config.js              env-driven configuration
  classifiers/
    schema.js            categories, sentiments, NPS levels, Jev question spec
    index.js             engine factory (mock | jev)
    mock.js              offline keyword classifier (default)
    jev.js               TypeSafe AI adapter
  lib/
    csv.js               dependency-free CSV parse/serialize + column guessing
    store.js             in-memory dataset store
  sheets/
    sheets.js            googleapis read + write-back
  routes/
    api.js               REST endpoints
public/                  dashboard UI (vanilla JS, no build step)
```

### API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | active engine + whether Sheets is enabled |
| POST | `/api/datasets` | ingest `{kind:"csv",content}` or `{kind:"sheet",spreadsheetId}` → classify |
| GET  | `/api/datasets/:id` | fetch a classified dataset |
| PATCH| `/api/datasets/:id/reviews/:rid` | edit a review; write back if sheet-backed |
| POST | `/api/datasets/:id/writeback` | push all classifications to the sheet |
| GET  | `/api/datasets/:id/export` | download classified CSV |

## Known limits (v1)

- Datasets live in process memory — restarting the server clears them. Add a DB for
  real persistence.
- English reviews only; one primary category per review.
- Write-back assumes contiguous data rows starting at row 2 with headers in row 1.
