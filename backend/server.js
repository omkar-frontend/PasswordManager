const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { env } = require("./env");
const { authenticate } = require("./auth");
const { LIMITS, trimmed, requiredString, safeUrl, dbFail } = require("./validation");

const app = express();

// Rate limiting keys off the client IP, which is only trustworthy behind a known proxy.
if (env.isProd) app.set("trust proxy", 1);

app.use(helmet());

const corsOptions = {
  origin: ["http://localhost:5173", env.frontendUrl].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "100kb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(authenticate);

const SCHEMA = "shield_schema";

/** Every query is additionally scoped to the caller, so a missing RLS policy is not a breach. */
const table = (req, name) => req.db.schema(SCHEMA).from(name);

app.get("/categories", async (req, res) => {
  const { data: categories, error: catError } = await table(req, "categories")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (catError) return dbFail(res, "GET /categories", catError);

  const { data: itemRows, error: itemError } = await table(req, "category_items")
    .select("category_id")
    .eq("user_id", req.user.id)
    .is("deleted_at", null);

  if (itemError) return dbFail(res, "GET /categories items", itemError);

  const countByCategory = Object.create(null);
  for (const row of itemRows ?? []) {
    const id = row.category_id;
    if (id) countByCategory[id] = (countByCategory[id] ?? 0) + 1;
  }

  const withCounts = (categories ?? []).map((c) => {
    const cid = c.category_id;
    return {
      ...c,
      item_count: cid != null ? (countByCategory[cid] ?? 0) : 0,
    };
  });

  res.json(withCounts);
});

app.post("/categories", async (req, res) => {
  const code = requiredString(req.body?.code, LIMITS.categoryCode);
  const name = requiredString(req.body?.name, LIMITS.categoryName);
  if (!code || !name) {
    return res.status(400).json({ error: "code and name are required" });
  }

  const { data, error } = await table(req, "categories")
    .insert({ user_id: req.user.id, category_code: code, category_name: name })
    .select()
    .maybeSingle();

  if (error) return dbFail(res, "POST /categories", error);
  res.status(201).json(data);
});

app.put("/categories/:categoryId", async (req, res) => {
  const categoryId = requiredString(req.params.categoryId, LIMITS.id);
  if (!categoryId) {
    return res.status(400).json({ error: "category_id is required" });
  }

  const name = requiredString(req.body?.name, LIMITS.categoryName);
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const { data, error } = await table(req, "categories")
    .update({ category_name: name })
    .eq("category_id", categoryId)
    .eq("user_id", req.user.id)
    .select()
    .maybeSingle();

  if (error) return dbFail(res, "PUT /categories", error);
  if (!data) return res.status(404).json({ error: "category not found" });
  res.json(data);
});

app.delete("/categories/:categoryId", async (req, res) => {
  const categoryId = requiredString(req.params.categoryId, LIMITS.id);
  if (!categoryId) {
    return res.status(400).json({ error: "category_id is required" });
  }

  const { data: existing, error: fetchErr } = await table(req, "categories")
    .select("category_id")
    .eq("category_id", categoryId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (fetchErr) return dbFail(res, "DELETE /categories lookup", fetchErr);
  if (!existing) return res.status(404).json({ error: "category not found" });

  // Not atomic: PostgREST has no multi-statement transaction. Items go first so a failure
  // here leaves the category intact and the delete can simply be retried.
  // This removes trashed items too — they still hold a foreign key to the category, and
  // `categories` has no deleted_at column, so the category cannot be soft-deleted itself.
  const { error: itemsErr } = await table(req, "category_items")
    .delete()
    .eq("category_id", categoryId)
    .eq("user_id", req.user.id);

  if (itemsErr) return dbFail(res, "DELETE /categories items", itemsErr);

  const { error: catErr } = await table(req, "categories")
    .delete()
    .eq("category_id", categoryId)
    .eq("user_id", req.user.id);

  if (catErr) return dbFail(res, "DELETE /categories", catErr);
  res.status(204).end();
});

/** Omitting `category_id` returns every item the caller owns, which backs vault-wide search. */
app.get("/category-items", async (req, res) => {
  const rawCategoryId = req.query.category_id;
  let categoryId = null;

  if (rawCategoryId !== undefined) {
    categoryId = requiredString(rawCategoryId, LIMITS.id);
    if (!categoryId) {
      return res.status(400).json({ error: "category_id must be a non-empty id" });
    }
  }

  // Without an explicit order Postgres may return rows differently between calls, so the
  // list visibly reshuffles. category_item_id breaks ties on identical timestamps.
  let query = table(req, "category_items")
    .select("*")
    .eq("user_id", req.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("category_item_id", { ascending: true });

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;

  if (error) return dbFail(res, "GET /category-items", error);
  res.json(data ?? []);
});

app.get("/user-security", async (req, res) => {
  const { data, error } = await table(req, "user_security")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) return dbFail(res, "GET /user-security", error);
  res.json(data ?? null);
});

app.post("/user-security", async (req, res) => {
  const salt = requiredString(req.body?.salt, LIMITS.salt);
  const checkCipher = requiredString(req.body?.check_cipher, LIMITS.cipher);
  const checkIv = requiredString(req.body?.check_iv, LIMITS.iv);

  if (!salt || !checkCipher || !checkIv) {
    return res.status(400).json({ error: "salt, check_cipher, and check_iv are required" });
  }

  const { data, error } = await table(req, "user_security")
    .insert({
      user_id: req.user.id,
      salt,
      check_cipher: checkCipher,
      check_iv: checkIv,
    })
    .select()
    .maybeSingle();

  if (error) {
    if (String(error.code) === "23505") {
      return res.status(409).json({ error: "Vault already configured for this user" });
    }
    return dbFail(res, "POST /user-security", error);
  }

  res.status(201).json(data);
});

/**
 * Reads a `<field>_cipher` / `<field>_iv` pair. Both must arrive together, or both be
 * explicitly null to clear the value. Used for password and username alike.
 */
function readCipherPair(body, field) {
  const cipherKey = `${field}_cipher`;
  const ivKey = `${field}_iv`;
  const cipherRaw = body[cipherKey];
  const ivRaw = body[ivKey];

  if (cipherRaw === null || ivRaw === null) {
    if (cipherRaw !== null && cipherRaw !== undefined) return { error: `${cipherKey} and ${ivKey} must be cleared together` };
    if (ivRaw !== null && ivRaw !== undefined) return { error: `${cipherKey} and ${ivKey} must be cleared together` };
    return { cipher: null, iv: null, present: true };
  }

  if (cipherRaw === undefined && ivRaw === undefined) return { present: false };

  const cipher = requiredString(cipherRaw, LIMITS.cipher);
  const iv = requiredString(ivRaw, LIMITS.iv);
  if (!cipher || !iv) return { error: `${cipherKey} and ${ivKey} must be set together` };
  return { cipher, iv, present: true };
}

/** Trash retention. Expired rows are purged the next time the trash is opened. */
const TRASH_RETENTION_DAYS = 30;

async function purgeExpiredTrash(req) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await table(req, "category_items")
    .delete()
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  // Best effort: failing to purge must not stop the trash from being listed.
  if (error) console.error("[purgeExpiredTrash]", error);
}

app.post("/category-items", async (req, res) => {
  const categoryId = requiredString(req.body?.category_id, LIMITS.id);
  if (!categoryId) {
    return res.status(400).json({ error: "category_id is required" });
  }

  const title = requiredString(req.body?.title, LIMITS.title);
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const description = trimmed(req.body?.description);
  if (description.length > LIMITS.description) {
    return res.status(400).json({ error: "description is too long" });
  }

  const passwordPair = readCipherPair(req.body ?? {}, "password");
  if (passwordPair.error) return res.status(400).json({ error: passwordPair.error });

  const usernamePair = readCipherPair(req.body ?? {}, "username");
  if (usernamePair.error) return res.status(400).json({ error: usernamePair.error });

  const urlResult = safeUrl(req.body?.url);
  if (urlResult.error) return res.status(400).json({ error: urlResult.error });

  // The item inherits the caller's user_id, so confirm the parent category is theirs.
  const { data: category, error: catErr } = await table(req, "categories")
    .select("category_id")
    .eq("category_id", categoryId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (catErr) return dbFail(res, "POST /category-items lookup", catErr);
  if (!category) return res.status(404).json({ error: "category not found" });

  const { data, error } = await table(req, "category_items")
    .insert({
      user_id: req.user.id,
      category_id: categoryId,
      title,
      password_cipher: passwordPair.present ? passwordPair.cipher : null,
      password_iv: passwordPair.present ? passwordPair.iv : null,
      username_cipher: usernamePair.present ? usernamePair.cipher : null,
      username_iv: usernamePair.present ? usernamePair.iv : null,
      url: urlResult.url,
      description: description || null,
      // Explicit, so a stray column default can never create an item pre-trashed.
      deleted_at: null,
    })
    .select()
    .maybeSingle();

  if (error) return dbFail(res, "POST /category-items", error);
  res.status(201).json(data);
});

app.put("/category-items/:categoryItemId", async (req, res) => {
  const categoryItemId = requiredString(req.params.categoryItemId, LIMITS.id);
  if (!categoryItemId) {
    return res.status(400).json({ error: "category_item_id is required" });
  }

  const body = req.body ?? {};
  const updates = {};

  if (body.title !== undefined) {
    const title = requiredString(body.title, LIMITS.title);
    if (!title) return res.status(400).json({ error: "title cannot be empty" });
    updates.title = title;
  }

  if (body.description !== undefined) {
    const description = trimmed(body.description);
    if (description.length > LIMITS.description) {
      return res.status(400).json({ error: "description is too long" });
    }
    updates.description = description || null;
  }

  const passwordPair = readCipherPair(body, "password");
  if (passwordPair.error) return res.status(400).json({ error: passwordPair.error });
  if (passwordPair.present) {
    updates.password_cipher = passwordPair.cipher;
    updates.password_iv = passwordPair.iv;
  }

  const usernamePair = readCipherPair(body, "username");
  if (usernamePair.error) return res.status(400).json({ error: usernamePair.error });
  if (usernamePair.present) {
    updates.username_cipher = usernamePair.cipher;
    updates.username_iv = usernamePair.iv;
  }

  if (body.url !== undefined) {
    const urlResult = safeUrl(body.url);
    if (urlResult.error) return res.status(400).json({ error: urlResult.error });
    updates.url = urlResult.url;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  const { data, error } = await table(req, "category_items")
    .update(updates)
    .eq("category_item_id", categoryItemId)
    .eq("user_id", req.user.id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (error) return dbFail(res, "PUT /category-items", error);
  if (!data) return res.status(404).json({ error: "item not found" });
  res.json(data);
});

/** Soft delete: the row is kept for TRASH_RETENTION_DAYS so it can be restored. */
app.delete("/category-items/:categoryItemId", async (req, res) => {
  const categoryItemId = requiredString(req.params.categoryItemId, LIMITS.id);
  if (!categoryItemId) {
    return res.status(400).json({ error: "category_item_id is required" });
  }

  const { data, error } = await table(req, "category_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("category_item_id", categoryItemId)
    .eq("user_id", req.user.id)
    .is("deleted_at", null)
    .select("category_item_id, deleted_at")
    .maybeSingle();

  if (error) return dbFail(res, "DELETE /category-items", error);
  if (!data) return res.status(404).json({ error: "item not found" });

  res.json({ category_item_id: data.category_item_id, deleted_at: data.deleted_at });
});

app.post("/category-items/:categoryItemId/restore", async (req, res) => {
  const categoryItemId = requiredString(req.params.categoryItemId, LIMITS.id);
  if (!categoryItemId) {
    return res.status(400).json({ error: "category_item_id is required" });
  }

  const { data, error } = await table(req, "category_items")
    .update({ deleted_at: null })
    .eq("category_item_id", categoryItemId)
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .select()
    .maybeSingle();

  if (error) return dbFail(res, "POST /category-items restore", error);
  if (!data) return res.status(404).json({ error: "item not found in trash" });

  res.json(data);
});

/** Trashed items, newest first. Anything past retention is purged on the way through. */
app.get("/trash", async (req, res) => {
  await purgeExpiredTrash(req);

  const rawCategoryId = req.query.category_id;
  let categoryId = null;
  if (rawCategoryId !== undefined) {
    categoryId = requiredString(rawCategoryId, LIMITS.id);
    if (!categoryId) return res.status(400).json({ error: "category_id must be a non-empty id" });
  }

  let query = table(req, "category_items")
    .select("*")
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return dbFail(res, "GET /trash", error);

  res.json({ retention_days: TRASH_RETENTION_DAYS, items: data ?? [] });
});

/** Permanent removal, only ever for something already in the trash. */
app.delete("/trash/:categoryItemId", async (req, res) => {
  const categoryItemId = requiredString(req.params.categoryItemId, LIMITS.id);
  if (!categoryItemId) {
    return res.status(400).json({ error: "category_item_id is required" });
  }

  const { data: existing, error: fetchErr } = await table(req, "category_items")
    .select("category_item_id")
    .eq("category_item_id", categoryItemId)
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (fetchErr) return dbFail(res, "DELETE /trash lookup", fetchErr);
  if (!existing) return res.status(404).json({ error: "item not found in trash" });

  const { error: delErr } = await table(req, "category_items")
    .delete()
    .eq("category_item_id", categoryItemId)
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null);

  if (delErr) return dbFail(res, "DELETE /trash", delErr);
  res.status(204).end();
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Request failed. Please try again." });
});

app.listen(env.port, () => console.log(`Server running on port ${env.port}`));
