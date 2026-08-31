import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Check,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  Trash,
} from "lucide-react";
import { encrypt } from "../crypto/encrypt";
import { decrypt } from "../crypto/decrypt";
import { useVault } from "../context/VaultContext";
import { api } from "../lib/api";
import { copySecret } from "../lib/clipboard";
import NoDataLottie from "@/components/NoDataLottie";
import Modal from "@/components/ui/Modal";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import SearchInput from "@/components/ui/SearchInput";
import TruncatedText from "@/components/ui/TruncatedText";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CategoryItem = {
  category_item_id: string;
  category_id?: string;
  title?: string | null;
  description?: string | null;
  password_cipher?: string | null;
  password_iv?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Layout = "grid" | "list";
type SortKey = "created" | "updated" | "title";

const LAYOUT_KEY = "shieldx_items_layout";
const SORT_STORAGE_KEY = "shieldx_items_sort";
const MASKED = "••••••••••••";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created", label: "Recently added" },
  { value: "updated", label: "Recently updated" },
  { value: "title", label: "Title A–Z" },
];

function readStoredLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function readStoredSort(): SortKey {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.some((o) => o.value === stored) ? (stored as SortKey) : "created";
  } catch {
    return "created";
  }
}

/** Missing timestamps sort last rather than throwing off the comparison. */
function newestFirst(a: string | null | undefined, b: string | null | undefined): number {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
}

function hasEncryptedPassword(item: CategoryItem): boolean {
  return (
    typeof item.password_cipher === "string" &&
    item.password_cipher.trim() !== "" &&
    typeof item.password_iv === "string" &&
    item.password_iv.trim() !== ""
  );
}

