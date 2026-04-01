import { Navigate } from "react-router-dom";
import Header from "../components/Header";
import VaultGate from "../components/VaultGate";
import { useAuth } from "../context/AuthContext";
import { VaultProvider } from "../context/VaultContext";

export default function Layout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-bg p-6 text-theme-text">
        <p>Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <VaultProvider>
      <Header />
      <VaultGate />
    </VaultProvider>
  );
}
