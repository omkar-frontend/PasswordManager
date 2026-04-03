import axios from "axios";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { Loader2, Pencil, Plus, X } from "lucide-react";

type CategoryRow = {
  category_id?: string;
  id?: string;
  category_name?: string;
  item_count?: number;
};

export default function Categories() {

	const [categories, setCategories] = useState<CategoryRow[]>([]);
	const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
	const navigate = useNavigate();
  const { user, loading } = useAuth();

  const fetchCategories = async () => {
    setCompLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/categories`);
      setCategories(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load categories");
    } finally {
      setCompLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setCategoryName("");
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryName("");
    setIsModalOpen(true);
  };

  const openEditModal = (category: CategoryRow, e: MouseEvent) => {
    e.stopPropagation();
    setEditingCategory(category);
    setCategoryName(category.category_name ?? "");
    setIsModalOpen(true);
  };

  const handleSaveCategory = async () => {
    const trimmedName = categoryName.trim();
    if (!trimmedName) return;
    if (!editingCategory && !user?.email) return;

    setCreateLoading(true);
    try {
      if (editingCategory) {
        const cid = editingCategory.category_id ?? editingCategory.id;
        if (!cid) return;
        await axios.put(`${import.meta.env.VITE_BACKEND_URL}/categories/${cid}`, {
          name: trimmedName,
        });
      } else {
        const email = user?.email;
        if (!email) return;
        const categoryPrefix = trimmedName.toUpperCase().slice(0, 4).padEnd(4, "X");
        const emailPrefix = email.trim().split("@")[0].toUpperCase();
        const categoryCode = `${categoryPrefix}${emailPrefix}`;
        await axios.post(`${import.meta.env.VITE_BACKEND_URL}/categories`, {
          code: categoryCode,
          name: trimmedName,
        });
      }
      closeModal();
      toast.success(editingCategory ? "Category updated" : "Category created");
      await fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error(editingCategory ? "Could not update category. Please try again." : "Could not create category. Please try again.");
    } finally {
      setCreateLoading(false);
    }
  };

	useEffect(() => {
    fetchCategories();
	  }, []);

	  useEffect(() => {
      if (!loading && !user) navigate("/login", { replace: true });
	  }, [loading, user, navigate]);
    
  return (
    <>
      <div className="min-h-screen bg-theme-bg p-4">
        {compLoading ? 
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-theme-text" />
        </div> :
        <div className="w-full flex flex-col gap-4">
          <div className="w-full flex justify-end">
            <button type="button" className="button-theme" onClick={openCreateModal}>
              <Plus className="w-4 h-4 text-theme-text" />
              <p className="text-theme-text">Add Category</p>
            </button>
          </div>
          {
            categories.length > 0 ? 
            <div className="grid grid-cols-6 gap-4 *:rounded-xl *:border *:border-neutral-800 *:p-3 *:transition-colors cursor-pointer">
              {categories.map((category) => {
                const cid = category.category_id ?? category.id;
                return (
                  <div
                    className="flex flex-col gap-2 hover:border-violet-900"
                    key={cid}
                    onClick={() =>
                      navigate(`/app/category/${cid}`, { state: { categoryName: category.category_name } })
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-theme-text">{category.category_name}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {(category.item_count ?? 0) === 1
                            ? "1 item"
                            : `${category.item_count ?? 0} items`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text"
                        onClick={(e) => openEditModal(category, e)}
                        aria-label="Edit category"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div> : 
            // No categories found
            <div className="flex items-center justify-center h-full">
              <p className="text-theme-text">No categories found</p>
            </div>
          }
        </div>
        }
      </div>
      {isModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={closeModal}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-neutral-800 bg-theme-bg p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-theme-text">
                  {editingCategory ? "Edit category" : "Add Category"}
                </h2>
                <button
                  type="button"
                  className="rounded-md p-1 text-theme-text transition-colors hover:bg-neutral-800 cursor-pointer"
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-6 flex flex-col gap-1">
                <input
                  id="category-name"
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="cmn-field-input"
                  placeholder="Enter category name"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="button-theme"
                  onClick={() => void handleSaveCategory()}
                  disabled={createLoading || !categoryName.trim() || (!editingCategory && !user?.email)}
                >
                  {createLoading
                    ? editingCategory
                      ? "Saving…"
                      : "Creating..."
                    : editingCategory
                      ? "Save"
                      : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  ) 
}