const supabase = require("./supabase");
const { createSupabaseWithUserJwt } = require("./supabaseUser");

/**
 * Verifying a bearer token costs a network round-trip to Supabase, and every request
 * needs it. Cache the verified user (and its RLS-scoped client) briefly, keyed by token.
 * Trade-off: a revoked session stays usable for at most TOKEN_TTL_MS.
 */
/** Marks a 401 as "the session itself is bad", so the client knows to sign out. */
const UNAUTHENTICATED = "unauthenticated";

const TOKEN_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

/** token -> { user, db, expiresAt } */
const cache = new Map();

function prune() {
  const now = Date.now();
  for (const [token, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(token);
  }
  // Map preserves insertion order, so the first keys are the oldest.
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header", code: UNAUTHENTICATED });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token", code: UNAUTHENTICATED });
  }

  const cached = cache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    req.db = cached.db;
    return next();
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    cache.delete(token);
    return res.status(401).json({ error: "Invalid or expired token", code: UNAUTHENTICATED });
  }

  let db;
  try {
    db = createSupabaseWithUserJwt(authHeader);
  } catch (err) {
    console.error("[auth] could not create user client:", err);
    return res.status(500).json({ error: "Server configuration error" });
  }

  prune();
  cache.set(token, { user: data.user, db, expiresAt: Date.now() + TOKEN_TTL_MS });

  req.user = data.user;
  req.db = db;
  next();
}

module.exports = { authenticate, UNAUTHENTICATED };
