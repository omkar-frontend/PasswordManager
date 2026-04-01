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

app.get("/user-security", async (req, res) => {
  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("user_security")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }

  res.json(data ?? null);
});

app.post("/user-security", async (req, res) => {
  const { salt, check_cipher, check_iv } = req.body ?? {};
  if (
    typeof salt !== "string" ||
    !salt.trim() ||
    typeof check_cipher !== "string" ||
    !check_cipher.trim() ||
    typeof check_iv !== "string" ||
    !check_iv.trim()
  ) {
    return res.status(400).json({ error: "salt, check_cipher, and check_iv are required" });
  }

  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("user_security")
    .insert({
      user_id: req.user.id,
      salt: salt.trim(),
      check_cipher: check_cipher.trim(),
      check_iv: check_iv.trim(),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("Supabase Error:", error);
    if (String(error.code) === "23505") {
      return res.status(409).json({ error: "Vault already configured for this user" });
    }
    return res.status(500).json({ error });
  }

  res.json(data);
});

app.post("/category-items", async (req, res) => {
  const { category_id, title, password_cipher, password_iv, description } = req.body ?? {};

  if (!category_id || typeof category_id !== "string") {
    return res.status(400).json({ error: "category_id is required" });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const hasCipher =
    password_cipher != null &&
    String(password_cipher).trim() !== "" &&
    password_iv != null &&
    String(password_iv).trim() !== "";

  const pc = hasCipher ? String(password_cipher).trim() : null;
  const piv = hasCipher ? String(password_iv).trim() : null;
  const desc =
    description != null && String(description).trim() !== "" ? String(description).trim() : null;

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("category_items")
    .insert({
      category_id,
      title: title.trim(),
      password_cipher: pc,
      password_iv: piv,
      description: desc,
    })
    .select();

  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

app.patch("/category-items/:shieldItemId", async (req, res) => {
  const { shieldItemId } = req.params;
  if (!shieldItemId || typeof shieldItemId !== "string" || !shieldItemId.trim()) {
    return res.status(400).json({ error: "shield_item_id is required" });
  }

  const { title, password_cipher, password_iv, description } = req.body ?? {};
  const userSupabase = createUserClient(req, res);
  if (!userSupabase) return;

  const updates = {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title cannot be empty" });
    }
    updates.title = title.trim();
  }

  if (description !== undefined) {
    updates.description =
      description != null && String(description).trim() !== ""
        ? String(description).trim()
        : null;
  }

  const hasCipher =
    password_cipher != null &&
    String(password_cipher).trim() !== "" &&
    password_iv != null &&
    String(password_iv).trim() !== "";

  if (hasCipher) {
    updates.password_cipher = String(password_cipher).trim();
    updates.password_iv = String(password_iv).trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  const { data, error } = await userSupabase
    .schema("shield_schema")
    .from("category_items")
    .update(updates)
    .eq("shield_item_id", shieldItemId.trim())
    .select()
    .maybeSingle();

  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  if (!data) {
    return res.status(404).json({ error: "item not found" });
  }
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));