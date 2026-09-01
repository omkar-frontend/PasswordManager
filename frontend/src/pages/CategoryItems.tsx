import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Check,
  ChevronLeft,
  Copy,
  EllipsisVertical,
  FolderInput,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  SearchX,
  Star,
  Trash,
  User,
} from "lucide-react";
import { encrypt } from "../crypto/encrypt";
import { decrypt } from "../crypto/decrypt";
import { useVault } from "../context/VaultContext";
import { api } from "../lib/api";
import { copySecret } from "../lib/clipboard";
import { relativeDays } from "../lib/relativeTime";
import {
  isFavourite,
  mergeProperties,
  type AdditionalProperties,
} from "../lib/itemProperties";
import NoDataLottie from "@/components/NoDataLottie";
import Modal from "@/components/ui/Modal";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import PasswordGenerator from "@/components/ui/PasswordGenerator";
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
  username_cipher?: string | null;
  username_iv?: string | null;
  url?: string | null;
  additional_properties?: AdditionalProperties | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

type CategoryOption = { category_id?: string; id?: string; category_name?: string };

type Layout = "grid" | "list";
type SortKey = "created" | "updated" | "title";

/** Mirrors TRASH_RETENTION_DAYS on the server. */
const TRASH_RETENTION_DAYS = 30;

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

/** Only http(s) is ever rendered as a link; the backend enforces the same rule on write. */
function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Accepts "github.com" and turns it into a URL the backend will accept. */
function normalizeUrlInput(value: string): string {
  const text = value.trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
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

/** Cards are clickable to edit, so every control inside one must swallow its own click. */
function stopClick(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    handler();
  };
}

