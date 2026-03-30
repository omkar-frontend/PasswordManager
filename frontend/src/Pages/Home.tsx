import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Home() {

	const [categories, setCategories] = useState<any[]>([]);
	const navigate = useNavigate();
  const { user, loading } = useAuth();

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BACKEND_URL}/categories`)
		  .then(res => setCategories(res.data))
		  .catch(err => console.error(err));
	  }, []);

	  useEffect(() => {
      if (!loading && !user) navigate("/login", { replace: true });
	  }, [loading, user, navigate]);
    
  return (
    <div className="min-h-screen bg-theme-bg px-4 py-2">
      <h1>Home</h1>
      <p className="text-theme-text">Logged in as: {user?.email}</p>
      <p className="text-theme-text">Categories loaded: {categories.length}</p>
    </div>
  ) 
}