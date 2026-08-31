import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronRight,
  EllipsisVertical,
  Folder,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  Trash,
} from "lucide-react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NoDataLottie from "@/components/NoDataLottie";
import Modal from "@/components/ui/Modal";
import SearchInput from "@/components/ui/SearchInput";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type CategoryRow = {
  category_id?: string;
  id?: string;
  category_name?: string;
  item_count?: number;
};

/** Only the searchable, non-secret columns are needed here. */
type ItemRow = {
  category_item_id: string;
  category_id?: string;
  title?: string | null;
  description?: string | null;
};

function CategorySkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-2/3" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ label, count }: { label: string; count: number | null }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wider text-theme-muted uppercase">
      {label}
      {count !== null ? <span className="chip normal-case">{count}</span> : null}
    </h2>
  );
}

export default function Categories() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<CategoryRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [allItems, setAllItems] = useState<ItemRow[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(false);
  const itemsRequested = useRef(false);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const normalizedQuery = query.trim().toLowerCase();

  const fetchCategories = async () => {
    setCompLoading(true);
    try {
      const res = await api.get<CategoryRow[]>("/categories");
      setCategories(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load categories");
    } finally {
      setCompLoading(false);
    }
    // A category delete removes its items, so the cached search index is now stale.
    itemsRequested.current = false;
    setAllItems(null);
  };

  /**
   * Item search spans the whole vault, for when you know the item but not where you filed it.
   * Items load once, on the first search, so browsing costs nothing extra.
   */
  useEffect(() => {
    if (!normalizedQuery || itemsRequested.current) return;

    itemsRequested.current = true;
    setItemsLoading(true);
    setItemsError(false);

    api
      .get<ItemRow[]>("/category-items")
      .then((res) => setAllItems(res.data))
      .catch((err) => {
        console.error(err);
        setItemsError(true);
        itemsRequested.current = false;
      })
      .finally(() => setItemsLoading(false));
    // `allItems` is a dependency so that invalidating the cache triggers a refetch.
  }, [normalizedQuery, allItems]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      const id = c.category_id ?? c.id;
      if (id) map.set(id, c.category_name ?? "Untitled");
    }
    return map;
  }, [categories]);

  const visibleCategories = useMemo(() => {
    if (!normalizedQuery) return categories;
    return categories.filter((c) =>
      (c.category_name ?? "").toLowerCase().includes(normalizedQuery),
    );
  }, [categories, normalizedQuery]);

  // Titles and notes only: passwords are ciphertext and cannot be searched.
  const matchingItems = useMemo(() => {
    if (!normalizedQuery || !allItems) return [];
    return allItems.filter((item) =>
      `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [allItems, normalizedQuery]);

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
        await api.put(`/categories/${cid}`, { name: trimmedName });
      } else {
        const email = user?.email;
        if (!email) return;
        const categoryPrefix = trimmedName.toUpperCase().slice(0, 4).padEnd(4, "X");
        const emailPrefix = email.trim().split("@")[0].toUpperCase();
        const categoryCode = `${categoryPrefix}${emailPrefix}`;
        await api.post("/categories", { code: categoryCode, name: trimmedName });
      }
      closeModal();
      toast.success(editingCategory ? "Category updated" : "Category created");
      await fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error(
        editingCategory
          ? "Could not update category. Please try again."
          : "Could not create category. Please try again.",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // Wait for auth to settle: fetching first would fire a request that 401s on a signed-out visitor.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    void fetchCategories();
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
      await api.delete(`/categories/${cid}`);
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

  const openItem = (item: ItemRow) => {
    if (!item.category_id) return;
    navigate(`/app/category/${item.category_id}`, {
      state: {
        categoryName: categoryNameById.get(item.category_id) ?? "Category",
        highlightItemId: item.category_item_id,
      },
    });
  };

  const deleteCount = deleteConfirmCategory?.item_count ?? 0;
  const searching = normalizedQuery.length > 0;
  const nothingFound = searching && visibleCategories.length === 0 && matchingItems.length === 0;

  const categoryGrid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visibleCategories.map((category) => {
        const cid = category.category_id ?? category.id;
        const count = category.item_count ?? 0;
        return (
          <div
            key={cid}
            className="card-interactive group p-4"
            onClick={() =>
              navigate(`/app/category/${cid}`, {
                state: { categoryName: category.category_name },
              })
            }
          >
            <div className="flex items-start gap-3">
              <div className="icon-tile h-10 w-10">
                <Folder className="h-[18px] w-[18px]" />
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate font-medium text-theme-text">{category.category_name}</p>
                <span className="chip mt-2">{count === 1 ? "1 item" : `${count} items`}</span>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="icon-button -mt-1 -mr-1 opacity-60 transition-opacity group-hover:opacity-100"
                    aria-label="Category options"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  className="w-44 border-hairline bg-surface p-1.5"
                >
                  {/* PopoverClose dismisses the menu, so it cannot linger behind the dialog. */}
                  <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    <PopoverClose asChild>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-theme-text transition-colors hover:bg-white/[0.06]"
                        onClick={(e) => openEditModal(category, e)}
                      >
                        <Pencil className="h-4 w-4 text-theme-muted" />
                        Rename
                      </button>
                    </PopoverClose>
                    <PopoverClose asChild>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                        onClick={(e) => openDeleteConfirm(category, e)}
                      >
                        <Trash className="h-4 w-4" />
                        Delete
                      </button>
                    </PopoverClose>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-theme-text">Your vault</h1>
            <p className="mt-1 text-sm text-theme-muted">
              {compLoading
                ? "Loading categories…"
                : searching
                  ? `${visibleCategories.length} of ${categories.length} categories`
                  : categories.length === 1
                    ? "1 category"
                    : `${categories.length} categories`}
            </p>
          </div>
          <button type="button" className="button-theme" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Add category
          </button>
        </div>

        {!compLoading && categories.length > 0 ? (
          <div className="mb-6">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search categories and items"
              hotkeyEnabled={!isModalOpen && deleteConfirmCategory === null}
            />
          </div>
        ) : null}

        {compLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CategorySkeleton key={i} />
            ))}
          </div>
        ) : nothingFound && !itemsLoading ? (
          <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="icon-tile h-12 w-12">
              <SearchX className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-theme-text">Nothing matches your search</p>
              <p className="mt-1 text-sm text-theme-muted">
                No category or item found for &ldquo;{query.trim()}&rdquo;. Saved passwords are
                encrypted, so only names, titles and notes are searchable.
              </p>
            </div>
            <button type="button" className="button-ghost mt-2" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : searching ? (
          <div className="flex flex-col gap-8">
            {visibleCategories.length > 0 ? (
              <section>
                <SectionHeading label="Categories" count={visibleCategories.length} />
                {categoryGrid}
              </section>
            ) : null}

            <section>
              <SectionHeading
                label="Items"
                count={itemsLoading ? null : itemsError ? null : matchingItems.length}
              />
              {itemsLoading ? (
                <div className="flex items-center gap-2 text-sm text-theme-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching your items…
                </div>
              ) : itemsError ? (
                <p className="text-sm text-red-400">Could not search items. Try again.</p>
              ) : matchingItems.length === 0 ? (
                <p className="text-sm text-theme-muted">No items match.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {matchingItems.map((item) => (
                    <li key={item.category_item_id}>
                      <button
                        type="button"
                        className="card group flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:border-violet-500/40 hover:bg-surface-2"
                        onClick={() => openItem(item)}
                      >
                        <div className="icon-tile h-9 w-9">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-theme-text">
                            {item.title ?? "Untitled"}
                          </p>
                          {item.description ? (
                            <p className="truncate text-sm text-theme-muted">{item.description}</p>
                          ) : null}
                        </div>
                        {item.category_id ? (
                          <span className="chip hidden sm:inline-flex">
                            <Folder className="h-3 w-3" />
                            {categoryNameById.get(item.category_id) ?? "Category"}
                          </span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-theme-muted transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : categories.length > 0 ? (
          categoryGrid
        ) : (
          <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <NoDataLottie />
            <div>
              <p className="font-medium text-theme-text">No categories yet</p>
              <p className="mt-1 text-sm text-theme-muted">
                Group your passwords into categories to keep the vault tidy.
              </p>
            </div>
            <button type="button" className="button-theme mt-2" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add your first category
            </button>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        title={editingCategory ? "Rename category" : "New category"}
        description={
          editingCategory ? "Give this category a clearer name." : "Name a group for your passwords."
        }
        icon={<Folder className="h-4 w-4" />}
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
              onClick={() => void handleSaveCategory()}
              disabled={createLoading || !categoryName.trim() || (!editingCategory && !user?.email)}
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {createLoading ? "Saving…" : editingCategory ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <input
          id="category-name"
          type="text"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleSaveCategory()}
          className="cmn-field-input"
          placeholder="e.g. Work, Banking, Social"
          autoFocus
        />
      </Modal>

      <Modal
        open={deleteConfirmCategory !== null}
        title="Delete category"
        description={`Delete "${deleteConfirmCategory?.category_name ?? "this category"}"? All ${deleteCount} ${deleteCount === 1 ? "item" : "items"} in it are removed permanently.`}
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
              onClick={() => void confirmDeleteCategory()}
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
