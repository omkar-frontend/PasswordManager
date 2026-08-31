import { Lock, LogOut, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useVault } from "../context/VaultContext";

export default function Header() {
  const navigate = useNavigate();
  const { user, setUser, setSession } = useAuth();
  const { vaultKey, lockVault } = useVault();

  const email = user?.email ?? "";
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      toast.error("Could not sign out. Please try again.");
      return;
    }
    lockVault();
    setSession(null);
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-theme-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="icon-tile h-8 w-8">
            <Shield className="h-4 w-4" strokeWidth={2} />
          </div>
          <p className="text-lg font-semibold tracking-tight text-theme-text">
            Shield<span className="text-violet-500">X</span>
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface-2 text-sm font-medium text-theme-text transition-colors hover:border-violet-500/50 hover:bg-violet-500/10"
              aria-label="Account menu"
            >
              {initial}
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-60 border-hairline bg-surface p-1.5">
            <div className="flex flex-col gap-1">
              <div className="px-2.5 py-2">
                <p className="text-xs text-theme-muted">Signed in as</p>
                <p className="truncate text-sm font-medium text-theme-text">{email || "Unknown"}</p>
              </div>
              <div className="h-px bg-hairline" />

              {/* Surfaces the idle auto-lock as something you can also trigger yourself. */}
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-theme-text transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={lockVault}
                disabled={!vaultKey}
              >
                <Lock className="h-4 w-4 text-theme-muted" />
                Lock vault
              </button>

              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                onClick={() => void handleLogout()}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </nav>
    </header>
  );
}
