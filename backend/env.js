require("dotenv").config();

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

const missing = REQUIRED.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missing.join(", ")}.\n` +
      "Set them in backend/.env (SUPABASE_ANON_KEY must match the frontend's VITE_SUPABASE_ANON_KEY).",
  );
  process.exit(1);
}

const env = {
  supabaseUrl: process.env.SUPABASE_URL.trim(),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY.trim(),
  frontendUrl: String(process.env.FRONTEND_URL ?? "").trim() || null,
  // macOS uses port 5000 for AirPlay Receiver; use another port (e.g. 5050) in dev.
  port: Number(process.env.PORT) || 5050,
  isProd: process.env.NODE_ENV === "production",
};

module.exports = { env };
