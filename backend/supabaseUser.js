const { createClient } = require("@supabase/supabase-js");
const { env } = require("./env");

/** Returns a Supabase client that acts as the caller, so RLS applies to every query. */
function createSupabaseWithUserJwt(authorization) {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new Error("Authorization header must be a Bearer token");
  }

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

module.exports = { createSupabaseWithUserJwt };
