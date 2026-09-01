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

module.exports = { LIMITS, trimmed, requiredString, safeUrl, dbFail };
