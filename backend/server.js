const express = require("express");
const supabase = require("./supabase");
const { createSupabaseWithUserJwt } = require("./supabaseUser");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const app = express();

// macOS uses port 5000 for AirPlay Receiver; use another port (e.g. 5050) in dev.
const PORT = Number(process.env.PORT) || 5050;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

const authenticateRequest = async (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = data.user;
  next();
};

app.use(authenticateRequest);

function createUserClient(req, res) {
  try {
    return createSupabaseWithUserJwt(req.headers.authorization);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error && err.message.includes("SUPABASE_ANON_KEY")
        ? "Set SUPABASE_ANON_KEY in backend/.env (same value as VITE_SUPABASE_ANON_KEY)."
        : "Server configuration error";
    res.status(500).json({ error: message });
    return null;
  }
}

app.get("/categories", async (req, res) => {
  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const { data, error } = await userSupabase.schema("shield_schema").from("categories").select("*");
  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

//  POST /categories
app.post("/categories", async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: "code and name are required" });
  }

  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("categories")
    .insert({ category_code: code, category_name: name });
  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

app.get("/category-items", async (req, res) => {
  const categoryId = req.query.category_id;
  if (!categoryId || typeof categoryId !== "string") {
    return res.status(400).json({ error: "category_id query parameter is required" });
  }

  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("category_items")
    .select("*")
    .eq("category_id", categoryId);

  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data ?? []);
});

app.post("/category-items", async (req, res) => {
  const { category_id, title, password, description } = req.body ?? {};

  if (!category_id || typeof category_id !== "string") {
    return res.status(400).json({ error: "category_id is required" });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const pwd = password != null && String(password).trim() !== "" ? String(password).trim() : null;
  const desc =
    description != null && String(description).trim() !== "" ? String(description).trim() : null;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("category_items")
    .insert({
      category_id,
      title: title.trim(),
      password: pwd,
      description: desc,
    })
    .select();

  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));