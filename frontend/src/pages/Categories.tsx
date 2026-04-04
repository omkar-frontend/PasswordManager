import axios from "axios";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { EllipsisVertical, Loader2, Pencil, Plus, Trash, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import NoDataLottie from "@/components/NoDataLottie";

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
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<CategoryRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
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

  const openDeleteConfirm = (category: CategoryRow, e: MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmCategory(category);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteConfirmCategory(null);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteConfirmCategory) return;
    const cid = deleteConfirmCategory.category_id ?? deleteConfirmCategory.id;
    if (!cid) return;

    setDeleteLoading(true);
    try {
      await axios.delete(`${import.meta.env.VITE_BACKEND_URL}/categories/${cid}`);
      toast.success("Category deleted");
      setDeleteConfirmCategory(null);
      await fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error("Could not delete category. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };
  return (
    <>
      <div className="h-[calc(100dvh-55px)] bg-theme-bg p-4">
        {compLoading ? 
        <div className="flex items-center justify-center h-[calc(100dvh-55px)]">
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
                        className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text cursor-pointer"
                        onClick={(e) => openEditModal(category, e)}
                        aria-label="Edit category"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {/* Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-theme-text cursor-pointer"
                            aria-label="Category options"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="start">
                          <div className="flex flex-col gap-2 p-1">
                            <button
                              type="button"
                              className="flex gap-2 items-center border border-red-500 rounded-md px-2 py-2 cursor-pointer text-xs font-medium bg-red-500/10 hover:bg-red-500/20 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteConfirm(category, e);
                              }}
                            >
                              <Trash className="w-4 h-4 text-theme-text" />
                              <p className="text-theme-text">Delete</p>
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div> : 
            // No categories found
            <div className="flex flex-col gap-2 items-center justify-center h-full">
              <NoDataLottie />
              <div>
                <p className="text-theme-text ml-5">No categories found</p>
              </div>
            </div>
          }
        </div>
        }
      </div>
      {/* Create/Edit Modal */}
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
      {/* Delete Confirmation Modal */}
      {deleteConfirmCategory && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-theme-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-theme-text">Delete category</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Delete &quot;{deleteConfirmCategory.category_name ?? "this category"}&quot;? All 
                {(deleteConfirmCategory.item_count ?? 0) === 1 ? "item" : "items"} in this category
                will be removed permanently, then the category will be deleted.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-theme-text transition-colors hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-500 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25 cursor-pointer disabled:opacity-50"
                onClick={() => void confirmDeleteCategory()}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  ) 
}