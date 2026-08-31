import {
  deriveKey,
  LEGACY_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  VAULT_CHECK_PLAINTEXT,
} from "../crypto/key";
import { decrypt } from "../crypto/decrypt";
import { fromBase64 } from "../utils/encoding";
import type { UserSecurityRow } from "../types/userSecurity";

/**
 * The stored row records neither the PBKDF2 work factor nor the verifier format, so each
 * candidate is tried in turn: current settings first, then the pre-upgrade ones.
 */
export async function unlockVault(
  password: string,
  record: UserSecurityRow,
): Promise<CryptoKey> {
  const salt = fromBase64(record.salt);

  for (const iterations of [PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS]) {
    const key = await deriveKey(password, salt, iterations);
    try {
      const plaintext = await decrypt(record.check_cipher, record.check_iv, key);
      // v1 vaults encrypted the master password itself; v2 encrypts a fixed constant.
      if (plaintext === VAULT_CHECK_PLAINTEXT || plaintext === password) return key;
    } catch {
      // Wrong work factor or wrong password — fall through to the next candidate.
    }
  }

  throw new Error("Wrong password");
}
