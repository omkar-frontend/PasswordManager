import { LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../Components/ui/popover"
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Header() {

  const navigate = useNavigate();
  const { user, setUser, setSession } = useAuth();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.log(error);
    else {
      setSession(null);
      setUser(null);
      navigate("/login", { replace: true });
    }
  };

  return (
    <nav className="flex justify-between items-center px-4 py-3 bg-theme-bg border-b border-neutral-800 sticky top-0 z-10">
      <p className="text-2xl font-bold text-theme-text">Shield<span className="text-violet-600">X</span></p>
      {/* Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <UserRound className="w-8 h-8 cursor-pointer text-theme-text p-1.5 rounded-full transition-colors hover:bg-neutral-600" />
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-2 p-1">
            <p className="text-theme-text text-sm px-2 py-1">{user?.email ?? "No user"}</p>
            {/* Logout button */}
            <div className="flex items-center gap-2 cursor-pointer w-full rounded-lg hover:bg-neutral-700 p-2 *:transition-colors group" onClick={handleLogout}>
              <LogOut className="w-4 h-4 text-theme-text group-hover:text-red-500" />
              <p className="text-theme-text group-hover:text-red-500">Logout</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  );
}