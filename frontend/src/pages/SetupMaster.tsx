import { api } from "../lib/api";
import { deriveKey, VAULT_CHECK_PLAINTEXT } from "../crypto/key";
import { encrypt } from "../crypto/encrypt";
import { toBase64 } from "../utils/encoding";

/** Creates the `user_security` row and returns the derived vault key (never persisted as bytes). */
export async function setupMasterPassword(password: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  // Encrypts a fixed constant, so holding the vault key never reveals the master password.
  const { cipher, iv } = await encrypt(VAULT_CHECK_PLAINTEXT, key);

  await api.post("/user-security", {
    salt: toBase64(salt),
    check_cipher: cipher,
    check_iv: iv,
  });

  return key;
}
