import { deriveKey } from "../crypto/key";
import { decrypt } from "../crypto/decrypt";
import { fromBase64 } from "../utils/encoding";
import type { UserSecurityRow } from "../types/userSecurity";

export async function unlockVault(
  password: string,
  record: UserSecurityRow,
): Promise<CryptoKey> {
  const salt = fromBase64(record.salt);
  const key = await deriveKey(password, salt, true);

  try {
    const result = await decrypt(record.check_cipher, record.check_iv, key);
    if (result === "vault_check") return key;
  } catch {
    throw new Error("Wrong password");
  }

  throw new Error("Wrong password");
}
