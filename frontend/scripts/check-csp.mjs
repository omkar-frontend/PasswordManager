/**
 * Fails the build if vercel.json still carries an unfilled placeholder, or if the CSP
 * omits the API origin the app is built against. A bad CSP does not break the build or
 * the dev server — it only surfaces as blocked requests in production, so check it here.
 */
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const headers = config.headers?.flatMap((entry) => entry.headers ?? []) ?? [];
const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";

const problems = [];

const placeholder = csp.match(/[A-Z0-9_]*PLACEHOLDER[A-Z0-9_]*/);
if (placeholder) {
  problems.push(`vercel.json CSP still contains the placeholder "${placeholder[0]}".`);
}

// VITE_BACKEND_URL is what the bundle will actually call, so the CSP has to allow it.
const backendUrl = process.env.VITE_BACKEND_URL;
if (backendUrl) {
  try {
    const origin = new URL(backendUrl).origin;
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);
    if (!isLocal && !csp.includes(origin)) {
      problems.push(`CSP connect-src does not allow VITE_BACKEND_URL origin "${origin}".`);
    }
  } catch {
    problems.push(`VITE_BACKEND_URL is not a valid URL: "${backendUrl}".`);
  }
}

if (problems.length > 0) {
  console.error("\nCSP check failed:\n" + problems.map((p) => `  - ${p}`).join("\n") + "\n");
  process.exit(1);
}

console.log("CSP check passed.");
