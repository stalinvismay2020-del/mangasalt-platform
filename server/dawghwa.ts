// Dawghwa API (https://dawghwaapi.vercel.app), used for two things only:
//  1. a backup catalogue (AniList / MangaUpdates metadata) when AniList itself is busy or down
//  2. finding a title's official WEBTOON page, so readers can open it on WEBTOON
// Its scanlation sources and chapter-page endpoints are deliberately NOT used: MANGASALT only
// shows chapters from official publishers, open licenses or their own creators.
import type { WorldCard } from "./anilist";

const BASE = process.env.DAWGHWA_API ?? "https://dawghwaapi.vercel.app";
const SAFE_GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
const BLOCKED = ["Hentai", "Ecchi", "Smut", "Adult", "Mature", "Pornographic", "Erotica"];
const SORT: Record<string, string> = { trending: "trending", popular: "popularity", score: "score", new: "newest", match: "relevance", az: "title", chapters: "popularity" };

async function get(path: string, timeoutMs: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { headers: { Accept: "application/json", "User-Agent": "MANGASALT/1.0" }, signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`Dawghwa ${r.status}`), { status: r.status });
    return await r.json();
  } finally { clearTimeout(timer); }
}

const cache = new Map<string, { t: number; v: any }>();
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return Promise.resolve(hit.v);
  return fn().then((v) => {
    cache.set(key, { t: Date.now(), v });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return v;
  });
}

function toCard(m: any, rank: number): WorldCard | null {
  const id = Number(String(m.ref ?? "").startsWith("anilist:") ? m.providerId : NaN);
  if (!Number.isInteger(id) || id <= 0 || m.adult) return null;
  const genres: string[] = Array.isArray(m.genres) ? m.genres : [];
  if (genres.some((g) => BLOCKED.includes(g))) return null;
  const type = ["manga", "manhwa", "manhua"].includes(m.format) ? m.format : "comic";
  return {
    id, title: String(m.title ?? "Untitled"), altTitle: Array.isArray(m.altTitles) ? m.altTitles.find((t: string) => /^[\x20-\x7e]+$/.test(t) && t !== m.title) ?? null : null,
    cover: String(m.coverImage ?? ""), color: null, type, status: m.status ?? "ongoing",
    chapters: Number.isFinite(m.latestChapter) ? m.latestChapter : null, score: Number.isFinite(m.score) ? m.score : null,
    popularity: Math.max(0, 10000 - rank * 10), // the backup catalogue has no reader counts; keep its ranking order
    genres: genres.filter((g) => SAFE_GENRES.includes(g)), year: m.year ?? null, banner: null, blurb: "", official: [],
  };
}

/** Same shape as worldSearch(). Used only when AniList can't answer. */
export async function backupSearch(o: { q?: string; genres?: string[]; type?: string; status?: string; sort?: string; page?: number; perPage?: number }) {
  const p = new URLSearchParams({ provider: "anilist", nsfw: "false", page: String(o.page ?? 1), limit: String(Math.min(o.perPage ?? 24, 50)) });
  p.set("sort", SORT[o.sort ?? (o.q ? "match" : "trending")] ?? "trending");
  if (o.q) p.set("q", o.q);
  const g = (o.genres ?? []).filter((x) => SAFE_GENRES.includes(x));
  if (g[0]) p.set("genre", g[0]);
  if (o.type && ["manga", "manhwa", "manhua"].includes(o.type)) p.set("format", o.type);
  if (o.status && ["ongoing", "completed", "hiatus", "cancelled"].includes(o.status)) p.set("status", o.status);
  const d = await cached(`cat:${p}`, 10 * 60_000, () => get(`/api/catalog?${p}`, 12_000));
  const offset = ((o.page ?? 1) - 1) * Number(p.get("limit"));
  const items = (d.items ?? []).map((m: any, i: number) => toCard(m, offset + i)).filter(Boolean)
    .filter((c: WorldCard) => g.every((x) => c.genres.includes(x))) as WorldCard[];
  return { items, hasNext: !!d.pageInfo?.hasNextPage, page: d.pageInfo?.page ?? o.page ?? 1, total: d.pageInfo?.total ?? items.length, backup: true };
}

export type WebtoonLink = { url: string; title: string; latestChapter: number | null } | null;
const WEBTOON_URL = /^https:\/\/(www\.|m\.)?webtoons\.com\/[a-z-]+\/[^?#]+\/list\?title_no=\d+$/;

/** The title's official page on WEBTOON (exact title matches only), or null. Cached for a day. */
export function webtoonLink(anilistId: number): Promise<WebtoonLink> {
  return cached(`wt:${anilistId}`, 24 * 3600_000, async () => {
    const d = await get(`/api/titles/anilist:${anilistId}/sources?sources=webtoon`, 20_000);
    const s = (d.sources ?? []).find((x: any) => x.sourceId === "webtoon");
    const best = s?.available ? s.best : null;
    if (!best || best.confidence !== "exact" || !WEBTOON_URL.test(String(best.url))) return null;
    return { url: best.url.replace("://m.", "://www."), title: String(best.title ?? ""), latestChapter: Number.isFinite(best.latestChapter) ? best.latestChapter : null };
  });
}
