import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";

export default function Passwords() {
  const { id: categoryId } = useParams<{ id: string }>();
  const [shieldItems, setShieldItems] = useState<any[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    password: "",
    description: "",
  });
  const [createLoading, setCreateLoading] = useState(false);

  const fetchShieldItems = async () => {
    if (!categoryId) {
      setShieldItems([]);
      setCompLoading(false);
      return;
    }
    setCompLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/category-items`, {
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

  const handleCreateItem = async () => {
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle || !categoryId) return;

    setCreateLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/category-items`, {
        category_id: categoryId,
        title: trimmedTitle,
        password: form.password,
        description: form.description,
      });
      setForm({ title: "", password: "", description: "" });
      setIsModalOpen(false);
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
          <div className="flex w-full flex-col gap-4">
            <div className="flex w-full items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold text-theme-text">Passwords</h1>
              <button type="button" className="button-theme" onClick={() => setIsModalOpen(true)}>
                <Plus className="h-4 w-4 text-theme-text" />
                <p className="text-theme-text">Add item</p>
              </button>
            </div>
            {compLoading ? (
              <p className="text-theme-text">Loading…</p>
            ) : shieldItems.length === 0 ? (
              <p className="text-neutral-400">No items in this category.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shieldItems.map((item) => (
                  <li
                    key={item.shield_item_id}
                    className="rounded-lg border border-neutral-800 p-3 text-theme-text"
                  >
                    <p className="font-medium">{item.title ?? "Untitled"}</p>
                    {item.description ? (
                      <p className="text-sm text-neutral-400">{item.description}</p>
                    ) : null}
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-theme-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-theme-text">New shield item</h2>
              <button
                type="button"
                className="cursor-pointer rounded-md p-1 text-theme-text transition-colors hover:bg-neutral-800"
                onClick={() => setIsModalOpen(false)}
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
              />
              <input
                id="shield-item-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="cmn-field-input"
                placeholder="Password (optional)"
                autoComplete="new-password"
              />
              <textarea
                id="shield-item-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="cmn-field-input min-h-[88px] resize-y"
                placeholder="Description (optional)"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="button-theme"
                onClick={handleCreateItem}
                disabled={createLoading || !form.title.trim()}
              >
                {createLoading ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
