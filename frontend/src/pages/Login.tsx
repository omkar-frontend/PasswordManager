import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { setUser, setSession } = useAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/app", { replace: true });
    });
  }, [navigate]);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) setErrorMsg(error.message);
    else {
      setSession(data.session);
      setUser(data.user);
      navigate("/app", { replace: true });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-theme-bg px-4 py-12">
      <div className="ambient-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="icon-tile mx-auto mb-4 h-12 w-12">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-theme-text">
            Shield<span className="text-violet-500">X</span>
          </p>
          <p className="mt-1 text-sm text-theme-muted">Sign in to your vault</p>
        </div>

        <div className="card bg-surface/70 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <h1 className="sr-only">Login</h1>
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
              <label htmlFor="login-email" className="text-sm font-medium text-theme-text">
                Email
              </label>
              <input
                id="login-email"
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
              <label htmlFor="login-password" className="text-sm font-medium text-theme-text">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  className="cmn-field-input pr-12"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-theme-muted">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-violet-400 transition-colors hover:text-violet-300"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
