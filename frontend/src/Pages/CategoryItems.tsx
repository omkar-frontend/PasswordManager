import { useEffect, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
import { encrypt } from "../crypto/encrypt";
import { decrypt } from "../crypto/decrypt";
import { useVault } from "../context/VaultContext";

type CategoryItem = {
  shield_item_id: string;
  category_id?: string;
  title?: string | null;
  description?: string | null;
  password_cipher?: string | null;
  password_iv?: string | null;
  /** legacy column */
  password?: string | null;
};

function hasEncryptedPassword(item: CategoryItem): boolean {
  return (
    typeof item.password_cipher === "string" &&
    item.password_cipher.trim() !== "" &&
    typeof item.password_iv === "string" &&
    item.password_iv.trim() !== ""
  );
}

function ItemPasswordRow({ item, vaultKey }: { item: CategoryItem; vaultKey: CryptoKey }) {
  const [revealed, setRevealed] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [decryptErr, setDecryptErr] = useState(false);

  const encrypted = hasEncryptedPassword(item);
  const legacyPlain =
    !encrypted &&
    item.password != null &&
    String(item.password).trim() !== ""
      ? String(item.password).trim()
      : null;

  if (!encrypted && !legacyPlain) return null;

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (encrypted) {
      if (plain === null) {
        try {
          setDecryptErr(false);
          const text = await decrypt(item.password_cipher!, item.password_iv!, vaultKey);
          setPlain(text);
        } catch {
          setDecryptErr(true);
          return;
        }
      }
      setRevealed(true);
      return;
    }
    setRevealed(true);
  };

  const masked = "•".repeat(12);
  let display = masked;
  if (revealed) {
    if (decryptErr) display = "Could not decrypt";
    else if (encrypted) display = plain ?? "…";
    else display = legacyPlain ?? "";
  }

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-neutral-800 pt-2">
      <p className="min-w-0 flex-1 font-mono text-sm break-all text-theme-text">{display}</p>
      <button
        type="button"
        className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text"
        onClick={() => void toggleReveal()}
        aria-label={revealed ? "Hide password" : "Show password"}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function CategoryItems() {
  const { id: categoryId } = useParams<{ id: string }>();
  const { categoryName } = useLocation().state as { categoryName: string } ?? { categoryName: "" };
  const { vaultKey } = useVault();
  const [shieldItems, setShieldItems] = useState<CategoryItem[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [form, setForm] = useState({
    title: "",
    password: "",
    description: "",
  });
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const navigate = useNavigate();
  const fetchShieldItems = async () => {
    if (!categoryId) {
      setShieldItems([]);
      setCompLoading(false);
      return;
    }
    setCompLoading(true);
    try {
      const res = await axios.get<CategoryItem[]>(`${import.meta.env.VITE_BACKEND_URL}/category-items`, {
        params: { category_id: categoryId },
      });
      setShieldItems(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCompLoading(false);
    }
  };

  useEffect(() => {
    fetchShieldItems();
  }, [categoryId]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setForm({ title: "", password: "", description: "" });
    setShowFormPassword(false);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({ title: "", password: "", description: "" });
    setShowFormPassword(false);
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
    setIsModalOpen(true);
  };

  const handleSaveItem = async () => {
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle || !categoryId || !vaultKey) return;

    setCreateLoading(true);
    try {
      const trimmedPwd = form.password.trim();
      let password_cipher: string | null | undefined = undefined;
      let password_iv: string | null | undefined = undefined;

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
        if (password_cipher != null && password_iv != null) {
          body.password_cipher = password_cipher;
          body.password_iv = password_iv;
        }
        await axios.patch(
          `${import.meta.env.VITE_BACKEND_URL}/category-items/${editingItem.shield_item_id}`,
          body
        );
      } else {
        await axios.post(`${import.meta.env.VITE_BACKEND_URL}/category-items`, {
          category_id: categoryId,
          title: trimmedTitle,
          password_cipher: password_cipher ?? null,
          password_iv: password_iv ?? null,
          description: form.description,
        });
      }

      closeModal();
      await fetchShieldItems();
    } catch (err) {
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-theme-bg p-4">
        {!categoryId ? (
          <p className="mt-4 text-neutral-400">Missing category.</p>
        ) : (
          <div className="flex w-full flex-col gap-8">
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button type="button" className="cursor-pointer rounded-md p-1.5 text-theme-text transition-colors hover:bg-neutral-800" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xl font-semibold text-theme-text">{categoryName}</p>
              </div>
              <button type="button" className="button-theme" onClick={openCreateModal}>
                <Plus className="h-4 w-4 text-theme-text" />
                <p className="text-theme-text">Add item</p>
              </button>
            </div>
            {compLoading ? (
              <p className="text-theme-text">Loading…</p>
            ) : shieldItems.length === 0 ? (
              <p className="text-neutral-400">No items in this category.</p>
            ) : (
              <ul className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-3">
                {shieldItems.map((item) => (
                  <li
                    key={item.shield_item_id}
                    className="rounded-lg border border-neutral-800 p-3 text-theme-text"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.title ?? "Untitled"}</p>
                        {item.description ? (
                          <p className="text-sm text-neutral-400">{item.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text"
                        onClick={() => openEditModal(item)}
                        aria-label="Edit item"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                    {vaultKey ? <ItemPasswordRow item={item} vaultKey={vaultKey} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {isModalOpen && categoryId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-theme-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-theme-text">
                {editingItem ? "Edit item" : "New item"}
              </h2>
              <button
                type="button"
                className="cursor-pointer rounded-md p-1 text-theme-text transition-colors hover:bg-neutral-800"
                onClick={closeModal}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-6 flex flex-col gap-3">
              <input
                id="shield-item-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="cmn-field-input"
                placeholder="Title"
                autoComplete="off"
                required
              />
              <div className="flex gap-2">
                <input
                  id="shield-item-password"
                  type={showFormPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="cmn-field-input min-w-0 flex-1"
                  placeholder={editingItem ? "New password (leave blank to keep)" : "Password"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-neutral-700 p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text"
                  onClick={() => setShowFormPassword((s) => !s)}
                  aria-label={showFormPassword ? "Hide password" : "Show password"}
                >
                  {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <textarea
                id="shield-item-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="cmn-field-input resize-none"
                placeholder="Description"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="button-theme"
                onClick={() => void handleSaveItem()}
                disabled={createLoading || !form.title.trim() || !vaultKey}
              >
                {createLoading ? "Saving…" : editingItem ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}