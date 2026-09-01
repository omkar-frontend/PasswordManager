import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api } from "../lib/api";
import { encrypt } from "../crypto/encrypt";
import { useVault } from "../context/VaultContext";
import { matchColumns, parseCsv } from "../lib/csv";
import { readBackup, WrongPassphraseError, type BackupItem } from "../lib/vaultArchive";

type CategoryRow = { category_id?: string; id?: string; category_name?: string };

/** Header names used by Chrome, Bitwarden, 1Password, LastPass and Safari exports. */
const COLUMN_ALIASES: Record<string, string[]> = {
  title: ["name", "title", "account", "item name", "login_name", "display name"],
  url: ["url", "urls", "website", "web site", "login_uri", "login uri"],
  username: ["username", "user name", "login_username", "login username", "email", "e-mail"],
  password: ["password", "login_password", "login password"],
  note: ["note", "notes", "comments", "extra"],
};

type Staged = { rows: BackupItem[]; source: "csv" | "backup" };

export default function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { vaultKey } = useVault();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rawBackup, setRawBackup] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setFileName("");
    setRawBackup(null);
    setPassphrase("");
    setStaged(null);
    setTarget("");
    setProgress(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const loadCategories = async () => {
    try {
      const res = await api.get<CategoryRow[]>("/categories");
      setCategories(res.data);
      const first = res.data[0];
      if (first) setTarget(first.category_id ?? first.id ?? "");
    } catch (err) {
      console.error(err);
      setCategories([]);
    }
  };

  const onFile = async (file: File) => {
    setError("");
    setStaged(null);
    setRawBackup(null);
    setFileName(file.name);

    const text = await file.text();

    if (file.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{")) {
      // Backups carry their own categories, so no destination is needed.
      setRawBackup(text);
      return;
    }

    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("That file has no rows to import.");
      return;
    }

    const columns = matchColumns(rows[0], COLUMN_ALIASES);
    if (columns.title === undefined && columns.password === undefined) {
      setError("Could not find a name or password column in that file.");
      return;
    }

    const cell = (row: string[], index?: number) =>
      index === undefined ? "" : (row[index] ?? "").trim();

    const items: BackupItem[] = rows.slice(1).map((row) => ({
      category_name: "",
      title: cell(row, columns.title) || "Untitled",
      username: cell(row, columns.username) || null,
      password: cell(row, columns.password) || null,
      url: cell(row, columns.url) || null,
      description: cell(row, columns.note) || null,
    }));

    setStaged({ rows: items, source: "csv" });
    if (categories === null) void loadCategories();
  };

  const unlockBackup = async () => {
    if (!rawBackup) return;
    setError("");
    setBusy(true);
    try {
      const payload = await readBackup(rawBackup, passphrase);
      setStaged({ rows: payload.items, source: "backup" });
      if (categories === null) void loadCategories();
    } catch (err) {
      setError(
        err instanceof WrongPassphraseError
          ? "Wrong passphrase for this backup."
          : err instanceof Error
            ? err.message
            : "Could not read that backup.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Creates any category named in a backup that does not exist yet, and maps name → id. */
  const resolveCategories = async (names: string[]): Promise<Map<string, string>> => {
    const existing = categories ?? [];
    const byName = new Map<string, string>();
    for (const category of existing) {
      const id = category.category_id ?? category.id;
      if (id && category.category_name) byName.set(category.category_name.toLowerCase(), id);
    }

    for (const name of new Set(names.filter(Boolean))) {
      if (byName.has(name.toLowerCase())) continue;
      const code = `${name.toUpperCase().slice(0, 4).padEnd(4, "X")}IMPORT`;
      const res = await api.post<{ category_id?: string }>("/categories", { code, name });
      if (res.data?.category_id) byName.set(name.toLowerCase(), res.data.category_id);
    }

    return byName;
  };

  const runImport = async () => {
    if (!staged || !vaultKey) return;
    setError("");
    setBusy(true);
    setProgress({ done: 0, total: staged.rows.length });

    try {
      let nameToId = new Map<string, string>();
      if (staged.source === "backup") {
        nameToId = await resolveCategories(staged.rows.map((row) => row.category_name));
      }

      let succeeded = 0;
      let failed = 0;
      const total = staged.rows.length;

      for (const row of staged.rows) {
        const categoryId =
          staged.source === "backup"
            ? (nameToId.get((row.category_name || "").toLowerCase()) ?? target)
            : target;

        if (!categoryId) {
          failed++;
        } else {
          try {
            const password = row.password ? await encrypt(row.password, vaultKey) : null;
            const username = row.username ? await encrypt(row.username, vaultKey) : null;

            await api.post("/category-items", {
              category_id: categoryId,
              title: row.title || "Untitled",
              password_cipher: password?.cipher ?? null,
              password_iv: password?.iv ?? null,
              username_cipher: username?.cipher ?? null,
              username_iv: username?.iv ?? null,
              // A malformed URL must not abort the whole import.
              url: row.url && /^https?:\/\//i.test(row.url) ? row.url : "",
              description: row.description ?? "",
            });
            succeeded++;
          } catch (err) {
            console.error("import row failed", err);
            failed++;
          }
        }

        // Progress counts every row attempted, so it always reaches the total.
        setProgress({ done: succeeded + failed, total });
      }

      const imported = succeeded;
      if (imported > 0) toast.success(`Imported ${imported} item${imported === 1 ? "" : "s"}`);
      if (failed > 0) toast.error(`${failed} item${failed === 1 ? "" : "s"} could not be imported`);

      onImported();
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Import failed. Some items may already have been added.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const needsTarget = staged?.source === "csv";
  const canImport = Boolean(staged && vaultKey && (!needsTarget || target));

  return (
    <Modal
      open={open}
      title="Import items"
      description="Passwords are encrypted in your browser before anything is saved."
      icon={<Upload className="h-4 w-4" />}
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <button type="button" className="button-ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          {rawBackup && !staged ? (
            <button
              type="button"
              className="button-theme"
              onClick={() => void unlockBackup()}
              disabled={busy || !passphrase}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Opening…" : "Open backup"}
            </button>
          ) : (
            <button
              type="button"
              className="button-theme"
              onClick={() => void runImport()}
              disabled={busy || !canImport}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy && progress
                ? `Importing ${progress.done}/${progress.total}…`
                : staged
                  ? `Import ${staged.rows.length} item${staged.rows.length === 1 ? "" : "s"}`
                  : "Import"}
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

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="cmn-field-input cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-violet-500/20 file:px-2 file:py-1 file:text-sm file:text-violet-200"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
          disabled={busy}
        />
        <p className="mt-2 text-xs text-theme-muted">
          A ShieldX backup (.json), or a CSV exported from Chrome, Bitwarden or 1Password.
        </p>
      </div>

      {rawBackup && !staged ? (
        <input
          type="password"
          className="cmn-field-input"
          placeholder="Backup passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void unlockBackup()}
          autoComplete="off"
          autoFocus
        />
      ) : null}

      {staged ? (
        <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
          <p className="text-sm text-theme-text">
            {staged.rows.length} item{staged.rows.length === 1 ? "" : "s"} found in{" "}
            <span className="text-theme-muted">{fileName}</span>
          </p>
          {staged.source === "backup" ? (
            <p className="mt-1 text-xs text-theme-muted">
              Categories from the backup will be recreated if they are missing.
            </p>
          ) : null}
        </div>
      ) : null}

      {needsTarget ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-category" className="text-xs text-theme-muted">
            Import into
          </label>
          <select
            id="import-category"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="cmn-field-input cursor-pointer"
            disabled={categories === null || busy}
          >
            {categories === null ? (
              <option value="">Loading categories…</option>
            ) : categories.length === 0 ? (
              <option value="">Create a category first</option>
            ) : (
              categories.map((category) => {
                const value = category.category_id ?? category.id ?? "";
                return (
                  <option key={value} value={value}>
                    {category.category_name ?? "Untitled"}
                  </option>
                );
              })
            )}
          </select>
        </div>
      ) : null}
    </Modal>
  );
}
