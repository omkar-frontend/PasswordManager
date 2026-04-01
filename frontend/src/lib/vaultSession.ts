import { decrypt } from "../crypto/decrypt";
import { fromBase64, toBase64 } from "../utils/encoding";
import type { UserSecurityRow } from "../types/userSecurity";

const PREFIX = "shieldx_vault_aes_";

function storageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

/** Persist vault key for this browser tab session so refresh does not re-prompt. */
export async function saveVaultSessionKey(userId: string, key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey("raw", key);
  sessionStorage.setItem(storageKey(userId), toBase64(raw));
}

export async function tryRestoreVaultFromSession(
  userId: string,
  record: UserSecurityRow,
): Promise<CryptoKey | null> {
  const b64 = sessionStorage.getItem(storageKey(userId));
  if (!b64) return null;

  try {
    const raw = fromBase64(b64);
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const check = await decrypt(record.check_cipher, record.check_iv, key);
    if (check !== "vault_check") {
      clearVaultSessionKey(userId);
      return null;
    }
    return key;
  } catch {
    clearVaultSessionKey(userId);
    return null;
  }
}

export function clearVaultSessionKey(userId: string): void {
  sessionStorage.removeItem(storageKey(userId));
}
