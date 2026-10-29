import { createClient } from '@supabase/supabase-js';
import { config, supabaseEnabled } from '../config.js';

// Admin client (service-role key). Server-only. Used to verify access tokens.
// The service-role key bypasses RLS, so it is NEVER sent to the browser and we
// only use it for token verification, not for scoped data reads/writes.
let _admin = null;
export function adminClient() {
  if (!supabaseEnabled || !config.supabase.serviceKey) return null;
  if (_admin) return _admin;
  _admin = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

// A client that acts AS the signed-in user: queries run under their JWT, so
// Row-Level Security enforces that they only touch their own rows.
export function userClient(accessToken) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Verify a bearer token and return the user, or null.
export async function getUserFromToken(accessToken) {
  const admin = adminClient();
  const client = admin || createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}
