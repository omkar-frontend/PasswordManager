import { decrypt } from "../crypto/decrypt";
import type { UserSecurityRow } from "../types/userSecurity";

/**
 * The vault key is held as a non-extractable CryptoKey in IndexedDB, which stores the
 * key object itself rather than its bytes. Script on the page can therefore use the key
 * while it is unlocked, but cannot read or exfiltrate the key material.
 */
const DB_NAME = "shieldx_vault";
const DB_VERSION = 1;
const STORE = "keys";

/** Hard ceiling on a stored key, regardless of activity. */
export const VAULT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/**
 * Inactivity window. Enforced both by a timer while the app is open and by the stored
 * `lastActiveAt` on restore — IndexedDB survives a browser restart, so without the second
 * check a closed laptop would come back to an unlocked vault.
 */
export const VAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Vault keys were previously exported to sessionStorage as raw base64 bytes. */
const LEGACY_PREFIX = "shieldx_vault_aes_";

type StoredKey = { key: CryptoKey; expiresAt: number; lastActiveAt: number };

function purgeLegacyStorage(): void {
  try {
    for (const name of Object.keys(sessionStorage)) {
      if (name.startsWith(LEGACY_PREFIX)) sessionStorage.removeItem(name);
    }
  } catch {
    // sessionStorage can be unavailable (private mode, blocked site data); nothing to purge.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/**
 * Persist the vault key so a refresh does not re-prompt, until it expires or is locked.
 * Returns the absolute deadline, so the caller can enforce it against the in-memory key
 * as well — the stored copy is only consulted on restore.
 */
export async function saveVaultSessionKey(userId: string, key: CryptoKey): Promise<number> {
  purgeLegacyStorage();
  const now = Date.now();
  const expiresAt = now + VAULT_SESSION_MAX_AGE_MS;
  try {
    const record: StoredKey = { key, expiresAt, lastActiveAt: now };
    await withStore("readwrite", (store) => store.put(record, userId));
  } catch {
    // Without persistence the vault simply re-prompts after a refresh.
  }
  return expiresAt;
}

/**
 * Records activity against the stored key. Called on a throttle while the vault is open,
 * so the idle window keeps counting from the user's last real interaction.
 */
export async function touchVaultSessionKey(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getRequest = store.get(userId);

      getRequest.onsuccess = () => {
        const stored = getRequest.result as StoredKey | undefined;
        if (stored?.key) {
          store.put({ ...stored, lastActiveAt: Date.now() }, userId);
        }
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Best effort: a failed touch only means the vault locks sooner.
  }
}

export type RestoredVault = { key: CryptoKey; expiresAt: number };

export async function tryRestoreVaultFromSession(
  userId: string,
  record: UserSecurityRow,
): Promise<RestoredVault | null> {
  purgeLegacyStorage();

  let stored: StoredKey | undefined;
  try {
    stored = await withStore<StoredKey | undefined>("readonly", (store) => store.get(userId));
  } catch {
    return null;
  }

  if (!stored?.key) return null;

  const now = Date.now();
  const expired = !(stored.expiresAt > now);
  // A record written before this check existed has no timestamp; treat it as idle-expired.
  const idle = !(typeof stored.lastActiveAt === "number") ||
    now - stored.lastActiveAt > VAULT_IDLE_TIMEOUT_MS;

  if (expired || idle) {
    await clearVaultSessionKey(userId);
    return null;
  }

  try {
    // AES-GCM authenticates on decrypt, so a successful call proves this key fits the vault.
    await decrypt(record.check_cipher, record.check_iv, stored.key);
    await touchVaultSessionKey(userId);
    // The original deadline travels with the key; a reload must not buy another 8 hours.
    return { key: stored.key, expiresAt: stored.expiresAt };
  } catch {
    await clearVaultSessionKey(userId);
    return null;
  }
}

export async function clearVaultSessionKey(userId: string): Promise<void> {
  purgeLegacyStorage();
  try {
    await withStore("readwrite", (store) => store.delete(userId));
  } catch {
    // Nothing stored, or storage unavailable.
  }
}
