import { deriveKey, PBKDF2_ITERATIONS } from "../crypto/key";
import { encrypt } from "../crypto/encrypt";
import { decrypt } from "../crypto/decrypt";
import { fromBase64, toBase64 } from "../utils/encoding";

/**
 * A self-contained encrypted backup. Deliberately not a dump of the stored ciphertext:
 * the archive is decrypted with the vault key and re-encrypted under a passphrase of the
 * user's choosing, with its own fresh salt. That makes it restorable into a different
 * account, and keeps it working after a master-password change.
 */
export const BACKUP_FORMAT = "shieldx-backup";
export const BACKUP_VERSION = 1;

export const MIN_PASSPHRASE_LENGTH = 8;

export type BackupCategory = {
  category_name: string;
  category_code?: string | null;
};

export type BackupItem = {
  category_name: string;
  title: string;
  username?: string | null;
  password?: string | null;
  url?: string | null;
  description?: string | null;
  favourite?: boolean;
  created_at?: string | null;
};

export type BackupPayload = {
  categories: BackupCategory[];
  items: BackupItem[];
};

type BackupFile = {
  format: string;
  version: number;
  created_at: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  data: string;
};

export async function createBackup(payload: BackupPayload, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const { cipher, iv } = await encrypt(JSON.stringify(payload), key);

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv },
    data: cipher,
  };

  return JSON.stringify(file, null, 2);
}

/** Throws WrongPassphraseError when the passphrase does not fit, so callers can say so. */
export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase");
    this.name = "WrongPassphraseError";
  }
}

export async function readBackup(text: string, passphrase: string): Promise<BackupPayload> {
  let file: BackupFile;
  try {
    file = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error("That file is not a ShieldX backup.");
  }

  if (file?.format !== BACKUP_FORMAT) {
    throw new Error("That file is not a ShieldX backup.");
  }
  if (file.version > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of ShieldX.");
  }
  // The KDF parameters travel with the file, so old backups keep opening after an upgrade.
  if (file.kdf?.name !== "PBKDF2" || !file.kdf.salt || !file.data || !file.cipher?.iv) {
    throw new Error("This backup is missing information and cannot be read.");
  }

  const iterations = Number(file.kdf.iterations) || PBKDF2_ITERATIONS;
  const key = await deriveKey(passphrase, fromBase64(file.kdf.salt), iterations);

  let json: string;
  try {
    // AES-GCM authenticates, so a failure here means the passphrase is wrong.
    json = await decrypt(file.data, file.cipher.iv, key);
  } catch {
    throw new WrongPassphraseError();
  }

  const payload = JSON.parse(json) as BackupPayload;
  if (!Array.isArray(payload?.items) || !Array.isArray(payload?.categories)) {
    throw new Error("This backup is malformed.");
  }
  return payload;
}
