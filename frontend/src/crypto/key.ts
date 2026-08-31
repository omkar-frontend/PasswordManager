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
 * Derives the AES-GCM vault key. Always non-extractable: the key is only ever handed to
 * WebCrypto or stored as an opaque CryptoKey, never serialised to raw bytes.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
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
    false,
    ["encrypt", "decrypt"],
  );
}
