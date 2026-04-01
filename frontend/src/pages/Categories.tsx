import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2, Plus, X } from "lucide-react";

export default function Categories() {

	const [categories, setCategories] = useState<any[]>([]);
	const [compLoading, setCompLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    } finally {
      setCompLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmedName = categoryName.trim();
    if (!trimmedName || !user?.email) return;

    const categoryPrefix = trimmedName.toUpperCase().slice(0, 4).padEnd(4, "X");
    const emailPrefix = user.email.trim().split("@")[0].toUpperCase();
    const categoryCode = `${categoryPrefix}${emailPrefix}`;

    setCreateLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/categories`, {
        code: categoryCode,
        name: trimmedName,
      });
      setCategoryName("");
      setIsModalOpen(false);
      await fetchCategories();
    } catch (err) {
      console.error(err);
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
            <button className="button-theme" onClick={() => setIsModalOpen(true)}>
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
                    onClick={() => navigate(`/category/${cid}`, { state: { categoryName: category.category_name } })}
                  >
                    <p className="text-theme-text">{category.category_name}</p>
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
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-neutral-800 bg-theme-bg p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-theme-text">Add Category</h2>
                <button
                  className="rounded-md p-1 text-theme-text transition-colors hover:bg-neutral-800 cursor-pointer"
                  onClick={() => setIsModalOpen(false)}
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
                  className="button-theme"
                  onClick={handleCreateCategory}
                  disabled={createLoading || !categoryName.trim()}
                >
                  {createLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  ) 
}