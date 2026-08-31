/**
 * Copies a secret and schedules the clipboard to be wiped, so a password does not sit
 * there indefinitely for any other application to read.
 *
 * Browsers only allow clipboard access while the document has focus, and the usual flow
 * is copy → switch app → paste. The clear is therefore retried whenever this page regains
 * focus, rather than dropped when the deadline passes in the background.
 */
const CLEAR_AFTER_MS = 30_000;

type Pending = { value: string; dueAt: number };

let pending: Pending | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void attemptClear(), Math.max(delay, 0));
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("focus", () => void attemptClear());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void attemptClear();
  });
}

async function attemptClear(): Promise<void> {
  if (!pending) return;

  const remaining = pending.dueAt - Date.now();
  if (remaining > 0) {
    schedule(remaining);
    return;
  }

  // Wait for focus; the listeners above will call back when the user returns.
  if (!document.hasFocus()) return;

  const { value } = pending;
  try {
    const current = await navigator.clipboard.readText();
    // Only wipe what we put there, so a later copy by the user survives.
    if (current === value) await navigator.clipboard.writeText("");
  } catch {
    // readText is unavailable in some browsers (Firefox) and behind a prompt in others.
    // Leaving a password in the clipboard is the worse outcome, so clear unverified.
    try {
      await navigator.clipboard.writeText("");
    } catch {
      // Nothing further we can do.
    }
  } finally {
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

/** Copies `value`, then clears the clipboard ~30s later. Throws if the copy itself fails. */
export async function copySecret(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  ensureListening();
  pending = { value, dueAt: Date.now() + CLEAR_AFTER_MS };
  schedule(CLEAR_AFTER_MS);
}
