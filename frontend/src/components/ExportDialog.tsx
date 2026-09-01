import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api } from "../lib/api";
import { decrypt } from "../crypto/decrypt";
import { useVault } from "../context/VaultContext";
import { toCsv } from "../lib/csv";
import { downloadFile } from "../lib/download";
import { createBackup, MIN_PASSPHRASE_LENGTH, type BackupPayload } from "../lib/vaultArchive";
import { isFavourite, type AdditionalProperties } from "../lib/itemProperties";

type CategoryRow = { category_id?: string; id?: string; category_name?: string; category_code?: string | null };

type ItemRow = {
  category_item_id: string;
  category_id?: string;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  password_cipher?: string | null;
  password_iv?: string | null;
  username_cipher?: string | null;
  username_iv?: string | null;
  additional_properties?: AdditionalProperties | null;
  created_at?: string | null;
};

type Format = "encrypted" | "csv";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vaultKey } = useVault();
  const [format, setFormat] = useState<Format>("encrypted");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setPassphrase("");
    setConfirmPassphrase("");
    setAcknowledged(false);
    setError("");
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /** Decrypts the whole vault in memory. Nothing is sent anywhere — this is all local. */
  const collect = async (): Promise<{ categories: CategoryRow[]; items: ItemRow[]; plain: Map<string, { username: string; password: string }> }> => {
    const [categoriesRes, itemsRes] = await Promise.all([
      api.get<CategoryRow[]>("/categories"),
      api.get<ItemRow[]>("/category-items"),
    ]);

    const plain = new Map<string, { username: string; password: string }>();
    for (const item of itemsRes.data) {
      let username = "";
      let password = "";
      if (vaultKey) {
        if (item.username_cipher && item.username_iv) {
          try {
            username = await decrypt(item.username_cipher, item.username_iv, vaultKey);
          } catch {
            username = "";
          }
        }
        if (item.password_cipher && item.password_iv) {
          try {
            password = await decrypt(item.password_cipher, item.password_iv, vaultKey);
          } catch {
            password = "";
          }
        }
      }
      plain.set(item.category_item_id, { username, password });
    }

    return { categories: categoriesRes.data, items: itemsRes.data, plain };
  };

  const runExport = async () => {
    setError("");

    if (format === "encrypted") {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters for the passphrase.`);
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError("Passphrases do not match.");
        return;
      }
    } else if (!acknowledged) {
      setError("Confirm you understand the file is unencrypted.");
      return;
    }

    if (!vaultKey) {
      setError("Unlock the vault before exporting.");
      return;
    }

    setBusy(true);
    try {
      const { categories, items, plain } = await collect();
      const nameById = new Map<string, string>();
      for (const category of categories) {
        const id = category.category_id ?? category.id;
        if (id) nameById.set(id, category.category_name ?? "Untitled");
      }

      if (format === "encrypted") {
        const payload: BackupPayload = {
          categories: categories.map((category) => ({
            category_name: category.category_name ?? "Untitled",
            category_code: category.category_code ?? null,
          })),
          items: items.map((item) => {
            const secrets = plain.get(item.category_item_id);
            return {
              category_name: item.category_id ? (nameById.get(item.category_id) ?? "Untitled") : "Untitled",
              title: item.title ?? "Untitled",
              username: secrets?.username || null,
              password: secrets?.password || null,
              url: item.url ?? null,
              description: item.description ?? null,
              favourite: isFavourite(item),
              created_at: item.created_at ?? null,
            };
          }),
        };

        const file = await createBackup(payload, passphrase);
        downloadFile(`shieldx-backup-${today()}.json`, file, "application/json");
        toast.success(`Exported ${payload.items.length} items`);
      } else {
        // Chrome's column set, which Bitwarden and 1Password also accept.
        const rows: string[][] = [["name", "url", "username", "password", "note"]];
        for (const item of items) {
          const secrets = plain.get(item.category_item_id);
          rows.push([
            item.title ?? "Untitled",
            item.url ?? "",
            secrets?.username ?? "",
            secrets?.password ?? "",
            item.description ?? "",
          ]);
        }
        downloadFile(`shieldx-export-${today()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
        toast.success(`Exported ${rows.length - 1} items`);
      }

      reset();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Could not build the export. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const optionClass = (value: Format) =>
    `flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
      format === value
        ? "border-violet-500/50 bg-violet-500/10"
        : "border-hairline bg-surface-2/40 hover:border-neutral-700"
    }`;

  return (
    <Modal
      open={open}
      title="Export vault"
      description="Everything is decrypted and packaged in your browser. Nothing is uploaded."
      icon={<Download className="h-4 w-4" />}
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <button type="button" className="button-ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button-theme"
            onClick={() => void runExport()}
            disabled={busy || !vaultKey}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Exporting…" : "Export"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <label className={optionClass("encrypted")}>
        <input
          type="radio"
          name="export-format"
          className="mt-0.5 cursor-pointer accent-violet-600"
          checked={format === "encrypted"}
          onChange={() => setFormat("encrypted")}
        />
        <span>
          <span className="block text-sm font-medium text-theme-text">Encrypted backup</span>
          <span className="mt-0.5 block text-xs text-theme-muted">
            A .json file only your passphrase can open. Re-importable into ShieldX.
          </span>
        </span>
      </label>

      <label className={optionClass("csv")}>
        <input
          type="radio"
          name="export-format"
          className="mt-0.5 cursor-pointer accent-violet-600"
          checked={format === "csv"}
          onChange={() => setFormat("csv")}
        />
        <span>
          <span className="block text-sm font-medium text-theme-text">Plain CSV</span>
          <span className="mt-0.5 block text-xs text-theme-muted">
            For moving into Chrome, Bitwarden or 1Password. Categories are not preserved.
          </span>
        </span>
      </label>

      {format === "encrypted" ? (
        <>
          <input
            type="password"
            className="cmn-field-input"
            placeholder={`Passphrase (min ${MIN_PASSPHRASE_LENGTH} characters)`}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="cmn-field-input"
            placeholder="Confirm passphrase"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-theme-muted">
            This passphrase is the only way to open the backup. It is not recoverable.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="flex gap-2 text-xs text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Every password will be readable by anyone who opens this file. Delete it as soon
            as you have imported it elsewhere.
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-amber-200">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-amber-500"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I understand this file is not encrypted
          </label>
        </div>
      )}
    </Modal>
  );
}
