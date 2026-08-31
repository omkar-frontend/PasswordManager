import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../supabaseClient";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  const handleSignup = async () => {
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);
    if (error) setErrorMsg(error.message);
    else {
      toast.success("Account created — check your email to confirm.");
      navigate("/login");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSignup();
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-theme-bg px-4 py-12">
      <div className="ambient-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="icon-tile mx-auto mb-4 h-12 w-12">
            <UserPlus className="h-5 w-5" strokeWidth={2} />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-theme-text">
            Shield<span className="text-violet-500">X</span>
          </p>
          <p className="mt-1 text-sm text-theme-muted">Create your account</p>
        </div>

        <div className="card bg-surface/70 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <h1 className="sr-only">Sign up</h1>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            {errorMsg && (
              <p
                className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
                role="alert"
              >
                {errorMsg}
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium text-theme-text">
                Email
              </label>
              <input
                id="signup-email"
                className="cmn-field-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-sm font-medium text-theme-text">
                Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  className="cmn-field-input pr-12"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="icon-button absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="button-theme mt-1 w-full py-2.5"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-theme-muted">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-violet-400 transition-colors hover:text-violet-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
