// Best-effort in-memory per-IP rate limiter for the paid endpoints (Jev /
// OpenAI). NOTE: on serverless (Vercel) each function instance has its own
// memory, so this only throttles a single warm instance — it is a mitigation,
// not a real guarantee. Proper protection needs a shared store (e.g. Upstash
// Redis) or authentication on these routes.

const hits = new Map(); // ip -> [timestamps]

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit({ windowMs = 60000, max = 30, message } = {}) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message || 'Too many requests — please slow down and try again shortly.' });
    }
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    }
    next();
  };
}
