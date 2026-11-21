// Dawghwa API adapter (https://dawghwaapi.vercel.app — documented endpoints only).
// Endpoints used:
//   GET  /api/catalog                     discovery, search, pagination
//   GET  /api/titles/{ref}                title details
//   GET  /api/titles/{ref}/chapters       chapter index for one source (404 = no confident match)
//   POST /api/pages                       page image URLs (only for sources listed in DAWGHWA_AUTHORIZED_SOURCES)
// The API documents no authentication. It sends RateLimit-* and Retry-After headers (120 req / 60 s).

export class UpstreamError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number, public requestId?: string) {
    super(message);
  }
}

const BASE = (Deno.env.get("DAWGHWA_API_BASE") ?? "https://dawghwaapi.vercel.app").replace(/\/+$/, "");
const TIMEOUT_MS = Number(Deno.env.get("DAWGHWA_TIMEOUT_MS") ?? 12000);
// Comma-separated source ids whose pages MANGASALT holds rights/permission to display. Empty by default.
export const AUTHORIZED_SOURCES = new Set(
  (Deno.env.get("DAWGHWA_AUTHORIZED_SOURCES") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
export const INDEX_SOURCE = (Deno.env.get("DAWGHWA_INDEX_SOURCE") ?? "mangadex").toLowerCase();

// ── tiny TTL cache (per isolate) ─────────────────────────────────────────────
const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) { cache.delete(key); return undefined; }
  return hit.value as T;
}
function cacheSet(key: string, value: unknown, ttl: number) {
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), ttl, value });
}

let cooldownUntil = 0; // set after a 429 so we stop hammering the upstream

export function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    JSON.stringify({ level, event, service: "dawghwa", at: new Date().toISOString(), ...data }),
  );
}

async function call<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, unknown>; body?: unknown; ttl?: number } = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const key = method + " " + url.toString() + (opts.body ? JSON.stringify(opts.body) : "");
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;

  if (Date.now() < cooldownUntil) {
    throw new UpstreamError(429, "RATE_LIMITED", "The catalogue service is busy. Try again shortly.", Math.ceil((cooldownUntil - Date.now()) / 1000));
  }

  let lastErr: UpstreamError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const requestId = res.headers.get("x-request-id") ?? undefined;
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after") ?? 30);
        cooldownUntil = Date.now() + Math.min(ra, 120) * 1000;
        log("warn", "rate_limited", { path, retryAfter: ra, requestId });
        throw new UpstreamError(429, "RATE_LIMITED", "The catalogue service is rate limiting requests. Try again shortly.", ra, requestId);
      }
      if (!res.ok) {
        const code = typeof json?.code === "string" ? json.code : res.status === 404 ? "NOT_FOUND" : "UPSTREAM_ERROR";
        const msg = typeof json?.error === "string" ? json.error : `Catalogue service responded with ${res.status}`;
        const err = new UpstreamError(res.status, code, msg, undefined, requestId);
        if (res.status >= 500 && attempt === 0) { lastErr = err; log("warn", "retry", { path, status: res.status, requestId }); continue; }
        log(res.status >= 500 ? "error" : "info", "upstream_status", { path, status: res.status, code, ms: Date.now() - started, requestId });
        throw err;
      }
      if (json === null || typeof json !== "object") {
        log("error", "invalid_json", { path, ms: Date.now() - started, requestId });
        throw new UpstreamError(502, "INVALID_RESPONSE", "The catalogue service returned an unreadable response.", undefined, requestId);
      }
      if (opts.ttl) cacheSet(key, json, opts.ttl);
      return json as T;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      const timeout = (e as Error).name === "AbortError";
      lastErr = new UpstreamError(timeout ? 504 : 502, timeout ? "TIMEOUT" : "NETWORK", timeout ? "The catalogue service timed out." : "Could not reach the catalogue service.");
      log("error", timeout ? "timeout" : "network_error", { path, attempt, ms: Date.now() - started, message: String((e as Error).message) });
      if (attempt === 0) continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new UpstreamError(502, "UPSTREAM_ERROR", "Catalogue request failed.");
}

// ── validation / normalisation helpers ──────────────────────────────────────
const str = (v: unknown, max = 5000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const httpsUrl = (v: unknown): string | null => {
  const s = str(v, 2000);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};
const strArr = (v: unknown, max = 30): string[] => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter((x): x is string => !!x).slice(0, max) : []);
const FORMATS = new Set(["manga", "manhwa", "manhua"]);
const STATUSES = new Set(["ongoing", "completed", "hiatus", "cancelled", "upcoming"]);

