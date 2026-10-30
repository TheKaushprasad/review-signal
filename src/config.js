import 'dotenv/config';

// Central configuration, all sourced from environment variables.
// The app runs with ZERO setup using the built-in mock classifier and CSV upload.
// Google Sheets and the real Jev engine are opt-in via the vars below.

export const config = {
  port: Number(process.env.PORT) || 3000,

  // 'mock' (default, offline, no key) or 'jev' (TypeSafe AI).
  classifier: (process.env.CLASSIFIER || 'mock').toLowerCase(),

  jev: {
    apiUrl: process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone',
    apiKey: process.env.TYPESAFE_API_KEY || '',
    model: process.env.JEV_MODEL || 'jev-latest',
    // How many reviews to classify in parallel.
    concurrency: Number(process.env.JEV_CONCURRENCY) || 5,
  },

  google: {
    // Path to a service-account JSON key file (local dev). The sheet must be
    // shared with the service account's client_email as Editor.
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    // Or the JSON key's contents inline, for hosts without a filesystem
    // (e.g. Vercel). Takes precedence over the path when set.
    credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON || '',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',       // browser-safe, served to the client
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', // server-only, never sent to the client
  },

  openai: {
    // Powers the dataset-level AI Summary (Jev still does per-review labels).
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

export const sheetsEnabled = Boolean(config.google.credentialsPath || config.google.credentialsJson);
export const jevConfigured = config.classifier === 'jev' && Boolean(config.jev.apiKey);
// Auth + persistence are enabled only when the project URL and anon key are present.
export const supabaseEnabled = Boolean(config.supabase.url && config.supabase.anonKey);
// The AI Summary feature is available only when an OpenAI key is configured.
export const openaiEnabled = Boolean(config.openai.apiKey);
