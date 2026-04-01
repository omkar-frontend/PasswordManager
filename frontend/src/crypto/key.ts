/**
 * @param extractable Set `true` for vault keys so they can be saved to sessionStorage for the tab session (refresh-friendly UX).
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  extractable = false,
) {
  const enc = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const saltBuf = new Uint8Array(salt);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}