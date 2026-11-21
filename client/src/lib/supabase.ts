import { createClient } from "@supabase/supabase-js";

// Public browser configuration. The publishable key is designed to be shipped to browsers;
// every table is protected by row-level security. Service-role keys never live in this app.
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configError = !URL_ || !KEY
  ? "MANGASALT is missing its Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). Add them to .env and rebuild."
  : null;

// Some embedded previews block localStorage. Fall back to memory so the app still works
// (the session then lasts until the tab is closed).
const memory = new Map<string, string>();
const safeStorage = {
  getItem(k: string) { try { return window.localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
  setItem(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { memory.set(k, v); } },
  removeItem(k: string) { try { window.localStorage.removeItem(k); } catch { memory.delete(k); } },
};
export const storage = safeStorage;

export const supabase = createClient(URL_ ?? "https://invalid.supabase.co", KEY ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: safeStorage, flowType: "implicit" },
});

export const SUPABASE_URL = URL_ ?? "";
export const SUPABASE_KEY = KEY ?? "";

/** Public URL for an object in the public `pages` bucket. Absolute URLs pass through. */
export function pageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/")) return "." + path;
  return `${SUPABASE_URL}/storage/v1/object/public/pages/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Turn a PostgREST / auth error into a readable message without hiding it. */
export function errMsg(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const anyE = e as any;
  const m = anyE.message || anyE.error_description || anyE.error || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Network error — check your connection and try again.";
  return m;
}