function RevealButton({ revealed, onClick }: { revealed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={stopClick(onClick)}
      aria-label={revealed ? "Hide password" : "Show password"}
    >
      {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={stopClick(onClick)}
      aria-label="Copy password"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** Move / favourite / delete. Edit is absent: clicking the card itself does that. */
function ItemMenu({
  favourite,
  onMove,
  onToggleFavourite,
  onDelete,
}: {
  favourite: boolean;
  onMove: () => void;
  onToggleFavourite: () => void;
  onDelete: () => void;
}) {
  const entry =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="icon-button"
          aria-label="Item options"
          onClick={(e) => e.stopPropagation()}
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-60 p-1.5">
        {/* PopoverClose so the menu cannot linger behind the dialog it opens. */}
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <PopoverClose asChild>
            <button
              type="button"
              className={`${entry} text-theme-text hover:bg-white/[0.06]`}
              onClick={stopClick(onMove)}
            >
              <FolderInput className="h-4 w-4 text-theme-muted" />
              Move to category
            </button>
          </PopoverClose>
          <PopoverClose asChild>
            <button
              type="button"
              className={`${entry} text-theme-text hover:bg-white/6 text-nowrap`}
              onClick={stopClick(onToggleFavourite)}
            >
              <Star
                className={`h-4 w-4 ${favourite ? "text-amber-400" : "text-theme-muted"}`}
                fill={favourite ? "currentColor" : "none"}
              />
              {favourite ? "Remove from favourites" : "Add to favourites"}
            </button>
          </PopoverClose>
          <PopoverClose asChild>
            <button
              type="button"
              className={`${entry} text-red-300 hover:bg-red-500/10`}
              onClick={stopClick(onDelete)}
            >
              <Trash className="h-4 w-4" />
              Delete
            </button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ItemViewProps = {
  item: CategoryItem;
  vaultKey: CryptoKey | null;
  /** Already decrypted by the page, so every card does not repeat the work. */
  username?: string;
  highlighted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavourite: () => void;
  onMove: () => void;
};

function UsernameLine({ username, compact = false }: { username: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(username);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className={`flex min-w-0 items-center gap-1 ${compact ? "" : "mt-0.5"}`}>
      <User className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
      <TruncatedText text={username} className="text-sm text-theme-muted" />
      {/* opacity-60 rather than 0: touch devices have no hover state to reveal it. */}
      <button
        type="button"
        className="icon-button -my-1 p-1 opacity-60 transition-opacity group-hover:opacity-100"
        onClick={(e) => void copy(e)}
        aria-label="Copy username"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function UrlLink({ url, iconOnly = false }: { url: string; iconOnly?: boolean }) {
  const href = safeHref(url);
  if (!href) return null;

  const label = href.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            iconOnly
              ? "icon-button"
              : "mt-0.5 flex min-w-0 items-center gap-1 text-sm text-violet-400 transition-colors hover:text-violet-300"
          }
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${label}`}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          {iconOnly ? null : <span className="truncate">{label}</span>}
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">{href}</TooltipContent>
    </Tooltip>
  );
}

/** A clickable card is not a button, so focus and Enter/Space have to be added back. */
function cardActivationProps(onEdit: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onEdit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onEdit();
      }
    },
  };
}

function ItemCard({
  item,
  vaultKey,
  username,
  highlighted,
  onEdit,
  onDelete,
  onToggleFavourite,
  onMove,
}: ItemViewProps) {
  const pw = useItemPassword(item, vaultKey);

  return (
    <li
      id={`item-${item.category_item_id}`}
      {...cardActivationProps(onEdit)}
      aria-label={`Edit ${item.title ?? "item"}`}
      className={`card group flex cursor-pointer flex-col gap-3 p-4 transition-all hover:border-neutral-700 focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:outline-none ${
        highlighted ? "border-violet-500/60 ring-2 ring-violet-500/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {isFavourite(item) ? (
              <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="currentColor" />
            ) : null}
            <TruncatedText
              text={item.title ?? "Untitled"}
              className="font-medium text-theme-text"
            />
          </div>
          {username ? <UsernameLine username={username} /> : null}
          {item.description ? (
            <TruncatedText
              text={item.description}
              className="mt-0.5 text-sm text-theme-muted"
            />
          ) : null}
          {item.url ? <UrlLink url={item.url} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <ItemMenu
            favourite={isFavourite(item)}
            onMove={onMove}
            onToggleFavourite={onToggleFavourite}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* mt-auto keeps this pinned to the bottom, so cards stay aligned whether or not
          the item has a description. */}
      <p className="mt-auto text-xs text-neutral-600">Updated {relativeDays(item.updated_at)}</p>

      {pw.available ? (
        <div className="flex items-center gap-1 border-t border-hairline pt-3">
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

function ItemRow({
  item,
  vaultKey,
  username,
  highlighted,
  onEdit,
  onDelete,
  onToggleFavourite,
  onMove,
}: ItemViewProps) {
  const pw = useItemPassword(item, vaultKey);
  // One secondary line only, to keep rows compact.
  const secondary = [username, item.description].filter(Boolean).join("  ·  ");

  return (
    <li
      id={`item-${item.category_item_id}`}
      {...cardActivationProps(onEdit)}
      aria-label={`Edit ${item.title ?? "item"}`}
      className={`card group flex cursor-pointer items-center gap-3 p-3 transition-all hover:border-neutral-700 focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:outline-none sm:gap-4 sm:px-4 ${
        highlighted ? "border-violet-500/60 ring-2 ring-violet-500/40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {isFavourite(item) ? (
            <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="currentColor" />
          ) : null}
          <TruncatedText text={item.title ?? "Untitled"} className="font-medium text-theme-text" />
        </div>
        {secondary ? (
          <TruncatedText text={secondary} className="mt-0.5 text-sm text-theme-muted" />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <span className="mr-2 hidden text-xs whitespace-nowrap text-neutral-600 lg:inline">
          {relativeDays(item.updated_at)}
        </span>
        {item.url ? <UrlLink url={item.url} iconOnly /> : null}
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
        <ItemMenu
          favourite={isFavourite(item)}
          onMove={onMove}
          onToggleFavourite={onToggleFavourite}
          onDelete={onDelete}
        />
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
      <PopoverContent side="bottom" align="end" className="w-52 p-1.5">
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
  const [form, setForm] = useState({
    title: "",
    username: "",
    password: "",
    url: "",
    description: "",
  });
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<CategoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [query, setQuery] = useState("");
  /** Usernames are encrypted at rest but shown by default, so they decrypt on load. */
  const [usernames, setUsernames] = useState<Map<string, string>>(new Map());
  /** Destinations for the move dropdown; fetched the first time an item is edited. */
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[] | null>(null);
  const categoriesRequested = useRef(false);
  const [moveItem, setMoveItem] = useState<CategoryItem | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveLoading, setMoveLoading] = useState(false);
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
          `${item.title ?? ""} ${usernames.get(item.category_item_id) ?? ""} ${item.description ?? ""} ${item.url ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery),
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
    // Favourites pin to the top of whichever ordering is active, rather than being a
    // sort mode of their own. Array.prototype.sort is stable, so ties keep the order above.
    return sorted.sort((a, b) => Number(isFavourite(b)) - Number(isFavourite(a)));
  }, [shieldItems, normalizedQuery, sort, usernames]);

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
    let cancelled = false;

    // Every setState here is post-await, so this never cascades a synchronous render.
    (async () => {
      const next = new Map<string, string>();
      if (vaultKey) {
        for (const item of shieldItems) {
          if (!item.username_cipher || !item.username_iv) continue;
          try {
            next.set(
              item.category_item_id,
              await decrypt(item.username_cipher, item.username_iv, vaultKey),
            );
          } catch {
            // A username that will not decrypt is simply not shown.
          }
        }
      }
      if (!cancelled) setUsernames(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [shieldItems, vaultKey]);

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
    setForm({ title: "", username: "", password: "", url: "", description: "" });
    setShowFormPassword(false);
    setClearPassword(false);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({ title: "", username: "", password: "", url: "", description: "" });
    setShowFormPassword(false);
    setClearPassword(false);
    setIsModalOpen(true);
  };

  /** Only needed for the move dropdown, so it is not fetched until an item is edited. */
  const ensureCategoryOptions = async () => {
    if (categoriesRequested.current) return;
    categoriesRequested.current = true;
    try {
      const res = await api.get<CategoryOption[]>("/categories");
      setCategoryOptions(res.data);
    } catch (err) {
      console.error(err);
      categoriesRequested.current = false;
      setCategoryOptions([]);
    }
  };

  const openEditModal = (item: CategoryItem) => {
    setEditingItem(item);
    setForm({
      title: item.title ?? "",
      // Prefilled, unlike the password: an empty username field means "remove it".
      username: usernames.get(item.category_item_id) ?? "",
      password: "",
      url: item.url ?? "",
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

      // The username is encrypted the same way the password is; clearing the field
      // sends explicit nulls so the stored value is removed rather than kept.
      const trimmedUsername = form.username.trim();
      let username_cipher: string | null = null;
      let username_iv: string | null = null;

      if (trimmedUsername !== "") {
        const { cipher, iv } = await encrypt(trimmedUsername, vaultKey);
        username_cipher = cipher;
        username_iv = iv;
      }

      const url = normalizeUrlInput(form.url);

      if (editingItem) {
        const body: Record<string, unknown> = {
          title: trimmedTitle,
          description: form.description,
          username_cipher,
          username_iv,
          url,
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
          username_cipher,
          username_iv,
          url,
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

  /**
   * Optimistic: a star should feel instant. The whole bag is sent because a JSONB write
   * replaces the column, so merging locally is what preserves any other keys on the item.
   */
  const toggleFavourite = async (item: CategoryItem) => {
    const next = !isFavourite(item);
    const properties = mergeProperties(item, { favourite: next || undefined });
    const previous = shieldItems;

    setShieldItems((items) =>
      items.map((candidate) =>
        candidate.category_item_id === item.category_item_id
          ? { ...candidate, additional_properties: properties }
          : candidate,
      ),
    );

    try {
      await api.put(`/category-items/${item.category_item_id}`, {
        additional_properties: properties,
      });
    } catch (err) {
      console.error(err);
      setShieldItems(previous);
      toast.error("Could not update favourite. Please try again.");
    }
  };

  const openMoveModal = (item: CategoryItem) => {
    void ensureCategoryOptions();
    setMoveItem(item);
    setMoveTarget(item.category_id ?? categoryId ?? "");
  };

  const closeMoveModal = () => {
    if (moveLoading) return;
    setMoveItem(null);
  };

  const confirmMove = async () => {
    if (!moveItem || !moveTarget || moveTarget === moveItem.category_id) return;

    setMoveLoading(true);
    try {
      await api.put(`/category-items/${moveItem.category_item_id}`, {
        category_id: moveTarget,
      });
      const name =
        categoryOptions?.find((c) => (c.category_id ?? c.id) === moveTarget)?.category_name ??
        "another category";
      setMoveItem(null);
      // The item leaves this category, so the list must reload or it lingers on screen.
      await fetchShieldItems();
      toast.success(`Moved to ${name}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not move item. Please try again.");
    } finally {
      setMoveLoading(false);
    }
  };

  const restoreItem = async (categoryItemId: string) => {
    try {
      await api.post(`/category-items/${categoryItemId}/restore`);
      await fetchShieldItems();
      toast.success("Item restored");
    } catch (err) {
      console.error(err);
      toast.error("Could not restore item. Please try again.");
    }
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirmItem?.category_item_id) return;
    const { category_item_id: id, title } = deleteConfirmItem;

    setDeleteLoading(true);
    try {
      await api.delete(`/category-items/${id}`);
      setDeleteConfirmItem(null);
      await fetchShieldItems();
      // Soft delete, so the obvious next affordance is putting it straight back.
      toast.success(`Moved “${title ?? "Item"}” to trash`, {
        action: { label: "Undo", onClick: () => void restoreItem(id) },
      });
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
                username={usernames.get(item.category_item_id)}
                highlighted={highlighted === item.category_item_id}
                onEdit={() => openEditModal(item)}
                onDelete={() => setDeleteConfirmItem(item)}
                onToggleFavourite={() => void toggleFavourite(item)}
                onMove={() => openMoveModal(item)}
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
        <input
          id="shield-item-username"
          type="text"
          value={form.username}
          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          className="cmn-field-input"
          placeholder="Username or email"
          autoComplete="off"
        />
        <div className="relative">
          <input
            id="shield-item-password"
            type={showFormPassword ? "text" : "password"}
            value={clearPassword ? "" : form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="cmn-field-input pr-20"
            placeholder={editingItem ? "New password (leave blank to keep)" : "Password"}
            autoComplete="new-password"
            disabled={clearPassword}
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
            <PasswordGenerator
              disabled={clearPassword}
              onUse={(generated) => {
                setForm((prev) => ({ ...prev, password: generated }));
                // Reveal it: you should be able to see what you are about to save.
                setShowFormPassword(true);
              }}
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowFormPassword((s) => !s)}
              aria-label={showFormPassword ? "Hide password" : "Show password"}
              disabled={clearPassword}
            >
              {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
        <input
          id="shield-item-url"
          type="text"
          value={form.url}
          onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
          className="cmn-field-input"
          placeholder="Website (e.g. github.com)"
          autoComplete="off"
          inputMode="url"
        />
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
        open={moveItem !== null}
        title="Move item"
        description={`Choose a category for “${moveItem?.title ?? "this item"}”.`}
        icon={<FolderInput className="h-4 w-4" />}
        onClose={closeMoveModal}
        closeDisabled={moveLoading}
        footer={
          <>
            <button
              type="button"
              className="button-ghost"
              onClick={closeMoveModal}
              disabled={moveLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-theme"
              onClick={() => void confirmMove()}
              disabled={
                moveLoading ||
                categoryOptions === null ||
                !moveTarget ||
                moveTarget === moveItem?.category_id
              }
            >
              {moveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {moveLoading ? "Moving…" : "Move"}
            </button>
          </>
        }
      >
        <select
          value={moveTarget}
          onChange={(e) => setMoveTarget(e.target.value)}
          className="cmn-field-input cursor-pointer"
          disabled={categoryOptions === null || moveLoading}
          aria-label="Destination category"
        >
          {categoryOptions === null ? (
            <option value={moveTarget}>Loading categories…</option>
          ) : (
            categoryOptions.map((option) => {
              const value = option.category_id ?? option.id ?? "";
              return (
                <option key={value} value={value}>
                  {option.category_name ?? "Untitled"}
                  {value === moveItem?.category_id ? "  (current)" : ""}
                </option>
              );
            })
          )}
        </select>
      </Modal>

      <Modal
        open={deleteConfirmItem !== null}
        title="Delete item"
        description={`Move "${deleteConfirmItem?.title ?? "this item"}" to the trash? You can restore it for ${TRASH_RETENTION_DAYS} days.`}
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
