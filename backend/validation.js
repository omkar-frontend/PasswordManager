/** Upper bounds so a client cannot push unbounded blobs into the vault. */
const LIMITS = {
  categoryCode: 64,
  categoryName: 100,
  title: 200,
  description: 2000,
  cipher: 8192,
  iv: 64,
  salt: 128,
  id: 64,
  url: 2048,
};

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Returns the trimmed string, or null when absent/blank/over `max`. */
function requiredString(value, max) {
  const text = trimmed(value);
  if (!text || text.length > max) return null;
  return text;
}

/** Log the real error server-side; never leak driver/schema details to the client. */
function dbFail(res, scope, error) {
  console.error(`[${scope}]`, error);
  return res.status(500).json({ error: "Request failed. Please try again." });
}

/**
 * `additional_properties` is a free-form bag for small UI flags. Nothing validates its
 * shape at the database level, so it is bounded here: a plain object, few keys, small
 * payload. Never put anything security-relevant in it — it has no constraints.
 */
const MAX_ADDITIONAL_KEYS = 32;
const MAX_ADDITIONAL_BYTES = 4096;

function readAdditionalProperties(value) {
  if (value === undefined) return { present: false };
  if (value === null) return { present: true, value: null };

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "additional_properties must be an object" };
  }

  const keys = Object.keys(value);
  if (keys.length > MAX_ADDITIONAL_KEYS) {
    return { error: "additional_properties has too many keys" };
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { error: "additional_properties is not serialisable" };
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_ADDITIONAL_BYTES) {
    return { error: "additional_properties is too large" };
  }

  return { present: true, value };
}

/** Only http(s) may be stored: the URL is rendered as a link, and javascript: would execute. */
function safeUrl(value) {
  const text = trimmed(value);
  if (!text) return { url: null };
  if (text.length > LIMITS.url) return { error: "url is too long" };
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "url must start with http:// or https://" };
    }
    return { url: parsed.toString() };
  } catch {
    return { error: "url is not valid" };
  }
}

module.exports = {
  LIMITS,
  trimmed,
  requiredString,
  safeUrl,
  readAdditionalProperties,
  dbFail,
};
