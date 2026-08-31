import { useEffect, useState, type ReactNode } from "react";
import axios from "axios";
import { Outlet } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useVault } from "../context/VaultContext";
import type { UserSecurityRow } from "../types/userSecurity";
import { setupMasterPassword } from "../pages/SetupMaster";
import { unlockVault } from "../pages/UnlockVault";
import {
  saveVaultSessionKey,
  tryRestoreVaultFromSession,
  VAULT_SESSION_MAX_AGE_MS,
} from "../lib/vaultSession";

/** Shared frame for the full-height states this gate renders. */
function GateScreen({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10">
      <div className="ambient-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

function GateSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
    </div>
  );
}

/** Password field with a working show/hide toggle. */
function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className="cmn-field-input pr-12"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
      <button
        type="button"
        className="icon-button absolute top-1/2 right-1.5 -translate-y-1/2"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
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
  const [fetchAttempt, setFetchAttempt] = useState(0);

  /** Stores the key when we know the user, and returns the deadline to enforce either way. */
  const persistKey = async (key: CryptoKey): Promise<number> => {
    const userId = session?.user?.id;
    if (userId) return saveVaultSessionKey(userId, key);
    return Date.now() + VAULT_SESSION_MAX_AGE_MS;
  };

  useEffect(() => {
    if (authLoading || !session) return;

    let cancelled = false;
    setLoadError("");

    api
      .get<UserSecurityRow | null>("/user-security")
      .then((res) => {
        if (!cancelled) setRecord(res.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load vault status.");
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, fetchAttempt]);

  /** Restore the stored key so a refresh does not re-prompt. */
  useEffect(() => {
    if (authLoading || !session?.user?.id || record === undefined) return;

    if (record === null || vaultKey) {
      setVaultSessionReady(true);
      return;
    }

    let cancelled = false;
    setVaultSessionReady(false);

    tryRestoreVaultFromSession(session.user.id, record).then((restored) => {
      if (cancelled) return;
      if (restored) setVaultKey(restored.key, restored.expiresAt);
      setVaultSessionReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.user?.id, record, vaultKey, setVaultKey]);

  if (authLoading || record === undefined) {
    return <GateSpinner />;
  }

  if (loadError) {
    return (
      <GateScreen>
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <ShieldAlert className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-theme-text">{loadError}</p>
            <p className="mt-1 text-sm text-theme-muted">
              The vault service may be unreachable. Check your connection and try again.
            </p>
          </div>
          <button
            type="button"
            className="button-theme"
            onClick={() => setFetchAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      </GateScreen>
    );
  }

  if (vaultKey) {
    return <Outlet />;
  }

  if (record !== null && !vaultSessionReady) {
    return <GateSpinner />;
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
        setVaultKey(key, await persistKey(key));
      } catch (e) {
        setFormError(
          axios.isAxiosError(e) && e.response?.status === 409
            ? "Vault is already set up. Refresh the page."
            : "Could not save vault. Try again.",
        );
      } finally {
        setBusy(false);
      }
    };

    return (
      <GateScreen>
        <div className="card p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="icon-tile mb-4 h-12 w-12">
              <KeyRound className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-theme-text">
              Create master password
            </h1>
            <p className="mt-1.5 text-sm text-theme-muted">
              This encrypts your vault and never leaves your device. It is not your account
              login password, and it cannot be recovered.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {formError ? (
              <p className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {formError}
              </p>
            ) : null}
            <PasswordField
              value={setupPassword}
              onChange={setSetupPassword}
              placeholder="Master password (min 8 characters)"
              autoComplete="new-password"
              autoFocus
            />
            <PasswordField
              value={setupConfirm}
              onChange={setSetupConfirm}
              placeholder="Confirm master password"
              autoComplete="new-password"
              onEnter={() => void submitSetup()}
            />
            <button
              type="button"
              className="button-theme mt-2 w-full py-2.5"
              disabled={busy}
              onClick={() => void submitSetup()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Saving…" : "Save master password"}
            </button>
          </div>
        </div>
      </GateScreen>
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
      setVaultKey(key, await persistKey(key));
    } catch {
      setFormError("Wrong master password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GateScreen>
      <div className="card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="icon-tile mb-4 h-12 w-12">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-theme-text">Unlock vault</h1>
          <p className="mt-1.5 text-sm text-theme-muted">
            Enter your master password to decrypt your passwords.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {formError ? (
            <p className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </p>
          ) : null}
          <PasswordField
            value={unlockPassword}
            onChange={setUnlockPassword}
            placeholder="Master password"
            autoComplete="current-password"
            onEnter={() => void submitUnlock()}
            autoFocus
          />
          <button
            type="button"
            className="button-theme mt-2 w-full py-2.5"
            disabled={busy}
            onClick={() => void submitUnlock()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </div>
    </GateScreen>
  );
}
