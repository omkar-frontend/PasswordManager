import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearVaultSessionKey,
  touchVaultSessionKey,
  VAULT_IDLE_TIMEOUT_MS,
  VAULT_SESSION_MAX_AGE_MS,
} from "../lib/vaultSession";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"] as const;

/** Upper bound on how often activity is written to IndexedDB. */
const TOUCH_THROTTLE_MS = 60 * 1000;

type VaultContextType = {
  vaultKey: CryptoKey | null;
  /**
   * `expiresAt` is the absolute deadline for this unlock. Pass the value returned by
   * `saveVaultSessionKey` / `tryRestoreVaultFromSession` so a reload cannot extend it.
   */
  setVaultKey: (key: CryptoKey | null, expiresAt?: number) => void;
  /** Clears the in-memory key and the stored key for this user. */
  lockVault: () => void;
};

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const [vaultKey, setVaultKeyState] = useState<CryptoKey | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const lastTouchRef = useRef(0);

  const setVaultKey = useCallback((key: CryptoKey | null, keyExpiresAt?: number) => {
    setVaultKeyState(key);
    setExpiresAt(key ? (keyExpiresAt ?? Date.now() + VAULT_SESSION_MAX_AGE_MS) : null);
  }, []);

  const lockVault = useCallback(() => {
    if (userId) void clearVaultSessionKey(userId);
    setVaultKeyState(null);
    setExpiresAt(null);
  }, [userId]);

  // Idle auto-lock: without it the key stays usable for as long as the tab is open.
  useEffect(() => {
    if (!vaultKey) return;

    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(lockVault, VAULT_IDLE_TIMEOUT_MS);

      // Throttled, so activity does not mean an IndexedDB write per mouse move.
      const now = Date.now();
      if (userId && now - lastTouchRef.current > TOUCH_THROTTLE_MS) {
        lastTouchRef.current = now;
        void touchVaultSessionKey(userId);
      }
    };

    // Stamp the real last-active time on the way out, so a restart resumes from it.
    const onHide = () => {
      if (userId && document.visibilityState === "hidden") {
        lastTouchRef.current = Date.now();
        void touchVaultSessionKey(userId);
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    document.addEventListener("visibilitychange", onHide);
    resetTimer();

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [vaultKey, lockVault, userId]);

  /**
   * Hard ceiling on a single unlock. The idle timer above can be reset indefinitely by
   * staying active, so without this an open tab would never re-ask for the master password.
   */
  useEffect(() => {
    if (!vaultKey || expiresAt === null) return;

    const enforce = () => {
      if (Date.now() >= expiresAt) lockVault();
    };

    // A suspended machine can delay timers past their deadline, so re-check on wake too.
    const timer = setTimeout(enforce, Math.max(expiresAt - Date.now(), 0));
    const onVisible = () => {
      if (document.visibilityState === "visible") enforce();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", enforce);
    enforce();

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", enforce);
    };
  }, [vaultKey, expiresAt, lockVault]);

  const value = useMemo(
    () => ({ vaultKey, setVaultKey, lockVault }),
    [vaultKey, setVaultKey, lockVault],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