function refToId(ref: unknown): number | null {
  const m = typeof ref === "string" ? ref.match(/^anilist:(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

export type CatalogCard = {
  id: number; title: string; altTitles: string[]; cover: string | null; format: string | null;
  status: string | null; year: number | null; genres: string[]; score: number | null; adult: boolean;
};

function card(raw: any): CatalogCard | null {
  const id = refToId(raw?.ref) ?? (raw?.provider === "anilist" ? num(raw?.providerId) : null);
  const title = str(raw?.title, 300);
  if (!id || !title) return null;
  const format = str(raw?.format)?.toLowerCase() ?? null;
  const status = str(raw?.status)?.toLowerCase() ?? null;
  return {
    id, title, altTitles: strArr(raw?.altTitles, 8), cover: httpsUrl(raw?.coverImage),
    format: format && FORMATS.has(format) ? format : null,
    status: status && STATUSES.has(status) ? status : null,
    year: num(raw?.year), genres: strArr(raw?.genres, 12), score: num(raw?.score), adult: raw?.adult === true,
  };
}

function attribution(raw: any) {
  return { name: str(raw?.name, 100) ?? "AniList", url: httpsUrl(raw?.url) ?? "https://anilist.co", via: "Dawghwa API" };
}

export async function browse(p: { q?: string; genre?: string; format?: string; status?: string; sort?: string; year?: string; page?: number; limit?: number }) {
  const sort = ["trending", "popularity", "score", "newest", "relevance", "title"].includes(p.sort ?? "") ? p.sort : (p.q ? "relevance" : "trending");
  const json: any = await call("GET", "/api/catalog", {
    query: { q: p.q?.slice(0, 120), genre: p.genre, format: p.format, status: p.status, year: p.year, sort, nsfw: "false",
             page: Math.max(1, Math.min(p.page ?? 1, 500)), limit: Math.max(1, Math.min(p.limit ?? 24, 50)) },
    ttl: p.q ? 120_000 : 600_000,
  });
  if (!Array.isArray(json.items)) throw new UpstreamError(502, "INVALID_RESPONSE", "Catalogue response had no items list.");
  const items = json.items.map(card).filter((x: CatalogCard | null): x is CatalogCard => !!x && !x.adult);
  return {
    items,
    page: num(json.pageInfo?.page) ?? p.page ?? 1,
    hasNextPage: json.pageInfo?.hasNextPage === true,
    total: num(json.pageInfo?.total),
    attribution: attribution(json.attribution),
  };
}

export async function details(id: number) {
  const json: any = await call("GET", `/api/titles/anilist:${id}`, { ttl: 1_800_000 });
  const t = json.title;
  const base = card(t);
  if (!base) throw new UpstreamError(502, "INVALID_RESPONSE", "Title response was missing required fields.");
  if (base.adult) throw new UpstreamError(404, "NOT_FOUND", "This title is not available on MANGASALT.");
  const desc = str(t.description, 6000);
  return {
    ...base,
    titles: { english: str(t.titles?.english, 300), romaji: str(t.titles?.romaji, 300), native: str(t.titles?.native, 300) },
    description: desc ? desc.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim() : null,
    banner: httpsUrl(t.bannerImage),
    tags: Array.isArray(t.tags) ? t.tags.filter((x: any) => x && x.spoiler !== true).map((x: any) => str(x.name, 80)).filter(Boolean).slice(0, 12) : [],
    authors: strArr(t.authors, 6), artists: strArr(t.artists, 6),
    popularity: num(t.popularity), country: str(t.countryOfOrigin, 4),
    // Only metadata/tracking links; reading-platform links are deliberately not passed through.
    tracking: Array.isArray(t.links)
      ? t.links.filter((l: any) => l?.type === "tracking" && ["AniList", "MyAnimeList"].includes(l?.site)).map((l: any) => ({ site: l.site, url: httpsUrl(l.url) })).filter((l: any) => l.url)
      : [],
    attribution: attribution(json.attribution),
  };
}

export type ChapterMeta = { key: string; number: number | null; label: string; title: string | null; publishedAt: string | null; language: string | null; pages: number | null; readable: boolean; source: string };

export async function chapters(id: number, order: "asc" | "desc") {
  const source = INDEX_SOURCE;
  try {
    const json: any = await call("GET", `/api/titles/anilist:${id}/chapters`, { query: { source, order }, ttl: 900_000 });
    const list: ChapterMeta[] = (Array.isArray(json.chapters) ? json.chapters : []).map((c: any, i: number) => {
      const n = num(c?.number);
      const rawTitle = str(c?.title, 300);
      const title = rawTitle && !/^(chapter|ch\.?|episode|ep\.?)\s*\d+(\.\d+)?$/i.test(rawTitle) ? rawTitle : null;
      return {
        key: str(c?.id, 200) ?? `${source}-${n ?? i}`,
        number: n, label: n !== null ? `Chapter ${n}` : (str(c?.chapterLabel, 60) ?? rawTitle ?? `Entry ${i + 1}`),
        title, publishedAt: str(c?.publishedAt, 40), language: str(c?.language, 10), pages: num(c?.pages),
        readable: AUTHORIZED_SOURCES.has(source), source,
      };
    });
    return { status: list.length ? "indexed" : "empty", source, matchTitle: str(json.match?.title, 300), latestChapter: num(json.match?.latestChapter), chapters: list, total: num(json.totalChapters) ?? list.length };
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404 && !/has no manga with id/i.test(e.message)) {
      return { status: "no_match", source, matchTitle: null, latestChapter: null, chapters: [] as ChapterMeta[], total: 0 };
    }
    throw e;
  }
}

export async function pages(source: string, chapterId: string) {
  const src = source.toLowerCase();
  if (!AUTHORIZED_SOURCES.has(src)) {
    throw new UpstreamError(403, "NOT_AUTHORIZED", "MANGASALT is not authorized to display pages from this source.");
  }
  const json: any = await call("POST", "/api/pages", { body: { source: src, chapterId: chapterId.slice(0, 200) }, ttl: 600_000 });
  const list = (Array.isArray(json.pages) ? json.pages : [])
    .map((p: any) => ({ index: num(p?.index), url: httpsUrl(p?.url) }))
    .filter((p: any) => p.url)
    .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  if (!list.length) throw new UpstreamError(404, "NO_PAGES", "No pages are available for this chapter.");
  return { pages: list.map((p: any) => p.url as string), total: list.length, source: src };
}

export async function health() {
  const started = Date.now();
  try {
    await call("GET", "/api/catalog", { query: { limit: 1 }, ttl: 30_000 });
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, code: e instanceof UpstreamError ? e.code : "UNKNOWN" };
  }
}
