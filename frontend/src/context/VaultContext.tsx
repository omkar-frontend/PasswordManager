import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearVaultSessionKey } from "../lib/vaultSession";

type VaultContextType = {
  vaultKey: CryptoKey | null;
  setVaultKey: (key: CryptoKey | null) => void;
  /** Clears in-memory key and tab session storage for this user (pass `user.id`). */
  lockVault: (userId?: string) => void;
};

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vaultKey, setVaultKeyState] = useState<CryptoKey | null>(null);

  const setVaultKey = useCallback((key: CryptoKey | null) => {
    setVaultKeyState(key);
  }, []);

  const lockVault = useCallback((userId?: string) => {
    if (userId) clearVaultSessionKey(userId);
    setVaultKeyState(null);
  }, []);

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
