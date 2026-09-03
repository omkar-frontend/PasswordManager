import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Loader2, TriangleAlert } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { UserSecurityRow } from "../types/userSecurity";
import {
  BiometricCancelledError,
  BiometricUnsupportedError,
  disableBiometric,
  enrolBiometric,
  isBiometricAvailable,
  isBiometricEnrolled,
} from "../lib/biometricUnlock";

export default function BiometricDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const userId = user?.id;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    (async () => {
      const [supported, already] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnrolled(userId),
      ]);
      if (cancelled) return;
      setAvailable(supported);
      setEnrolled(already);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const close = () => {
    if (busy) return;
    setPassword("");
    setError("");
    onClose();
  };

  const enable = async () => {
    if (!userId) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.get<UserSecurityRow | null>("/user-security");
      if (!res.data) {
        setError("Set up your master password first.");
        return;
      }
      await enrolBiometric(userId, user?.email ?? "ShieldX vault", password, res.data);
      setEnrolled(true);
      setPassword("");
      toast.success("Fingerprint unlock enabled on this device");
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      if (err instanceof BiometricCancelledError) setError("Fingerprint check was cancelled.");
      else if (err instanceof BiometricUnsupportedError) setError(err.message);
      else setError("Wrong master password.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await disableBiometric(userId);
      setEnrolled(false);
      toast.success("Fingerprint unlock removed from this device");
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Fingerprint unlock"
      description="Unlock this vault with your device's fingerprint or face instead of typing the master password."
      icon={<Fingerprint className="h-4 w-4" />}
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <button type="button" className="button-ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          {enrolled ? (
            <button
              type="button"
              className="button-danger"
              onClick={() => void disable()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Turn off
            </button>
          ) : (
            <button
              type="button"
              className="button-theme"
              onClick={() => void enable()}
              disabled={busy || !available || !password}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Enrolling…" : "Turn on"}
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {available === null ? (
        <div className="flex items-center gap-2 text-sm text-theme-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking this device…
        </div>
      ) : !available ? (
        <p className="text-sm text-theme-muted">
          This device has no built-in fingerprint or face sensor available to the browser.
        </p>
      ) : enrolled ? (
        <p className="text-sm text-theme-muted">
          Fingerprint unlock is on for this device. Turning it off removes the stored key;
          your master password keeps working.
        </p>
      ) : (
        <>
          <input
            type="password"
            className="cmn-field-input"
            placeholder="Master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void enable()}
            autoComplete="current-password"
            autoFocus
          />
          <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Anyone whose fingerprint or face this device accepts will be able to open your
            vault. Enable it only on a device that is yours alone.
          </p>
        </>
      )}
    </Modal>
  );
}
