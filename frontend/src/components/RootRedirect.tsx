import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** `/` → `/login` if signed out, `/app` if signed in (so new visitors land on login). */
export default function RootRedirect() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-theme-bg p-6 text-theme-text">
        <p>Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/app" replace />;
}
