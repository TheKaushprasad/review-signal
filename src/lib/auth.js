import { supabaseEnabled } from '../config.js';
import { getUserFromToken } from './supabase.js';

// Optional auth: if a valid bearer token is present, attach req.user and
// req.accessToken. Guests (no/invalid token) pass through as before.
export async function optionalAuth(req, res, next) {
  req.user = null;
  req.accessToken = null;
  if (!supabaseEnabled) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const user = await getUserFromToken(token);
    if (user) { req.user = user; req.accessToken = token; }
  } catch { /* treat as guest */ }
  next();
}

// Require a signed-in user for account-scoped endpoints.
export function requireAuth(req, res, next) {
  if (!supabaseEnabled) return res.status(501).json({ error: 'Accounts are not enabled on this server.' });
  if (!req.user) return res.status(401).json({ error: 'Sign in to use your saved datasets.' });
  next();
}