/** Reveal/copy behaviour shared by both layouts: decrypt on demand, then cache. */
function useItemPassword(item: CategoryItem, vaultKey: CryptoKey | null) {
  const [revealed, setRevealed] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [decryptErr, setDecryptErr] = useState(false);
  const [copied, setCopied] = useState(false);

  const available = hasEncryptedPassword(item) && vaultKey !== null;

  const getPlain = async (): Promise<string | null> => {
    if (!available || !vaultKey) return null;
    if (plain !== null) return plain;
    try {
      setDecryptErr(false);
      const text = await decrypt(item.password_cipher!, item.password_iv!, vaultKey);
      setPlain(text);
      return text;
    } catch {
      setDecryptErr(true);
      return null;
    }
  };

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if ((await getPlain()) === null) return;
    setRevealed(true);
  };

  const copyPassword = async () => {
    const text = await getPlain();
    if (text === null) return;
    try {
      // copySecret also schedules the clipboard to be wiped shortly afterwards.
      await copySecret(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return {
    available,
    revealed,
    decryptErr,
    copied,
    plain,
    toggleReveal,
    copyPassword,
  };
}

function RevealButton({ revealed, onClick }: { revealed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onClick}
      aria-label={revealed ? "Hide password" : "Show password"}
    >
      {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label="Copy password">
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label="Edit item">
      <Pencil className="h-4 w-4" />
    </button>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button icon-button-danger"
      onClick={onClick}
      aria-label="Delete item"
    >
      <Trash className="h-4 w-4" />
    </button>
  );
}

type ItemViewProps = {
  item: CategoryItem;
  vaultKey: CryptoKey | null;
  highlighted: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function ItemCard({ item, vaultKey, highlighted, onEdit, onDelete }: ItemViewProps) {
  const pw = useItemPassword(item, vaultKey);

  return (
    <li
      id={`item-${item.category_item_id}`}
      className={`card group flex flex-col gap-3 p-4 transition-all hover:border-neutral-700 ${
        highlighted ? "border-violet-500/60 ring-2 ring-violet-500/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TruncatedText
            text={item.title ?? "Untitled"}
            className="font-medium text-theme-text"
          />
          {item.description ? (
            <TruncatedText
              text={item.description}
              className="mt-0.5 text-sm text-theme-muted"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <EditButton onClick={onEdit} />
          <DeleteButton onClick={onDelete} />
        </div>
      </div>

      {/* mt-auto keeps this pinned to the bottom, so cards stay aligned whether or not
          the item has a description. */}
      {pw.available ? (
        <div className="mt-auto flex items-center gap-1 border-t border-hairline pt-3">
          <p
            className={`min-w-0 flex-1 font-mono text-sm break-all ${
              pw.decryptErr
                ? "text-red-400"
                : pw.revealed
                  ? "text-theme-text"
                  : "text-theme-muted"
            }`}
          >
            {pw.revealed ? (pw.decryptErr ? "Could not decrypt" : (pw.plain ?? "…")) : MASKED}
          </p>
          <CopyButton copied={pw.copied} onClick={() => void pw.copyPassword()} />
          <RevealButton revealed={pw.revealed} onClick={() => void pw.toggleReveal()} />
        </div>
      ) : null}
    </li>
  );
}

function ItemRow({ item, vaultKey, highlighted, onEdit, onDelete }: ItemViewProps) {
  const pw = useItemPassword(item, vaultKey);

  return (
    <li
      id={`item-${item.category_item_id}`}
      className={`card flex items-center gap-3 p-3 transition-all hover:border-neutral-700 sm:gap-4 sm:px-4 ${
        highlighted ? "border-violet-500/60 ring-2 ring-violet-500/40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <TruncatedText text={item.title ?? "Untitled"} className="font-medium text-theme-text" />
        {item.description ? (
          <TruncatedText text={item.description} className="mt-0.5 text-sm text-theme-muted" />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {pw.available ? (
          <>
            {pw.revealed && !pw.decryptErr ? (
              /* Width lives on the wrapper: TruncatedText sets max-w-full, which would
                 collide with a max-w-* of its own (Tailwind resolves by CSS order). */
              <div className="mr-1 max-w-[7rem] sm:max-w-[16rem]">
                <TruncatedText
                  text={pw.plain ?? "…"}
                  className="font-mono text-sm text-theme-text"
                  side="top"
                />
              </div>
            ) : (
              <p
                className={`mr-1 font-mono text-sm ${
                  pw.decryptErr ? "text-red-400" : "text-theme-muted"
                }`}
              >
                {pw.decryptErr && pw.revealed ? "Could not decrypt" : MASKED}
              </p>
            )}
            <CopyButton copied={pw.copied} onClick={() => void pw.copyPassword()} />
            <RevealButton revealed={pw.revealed} onClick={() => void pw.toggleReveal()} />
          </>
        ) : null}
        <EditButton onClick={onEdit} />
        <DeleteButton onClick={onDelete} />
      </div>
    </li>
  );
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}) {
  const options: { value: Layout; label: string; Icon: typeof LayoutGrid }[] = [
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
    { value: "list", label: "List view", Icon: List },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-hairline bg-surface-2/50 p-1">
      {options.map(({ value, label, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`cursor-pointer rounded-lg p-1.5 transition-colors ${
                layout === value
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-theme-muted hover:bg-white/[0.06] hover:text-theme-text"
              }`}
              onClick={() => onChange(value)}
              aria-label={label}
              aria-pressed={layout === value}
            >
              <Icon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function SortMenu({ sort, onChange }: { sort: SortKey; onChange: (sort: SortKey) => void }) {
  const active = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="button-ghost shrink-0 px-3" aria-label="Sort items">
          <ArrowDownUp className="h-4 w-4 text-theme-muted" />
          <span className="hidden sm:inline">{active.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-52 border-hairline bg-surface p-1.5">
        <div className="flex flex-col gap-1">
          {SORT_OPTIONS.map((option) => (
            <PopoverClose asChild key={option.value}>
              <button
                type="button"
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-white/[0.06] ${
                  option.value === sort ? "text-violet-300" : "text-theme-text"
                }`}
                onClick={() => onChange(option.value)}
              >
                {option.label}
                {option.value === sort ? <Check className="h-4 w-4" /> : null}
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ItemSkeleton({ layout }: { layout: Layout }) {
  if (layout === "list") {
    return (
      <li className="card flex items-center gap-4 p-3 sm:px-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-4 w-24" />
      </li>
    );
  }

  return (
    <li className="card p-4">
      <div className="space-y-2">
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton mt-4 h-4 w-2/3" />
      </div>
    </li>
  );
}

export default function CategoryItems() {
  const { id: categoryId } = useParams<{ id: string }>();
  const { categoryName, highlightItemId } =
    (useLocation().state as { categoryName?: string; highlightItemId?: string } | null) ?? {};
  const { vaultKey } = useVault();
  const [shieldItems, setShieldItems] = useState<CategoryItem[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [form, setForm] = useState({ title: "", password: "", description: "" });
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<CategoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>(readStoredLayout);
  const [sort, setSort] = useState<SortKey>(readStoredSort);
  // Set when arriving from a vault-wide search result, to point out the item that matched.
  const [highlighted, setHighlighted] = useState<string | null>(highlightItemId ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layout);
      localStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {
      // A rejected write only means the choice does not persist.
    }
  }, [layout, sort]);

  // Title and notes only: passwords are ciphertext, so they are not searchable.
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const matched = !normalizedQuery
      ? shieldItems
      : shieldItems.filter((item) =>
          `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase().includes(normalizedQuery),
        );

    // Copy before sorting: Array.sort mutates, and shieldItems is state.
    const sorted = [...matched];
    if (sort === "title") {
      sorted.sort((a, b) => {
        // Untitled last, matching how missing timestamps are treated.
        const left = (a.title ?? "").trim();
        const right = (b.title ?? "").trim();
        if (!left) return right ? 1 : 0;
        if (!right) return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      });
    } else if (sort === "updated") {
      sorted.sort((a, b) => newestFirst(a.updated_at, b.updated_at));
    } else {
      sorted.sort((a, b) => newestFirst(a.created_at, b.created_at));
    }
    return sorted;
  }, [shieldItems, normalizedQuery, sort]);

  const fetchShieldItems = async () => {
    if (!categoryId) {
      setShieldItems([]);
      setCompLoading(false);
      return;
    }
    setCompLoading(true);
    try {
      const res = await api.get<CategoryItem[]>("/category-items", {
        params: { category_id: categoryId },
      });
      setShieldItems(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load items");
    } finally {
      setCompLoading(false);
    }
  };

  useEffect(() => {
    void fetchShieldItems();
  }, [categoryId]);

  useEffect(() => {
    if (!highlighted || compLoading) return;

    document
      .getElementById(`item-${highlighted}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = setTimeout(() => setHighlighted(null), 2500);
    return () => clearTimeout(timer);
  }, [highlighted, compLoading]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setForm({ title: "", password: "", description: "" });
    setShowFormPassword(false);
    setClearPassword(false);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({ title: "", password: "", description: "" });
    setShowFormPassword(false);
    setClearPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (item: CategoryItem) => {
    setEditingItem(item);
    setForm({
      title: item.title ?? "",
      password: "",
      description: item.description ?? "",
    });
    setShowFormPassword(false);
    setClearPassword(false);
    setIsModalOpen(true);
  };

  const handleSaveItem = async () => {
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle || !categoryId || !vaultKey) return;

    setCreateLoading(true);
    try {
      const trimmedPwd = clearPassword ? "" : form.password.trim();
      let password_cipher: string | null = null;
      let password_iv: string | null = null;

      if (trimmedPwd !== "") {
        const { cipher, iv } = await encrypt(trimmedPwd, vaultKey);
        password_cipher = cipher;
        password_iv = iv;
      }

      if (editingItem) {
        const body: Record<string, unknown> = {
          title: trimmedTitle,
          description: form.description,
        };
        if (clearPassword) {
          // Explicit nulls tell the backend to drop the stored password.
          body.password_cipher = null;
          body.password_iv = null;
        } else if (password_cipher && password_iv) {
          body.password_cipher = password_cipher;
          body.password_iv = password_iv;
        }
        await api.put(`/category-items/${editingItem.category_item_id}`, body);
      } else {
        await api.post("/category-items", {
          category_id: categoryId,
          title: trimmedTitle,
          password_cipher,
          password_iv,
          description: form.description,
        });
      }

      closeModal();
      toast.success(editingItem ? "Item updated" : "Item created");
      await fetchShieldItems();
    } catch (err) {
      console.error(err);
      toast.error(
        editingItem
          ? "Could not save item. Please try again."
          : "Could not create item. Please try again.",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteConfirmItem(null);
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirmItem?.category_item_id) return;

    setDeleteLoading(true);
    try {
      await api.delete(`/category-items/${deleteConfirmItem.category_item_id}`);
      toast.success("Item deleted");
      setDeleteConfirmItem(null);
      await fetchShieldItems();
    } catch (err) {
      console.error(err);
      toast.error("Could not delete item. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!categoryId) {
    return (
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <p className="text-theme-muted">Missing category.</p>
      </div>
    );
  }

  const ItemView = layout === "list" ? ItemRow : ItemCard;
  const listClassName =
    layout === "list"
      ? "flex flex-col gap-2"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* Inline with the title rather than on its own row, to save vertical space. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="icon-button -ml-2 shrink-0"
                  onClick={() => navigate(-1)}
                  aria-label="Back to vault"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to vault</TooltipContent>
            </Tooltip>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-theme-text">
                {categoryName || "Category"}
              </h1>
              <p className="mt-1 text-sm text-theme-muted">
                {compLoading
                  ? "Loading items…"
                  : normalizedQuery
                    ? `${visibleItems.length} of ${shieldItems.length} items`
                    : shieldItems.length === 1
                      ? "1 item"
                      : `${shieldItems.length} items`}
              </p>
            </div>
          </div>
          <button type="button" className="button-theme" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Add item
          </button>
        </div>

        {!compLoading && shieldItems.length > 0 ? (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by title or notes"
              hotkeyEnabled={!isModalOpen && deleteConfirmItem === null}
            />
            <div className="ml-auto flex items-center gap-2">
              <SortMenu sort={sort} onChange={setSort} />
              <LayoutToggle layout={layout} onChange={setLayout} />
            </div>
          </div>
        ) : null}

        {compLoading ? (
          <ul className={listClassName}>
            {Array.from({ length: layout === "list" ? 5 : 6 }).map((_, i) => (
              <ItemSkeleton key={i} layout={layout} />
            ))}
          </ul>
        ) : shieldItems.length > 0 && visibleItems.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="icon-tile h-12 w-12">
              <SearchX className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-theme-text">No items match your search</p>
              <p className="mt-1 text-sm text-theme-muted">
                Nothing found for &ldquo;{query.trim()}&rdquo;. Saved passwords are encrypted, so
                only titles and notes are searchable.
              </p>
            </div>
            <button type="button" className="button-ghost mt-2" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : shieldItems.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <NoDataLottie />
            <div>
              <p className="font-medium text-theme-text">Nothing saved here yet</p>
              <p className="mt-1 text-sm text-theme-muted">
                Add your first credential — passwords are encrypted before they leave this device.
              </p>
            </div>
            <button type="button" className="button-theme mt-2" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>
        ) : (
          <ul className={listClassName}>
            {visibleItems.map((item) => (
              <ItemView
                key={item.category_item_id}
                item={item}
                vaultKey={vaultKey}
                highlighted={highlighted === item.category_item_id}
                onEdit={() => openEditModal(item)}
                onDelete={() => setDeleteConfirmItem(item)}
              />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={isModalOpen}
        title={editingItem ? "Edit item" : "New item"}
        description={
          editingItem
            ? "Leave the password blank to keep the current one."
            : "The password is encrypted in your browser before it is saved."
        }
        icon={<KeyRound className="h-4 w-4" />}
        onClose={closeModal}
        closeDisabled={createLoading}
        footer={
          <>
            <button
              type="button"
              className="button-ghost"
              onClick={closeModal}
              disabled={createLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-theme"
              onClick={() => void handleSaveItem()}
              disabled={createLoading || !form.title.trim() || !vaultKey}
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {createLoading ? "Saving…" : editingItem ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <input
          id="shield-item-title"
          type="text"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          className="cmn-field-input"
          placeholder="Title"
          autoComplete="off"
          autoFocus
          required
        />
        <div className="relative">
          <input
            id="shield-item-password"
            type={showFormPassword ? "text" : "password"}
            value={clearPassword ? "" : form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="cmn-field-input pr-12"
            placeholder={editingItem ? "New password (leave blank to keep)" : "Password"}
            autoComplete="new-password"
            disabled={clearPassword}
          />
          <button
            type="button"
            className="icon-button absolute top-1/2 right-1.5 -translate-y-1/2"
            onClick={() => setShowFormPassword((s) => !s)}
            aria-label={showFormPassword ? "Hide password" : "Show password"}
            disabled={clearPassword}
          >
            {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {editingItem && hasEncryptedPassword(editingItem) ? (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-theme-muted transition-colors hover:text-theme-text">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-violet-600"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
            />
            Remove the saved password
          </label>
        ) : null}
        <textarea
          id="shield-item-description"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          className="cmn-field-input resize-none"
          placeholder="Notes (optional)"
          rows={3}
        />
      </Modal>

      <Modal
        open={deleteConfirmItem !== null}
        title="Delete item"
        description={`Delete "${deleteConfirmItem?.title ?? "this item"}"? This cannot be undone.`}
        icon={<Trash className="h-4 w-4" />}
        onClose={closeDeleteModal}
        closeDisabled={deleteLoading}
        footer={
          <>
            <button
              type="button"
              className="button-ghost"
              onClick={closeDeleteModal}
              disabled={deleteLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => void confirmDeleteItem()}
              disabled={deleteLoading}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {deleteLoading ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      />
    </>
  );
}
