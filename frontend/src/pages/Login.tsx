import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(109, 40, 217, 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(91, 33, 182, 0.12), transparent), radial-gradient(ellipse 50% 30% at 0% 80%, rgba(124, 58, 237, 0.08), transparent)",
        }}
      />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60 shadow-lg shadow-violet-950/20">
            <Lock className="h-6 w-6 text-violet-400" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-theme-text">
            Shield<span className="text-violet-500">X</span>
          </p>
          <p className="mt-1 text-sm text-neutral-400">Sign in to your vault</p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <h1 className="sr-only">Login</h1>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            {errorMsg && (
              <p
                className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
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
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium text-theme-text">
                Password
              </label>
              <input
                id="login-password"
                className="cmn-field-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="button-theme mt-1 w-full justify-center py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
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

          <p className="mt-6 text-center text-sm text-neutral-400">
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
