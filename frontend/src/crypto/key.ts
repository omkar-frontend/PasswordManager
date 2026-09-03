/**
 * PBKDF2-HMAC-SHA256 work factor, per current OWASP guidance.
 * `user_security` has no column recording the factor a vault was created with, so
 * unlocking tries this first and falls back to LEGACY_PBKDF2_ITERATIONS.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Work factor used by vaults created before the raise. Unlock-only fallback. */
export const LEGACY_PBKDF2_ITERATIONS = 100_000;

/**
 * Plaintext behind `check_cipher` for v2 vaults. Earlier vaults encrypted the master
 * password itself, which meant anyone holding the vault key could recover it.
 */
export const VAULT_CHECK_PLAINTEXT = "shieldx-vault-check-v1";

/**
 * Derives the AES-GCM vault key. Non-extractable by default: the key is handed to
 * WebCrypto or stored as an opaque CryptoKey, never serialised to raw bytes.
 *
 * `extractable` is opt-in for exactly one caller — biometric enrolment, which must read the
 * raw key to wrap it under the authenticator's PRF secret. The extractable handle is used
 * once and discarded; what gets stored and used afterwards is re-imported non-extractable.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
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

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}
