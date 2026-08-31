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

module.exports = { LIMITS, trimmed, requiredString, dbFail };
