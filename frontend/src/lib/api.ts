import axios from "axios";
import { supabase } from "../supabaseClient";
import { clearVaultSessionKey } from "./vaultSession";

const baseURL = import.meta.env.VITE_BACKEND_URL;

/**
 * A dedicated instance, so the Supabase access token is attached to this backend only —
 * a global `axios` interceptor would leak it to every host the app ever calls.
 */
export const api = axios.create({ baseURL });

api.interceptors.request.use(async (config) => {
  if (!baseURL) throw new Error("VITE_BACKEND_URL is not set");

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let signingOut = false;

/** The backend tags a 401 with this only when the session itself is rejected. */
const UNAUTHENTICATED = "unauthenticated";

async function endSession(): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) await clearVaultSessionKey(userId);
    await supabase.auth.signOut();
  } finally {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    } else {
      signingOut = false;
    }
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const code = (error.response.data as { code?: string } | undefined)?.code;
      if (code === UNAUTHENTICATED) await endSession();
    }
    return Promise.reject(error);
  },
);
