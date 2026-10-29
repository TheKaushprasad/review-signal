import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, sheetsEnabled, supabaseEnabled } from './config.js';
import { activeEngine } from './classifiers/index.js';
import { router as api } from './routes/api.js';
import { optionalAuth } from './lib/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const publicDir = join(__dirname, '..', 'public');

app.use(express.json({ limit: '25mb' })); // CSV content arrives as a JSON string
app.use('/api', optionalAuth, api); // attaches req.user when a valid token is sent

// Marketing landing page at "/", the working app at "/app".
app.get('/', (req, res) => res.sendFile(join(publicDir, 'landing.html')));
app.get('/app', (req, res) => res.sendFile(join(publicDir, 'index.html')));

// Static assets (styles.css, app.js, sample-reviews.csv, landing.html …).
// index:false so "/" is handled by the route above, not index.html.
app.use(express.static(publicDir, { index: false }));

// On Vercel the app is imported by api/index.js as a serverless handler, so it
// must not call listen(). Locally (VERCEL unset) it runs as a normal server.
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`\n  Review Signal running at http://localhost:${config.port}`);
    console.log(`  Classifier : ${activeEngine()}${activeEngine() === 'mock' ? '  (offline heuristic — set CLASSIFIER=jev for TypeSafe AI)' : '  (TypeSafe AI)'}`);
    console.log(`  Sheets     : ${sheetsEnabled ? 'enabled' : 'disabled (CSV upload only — set GOOGLE_APPLICATION_CREDENTIALS to enable)'}`);
    console.log(`  Accounts   : ${supabaseEnabled ? 'enabled (Supabase auth + persistence)' : 'disabled (guest only — set SUPABASE_URL / SUPABASE_ANON_KEY to enable)'}\n`);
  });
}

export default app;
