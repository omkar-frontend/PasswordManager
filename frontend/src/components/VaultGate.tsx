import { useEffect, useState } from "react";
import axios from "axios";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVault } from "../context/VaultContext";
import type { UserSecurityRow } from "../types/userSecurity";
import { setupMasterPassword } from "../pages/SetupMaster";
import { unlockVault } from "../pages/UnlockVault";
import { saveVaultSessionKey, tryRestoreVaultFromSession } from "../lib/vaultSession";

function backendUrl(): string {
  const url = import.meta.env.VITE_BACKEND_URL;
  if (!url) throw new Error("VITE_BACKEND_URL is not set");
  return url;
}

export default function VaultGate() {
  const { session, loading: authLoading } = useAuth();
  const { vaultKey, setVaultKey } = useVault();
  const [record, setRecord] = useState<UserSecurityRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [vaultSessionReady, setVaultSessionReady] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;

    let cancelled = false;
    setLoadError("");

    axios
      .get<UserSecurityRow | null>(`${backendUrl()}/user-security`)
      .then((res) => {
        if (!cancelled) setRecord(res.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load vault status.");
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session]);

  /** Try sessionStorage-backed key so refresh does not re-prompt (same tab session). */
  useEffect(() => {
    if (authLoading || !session?.user?.id || record === undefined) return;

    if (record === null) {
      setVaultSessionReady(true);
      return;
    }

    if (vaultKey) {
      setVaultSessionReady(true);
      return;
    }

    let cancelled = false;
    setVaultSessionReady(false);

    tryRestoreVaultFromSession(session.user.id, record).then((k) => {
      if (cancelled) return;
      if (k) setVaultKey(k);
      setVaultSessionReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.user?.id, record, vaultKey, setVaultKey]);

  if (authLoading || record === undefined) {
    return (
      <div className="flex h-[calc(100vh-55px)] items-center justify-center bg-theme-bg p-6 text-theme-text">
        <p>Loading...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-theme-text">
        <p className="text-red-500">{loadError}</p>
      </div>
    );
  }

  if (vaultKey) {
    return <Outlet />;
  }

  if (record !== null && !vaultSessionReady) {
    return (
      <div className="flex h-[calc(100vh-55px)] items-center justify-center bg-theme-bg p-6 text-theme-text">
        <p>Restoring vault…</p>
      </div>
    );
  }

  if (record === null) {
    const submitSetup = async () => {
      setFormError("");
      if (setupPassword.length < 8) {
        setFormError("Use at least 8 characters for your master password.");
        return;
      }
      if (setupPassword !== setupConfirm) {
        setFormError("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const key = await setupMasterPassword(setupPassword);
        if (session?.user?.id) await saveVaultSessionKey(session.user.id, key);
        setVaultKey(key);
      } catch (e) {
        const msg = axios.isAxiosError(e) && e.response?.status === 409
          ? "Vault is already set up. Refresh the page."
          : "Could not save vault. Try again.";
        setFormError(msg);
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex justify-center items-center h-[calc(100vh-55px)] bg-theme-bg">  
        <div className=" flex max-w-md flex-col gap-4 p-6 text-theme-text">
          <h1 className="text-xl font-semibold">Create master password</h1>
          <p className="text-sm text-neutral-400">
            This encrypts your vault. It is not your account login password.
          </p>
          {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
          <input
            type="password"
            className="cmn-field-input"
            placeholder="Master password (min 8 characters)"
            value={setupPassword}
            onChange={(e) => setSetupPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="cmn-field-input"
            placeholder="Confirm master password"
            value={setupConfirm}
            onChange={(e) => setSetupConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="button-theme"
            disabled={busy}
            onClick={() => void submitSetup()}
          >
            {busy ? "Saving…" : "Save master password"}
          </button>
        </div>
      </div>
    );
  }

  const submitUnlock = async () => {
    setFormError("");
    if (!unlockPassword) {
      setFormError("Enter your master password.");
      return;
    }
    setBusy(true);
    try {
      const key = await unlockVault(unlockPassword, record);
      if (session?.user?.id) await saveVaultSessionKey(session.user.id, key);
      setVaultKey(key);
    } catch {
      setFormError("Wrong master password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6 text-theme-text">
      <h1 className="text-xl font-semibold">Unlock vault</h1>
      <p className="text-sm text-neutral-400">Enter your master password to continue.</p>
      {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
      <input
        type="password"
        className="cmn-field-input"
        placeholder="Master password"
        value={unlockPassword}
        onChange={(e) => setUnlockPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submitUnlock()}
        autoComplete="current-password"
      />
      <button
        type="button"
        className="button-theme"
        disabled={busy}
        onClick={() => void submitUnlock()}
      >
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </div>
  );
}
