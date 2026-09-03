import { deriveKey, LEGACY_PBKDF2_ITERATIONS, PBKDF2_ITERATIONS, VAULT_CHECK_PLAINTEXT } from "../crypto/key";
import { decrypt } from "../crypto/decrypt";
import { fromBase64, toBase64 } from "../utils/encoding";
import type { UserSecurityRow } from "../types/userSecurity";

/**
 * Fingerprint / Face unlock via WebAuthn's PRF extension.
 *
 * The authenticator derives a stable high-entropy secret from (credential, salt), but only
 * after user verification. That secret wraps the vault key; the wrapped copy is stored on
 * this device. The vault key is therefore unrecoverable without this authenticator — as
 * opposed to `if (fingerprintOk) unlock()`, which anything running in this origin walks past.
 *
 * The wrapped material is device-specific and useless elsewhere, so it is never sent to the
 * server. Clearing site data simply falls back to the master password.
 */

const DB_NAME = "shieldx_biometric";
const DB_VERSION = 1;
const STORE = "credentials";

/** Bumped if what gets wrapped changes — e.g. a DEK instead of the derived vault key. */
const WRAP_SCHEME = 1;

const HKDF_INFO = "shieldx-biometric-unlock-v1";

type StoredCredential = {
  credentialId: string;
  prfSalt: string;
  wrappedKey: string;
  iv: string;
  scheme: number;
  createdAt: number;
};

/** The PRF extension is not in lib.dom yet. */
type PrfExtensionResults = {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};

/**
 * What this platform calls its biometric, for UI copy only. WebAuthn deliberately does not
 * expose the modality — the same code path drives Face ID, Touch ID, a fingerprint reader
 * and Windows Hello — so this is a naming hint, never a capability check.
 */
export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "biometrics";

  const ua = navigator.userAgent;
  // iPadOS reports as Macintosh; both Apple cases get the same wording anyway.
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return "Face ID or Touch ID";
  if (/Windows/.test(ua)) return "Windows Hello";
  if (/Android|Linux/.test(ua)) return "fingerprint";
  return "biometrics";
}

/** True on platforms whose biometric is commonly a face scan, for icon choice. */
export function biometricIsFace(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Macintosh|Windows/.test(navigator.userAgent);
}

export class BiometricUnsupportedError extends Error {
  constructor(message = "This device cannot store a biometric unlock.") {
    super(message);
    this.name = "BiometricUnsupportedError";
  }
}

export class BiometricCancelledError extends Error {
  constructor() {
    super("Biometric unlock was cancelled.");
    this.name = "BiometricCancelledError";
  }
}

// ---------------------------------------------------------------------------
// Local storage of the wrapped key
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new BiometricUnsupportedError());
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

