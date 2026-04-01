const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

function createSupabaseWithUserJwt(authorization) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set for user-scoped DB access");
  }
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new Error("Authorization header must be a Bearer token");
  }

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: authorization },
    },
  });
}

module.exports = { createSupabaseWithUserJwt };
