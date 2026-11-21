// Client for the `catalog` Edge Function (server-side Dawghwa adapter).
import { SUPABASE_URL, SUPABASE_KEY } from "./supabase";

export type CatalogCard = {
  id: number; title: string; altTitles: string[]; cover: string | null; format: "manga" | "manhwa" | "manhua" | null;
  status: string | null; year: number | null; genres: string[]; score: number | null; adult: boolean;
};
export type Attribution = { name: string; url: string; via: string };
export type BrowseResult = { items: CatalogCard[]; page: number; hasNextPage: boolean; total: number | null; attribution: Attribution };
export type TitleDetails = CatalogCard & {
  titles: { english: string | null; romaji: string | null; native: string | null };
  description: string | null; banner: string | null; tags: string[]; authors: string[]; artists: string[];
  popularity: number | null; country: string | null; tracking: { site: string; url: string }[]; attribution: Attribution;
};
export type ChapterMeta = { key: string; number: number | null; label: string; title: string | null; publishedAt: string | null; language: string | null; pages: number | null; readable: boolean; source: string };
export type ChapterIndex = { status: "indexed" | "empty" | "no_match"; source: string; matchTitle: string | null; latestChapter: number | null; chapters: ChapterMeta[]; total: number };

export class CatalogError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number | null) { super(message); }
}

const BASE = `${SUPABASE_URL}/functions/v1/catalog`;

export async function catalog<T>(path: string, params: Record<string, string | number | undefined | null> = {}, signal?: AbortSignal): Promise<T> {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(u.toString(), { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new CatalogError(0, "NETWORK", "Can't reach the MANGASALT catalogue. Check your connection and try again.");
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = body?.error || `Catalogue request failed (${res.status}).`;
    throw new CatalogError(res.status, body?.code || "ERROR", msg, body?.retryAfter);
  }
  return body as T;
}

export const catalogKeys = {
  browse: (p: Record<string, unknown>) => ["catalog", "browse", p] as const,
  title: (id: number) => ["catalog", "title", id] as const,
  chapters: (id: number) => ["catalog", "chapters", id] as const,
};

export function describeCatalogError(e: unknown): { title: string; detail: string } {
  if (e instanceof CatalogError) {
    if (e.status === 404) return { title: "Not found", detail: e.message };
    if (e.status === 429) return { title: "Catalogue is busy", detail: `Too many requests right now.${e.retryAfter ? ` Try again in ${e.retryAfter}s.` : " Try again shortly."}` };
    if (e.status === 504) return { title: "Catalogue timed out", detail: "The Dawghwa catalogue service didn't answer in time. Retry in a moment." };
    if (e.status === 0) return typeof navigator !== "undefined" && navigator.onLine === false
      ? { title: "You're offline", detail: e.message }
      : { title: "Catalogue unreachable", detail: "The MANGASALT catalogue service didn't respond. Your library, history and MANGASALT-hosted series still work. Try again shortly." };
    return { title: "Catalogue unavailable", detail: `${/[.!?]$/.test(e.message.trim()) ? e.message.trim() : `${e.message.trim()}.`} Your library, history and MANGASALT-hosted series still work.` };
  }
  return { title: "Something went wrong", detail: e instanceof Error ? e.message : String(e) };
}