async function readCredential(userId: string): Promise<StoredCredential | null> {
  try {
    const stored = await withStore<StoredCredential | undefined>("readonly", (store) =>
      store.get(userId),
    );
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function isBiometricEnrolled(userId: string): Promise<boolean> {
  return (await readCredential(userId)) !== null;
}

export async function disableBiometric(userId: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(userId));
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/** True when this device has a built-in authenticator (Touch ID, Face ID, fingerprint). */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Key wrapping
// ---------------------------------------------------------------------------

/** HKDF over the PRF output, so the wrapping key is domain-separated from it. */
async function wrappingKeyFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(length: number) {
  // Un-annotated so the buffer type stays narrow (BufferSource rejects ArrayBufferLike).
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * The challenge is normally server-generated to stop assertion replay. Here the
 * authenticator is used purely as a local key-derivation oracle — no assertion is verified
 * by any server — so a fresh random challenge is sufficient and correct.
 */
function localChallenge() {
  return randomBytes(32);
}

async function evaluatePrf(
  credentialId: ArrayBuffer,
  prfSalt: Uint8Array,
): Promise<ArrayBuffer> {
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: localChallenge(),
        allowCredentials: [{ id: credentialId, type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
        extensions: { prf: { eval: { first: prfSalt } } },
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
  } catch {
    throw new BiometricCancelledError();
  }

  if (!assertion) throw new BiometricCancelledError();

  const results = assertion.getClientExtensionResults() as PrfExtensionResults;
  const secret = results.prf?.results?.first;
  if (!secret) {
    throw new BiometricUnsupportedError(
      "This browser cannot derive a key from your biometrics.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Enrolment and unlock
// ---------------------------------------------------------------------------

/**
 * Enrolling requires the master password: it is the only way to obtain the vault key as
 * raw bytes (the in-memory one is deliberately non-extractable), and re-authenticating
 * before adding an unlock method is the right thing to do anyway.
 */
export async function enrolBiometric(
  userId: string,
  accountLabel: string,
  masterPassword: string,
  record: UserSecurityRow,
): Promise<void> {
  if (!(await isBiometricAvailable())) throw new BiometricUnsupportedError();

  // Same candidate order as unlockVault: current parameters first, then pre-upgrade.
  const salt = fromBase64(record.salt);
  let rawKey: ArrayBuffer | null = null;

  for (const iterations of [PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS]) {
    const candidate = await deriveKey(masterPassword, salt, iterations, true);
    try {
      const plaintext = await decrypt(record.check_cipher, record.check_iv, candidate);
      if (plaintext === VAULT_CHECK_PLAINTEXT || plaintext === masterPassword) {
        rawKey = await crypto.subtle.exportKey("raw", candidate);
        break;
      }
    } catch {
      // Wrong work factor; try the next candidate.
    }
  }

  if (!rawKey) throw new Error("Wrong master password");

  const prfSalt = randomBytes(32);

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: localChallenge(),
        rp: { id: window.location.hostname, name: "ShieldX" },
        user: {
          id: new TextEncoder().encode(userId),
          name: accountLabel,
          displayName: accountLabel,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
        extensions: { prf: { eval: { first: prfSalt } } },
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
  } catch {
    throw new BiometricCancelledError();
  }

  if (!credential) throw new BiometricCancelledError();

  const created = credential.getClientExtensionResults() as PrfExtensionResults;
  if (created.prf?.enabled === false) {
    throw new BiometricUnsupportedError(
      "This browser cannot derive a key from your biometrics.",
    );
  }

  // Most implementations only return PRF output on an assertion, not at creation, so the
  // secret is fetched with a follow-up get() rather than read from the create() result.
  const prfOutput = await evaluatePrf(credential.rawId, prfSalt);
  const wrappingKey = await wrappingKeyFromPrf(prfOutput);

  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawKey);

  const entry: StoredCredential = {
    credentialId: toBase64(credential.rawId),
    prfSalt: toBase64(prfSalt),
    wrappedKey: toBase64(wrapped),
    iv: toBase64(iv),
    scheme: WRAP_SCHEME,
    createdAt: Date.now(),
  };

  await withStore("readwrite", (store) => store.put(entry, userId));
}

/** Returns the vault key, or null when this device has no enrolment. */
export async function unlockWithBiometric(
  userId: string,
  record: UserSecurityRow,
): Promise<CryptoKey | null> {
  const stored = await readCredential(userId);
  if (!stored) return null;

  const prfOutput = await evaluatePrf(
    fromBase64(stored.credentialId).buffer as ArrayBuffer,
    fromBase64(stored.prfSalt),
  );
  const wrappingKey = await wrappingKeyFromPrf(prfOutput);

  let rawKey: ArrayBuffer;
  try {
    rawKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(stored.iv) },
      wrappingKey,
      fromBase64(stored.wrappedKey),
    );
  } catch {
    // The wrapping no longer fits: enrolment is stale, so drop it and fall back.
    await disableBiometric(userId);
    throw new Error("Biometric unlock is no longer valid. Use your master password.");
  }

  // Re-imported non-extractable: same guarantees as the master-password path.
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);

  // Prove the unwrapped key actually fits this vault before handing it back. It may not:
  // after a master-password rotation the wrapping still opens, but yields the previous
  // key. Left unhandled that surfaces a raw DOMException and leaves a dead enrolment in
  // place, so the button would keep reappearing and keep failing.
  try {
    await decrypt(record.check_cipher, record.check_iv, key);
  } catch {
    await disableBiometric(userId);
    throw new Error("Biometric unlock is no longer valid. Use your master password.");
  }

  return key;
}
