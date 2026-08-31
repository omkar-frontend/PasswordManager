import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Header from "../components/Header";
import VaultGate from "../components/VaultGate";
import { useAuth } from "../context/AuthContext";
import { VaultProvider } from "../context/VaultContext";

export default function Layout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-theme-bg">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <VaultProvider userId={session.user?.id}>
      {/* Flex column instead of hardcoded viewport maths, so the header can change height. */}
      <div className="flex min-h-dvh flex-col bg-theme-bg">
        <Header />
        <main className="flex flex-1 flex-col">
          <VaultGate />
        </main>
      </div>
    </VaultProvider>
  );
}
