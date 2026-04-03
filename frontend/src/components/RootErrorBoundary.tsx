import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/** Catches render/lifecycle errors in the tree (React Router errorElement does not catch all of these). */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RootErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      const isDev = import.meta.env.DEV;

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-theme-bg p-6 text-theme-text">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/50 p-8 shadow-xl">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-900/50 bg-red-950/40">
                <AlertTriangle className="h-7 w-7 text-red-400" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Application error</h1>
              <p className="text-sm text-neutral-400">{err.message}</p>
            </div>

            {isDev && err.stack ? (
              <pre className="mb-6 max-h-40 overflow-auto rounded-lg border border-neutral-800 bg-black/40 p-3 text-left text-xs text-neutral-500">
                {err.stack}
              </pre>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="button-theme flex w-full items-center justify-center gap-2 sm:w-auto"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                Reload page
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-theme-text transition-colors hover:bg-neutral-800 sm:w-auto"
                onClick={() => window.location.assign("/")}
              >
                <Home className="h-4 w-4" />
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
