const { createClient } = require("@supabase/supabase-js");
const { env } = require("./env");

/** Anon client used only to verify bearer tokens; never for data access. */
const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;
