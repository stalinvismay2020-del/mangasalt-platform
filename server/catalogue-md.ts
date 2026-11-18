// MangaDex as a SECOND catalogue source, for titles AniList doesn't have.
// Metadata only (title, cover, description, tags, status). MangaDex chapter pages are never fetched or shown:
// almost all of them are fan scanlations, which MANGASALT does not distribute.
// MangaDex API acceptable-use policy: credit MangaDex, no ads or paid access to API data, honest User-Agent,
// ~5 req/s per IP, and images must be proxied (no hotlinking). See https://api.mangadex.org/docs/
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import type { WorldCard } from "@shared/world";

const API = "https://api.mangadex.org";
const UA = { "User-Agent": "MANGASALT/1.0 (catalogue metadata; https://github.com/stalinvismay2020-del/mangasalt-platform)" };
/** Local ids for MangaDex-only titles live in their own range so they never collide with AniList ids. */
export const MD_BASE = 1_000_000_000;
export const isMdId = (id: number) => Number.isInteger(id) && id > MD_BASE;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp)$/i;

const db = storage.raw();
db.exec(`CREATE TABLE IF NOT EXISTS md_titles (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE, anilist_id INTEGER, checked_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)`);

// ---------- rate-limited, cached GET ----------
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { t: number; v: any }>();
let queue: Promise<unknown> = Promise.resolve();
let blockedUntil = 0;
async function get(p: string): Promise<any> {
  const hit = cache.get(p);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  if (Date.now() < blockedUntil) { if (hit) return hit.v; throw Object.assign(new Error("MangaDex is busy"), { status: 503 }); }
  // serialise requests, ~4 per second, well under MangaDex's 5 req/s limit
  const job = queue.then(async () => {
    const r = await fetch(API + p, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (r.status === 429) { blockedUntil = Date.now() + (Number(r.headers.get("retry-after")) || 30) * 1000; throw Object.assign(new Error("MangaDex is busy"), { status: 503 }); }
    if (!r.ok) throw Object.assign(new Error(`MangaDex error ${r.status}`), { status: r.status === 404 ? 404 : 502 });
    return r.json();
  });
  queue = job.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 250)));
  try {
    const v = await job;
    cache.set(p, { t: Date.now(), v });
    if (cache.size > 600) cache.delete(cache.keys().next().value!);
    return v;
  } catch (e) { if (hit) return hit.v; throw e; }
}

// ---------- ids ----------
export function localId(uuid: string): number {
  const row: any = db.prepare(`SELECT id FROM md_titles WHERE uuid = ?`).get(uuid);
  if (row) return row.id;
  const next = ((db.prepare(`SELECT MAX(id) AS m FROM md_titles`).get() as any).m ?? MD_BASE) + 1;
  db.prepare(`INSERT OR IGNORE INTO md_titles (id, uuid, created_at) VALUES (?, ?, ?)`).run(next, uuid, Date.now());
  return (db.prepare(`SELECT id FROM md_titles WHERE uuid = ?`).get(uuid) as any).id;
}
export function uuidOf(id: number): string | null {
  return ((db.prepare(`SELECT uuid FROM md_titles WHERE id = ?`).get(id) as any)?.uuid) ?? null;
}
/** If we found that a MangaDex title is really an AniList title, return that AniList id. */
export function anilistTwin(id: number): number | null {
  const r: any = db.prepare(`SELECT anilist_id FROM md_titles WHERE id = ?`).get(id);
  return r?.anilist_id > 0 ? r.anilist_id : null;
}

// ---------- mapping ----------
const GENRE_TAG: Record<string, string> = {
  Action: "Action", Adventure: "Adventure", Comedy: "Comedy", Drama: "Drama", Fantasy: "Fantasy", Horror: "Horror", "Mahou Shoujo": "Magical Girls",
  Mecha: "Mecha", Music: "Music", Mystery: "Mystery", Psychological: "Psychological", Romance: "Romance", "Sci-Fi": "Sci-Fi", "Slice of Life": "Slice of Life",
  Sports: "Sports", Supernatural: "Supernatural", Thriller: "Thriller",
};
const TAG_GENRE = Object.fromEntries(Object.entries(GENRE_TAG).map(([g, t]) => [t, g]));
const LANG: Record<string, string[]> = { manga: ["ja"], manhwa: ["ko"], manhua: ["zh", "zh-hk"] };
const STATUS: Record<string, string> = { ongoing: "ongoing", completed: "completed", hiatus: "hiatus", cancelled: "cancelled" };
const ORDER: Record<string, string> = {
  trending: "order[followedCount]=desc", popular: "order[followedCount]=desc", score: "order[rating]=desc", best: "order[rating]=desc", top: "order[rating]=desc",
  new: "order[year]=desc", az: "order[title]=asc", match: "order[relevance]=desc", chapters: "order[followedCount]=desc",
};
/** Fan-made derivative works are not catalogue titles. */
const EXCLUDE = ["Doujinshi", "Fan Colored"];
const isFanWork = (a: any) => (a.tags ?? []).some((t: any) => EXCLUDE.includes(t.attributes?.name?.en));
let tagIds: Record<string, string> | null = null;
async function tagId(name: string): Promise<string | null> {
  if (!tagIds) {
    const d = await get(`/manga/tag`);
    tagIds = Object.fromEntries((d.data ?? []).map((t: any) => [t.attributes?.name?.en, t.id]));
  }
  return tagIds![name] ?? null;
}

const pick = (o: Record<string, string> | undefined) => (o ? o.en ?? o["ja-ro"] ?? o["ko-ro"] ?? o["zh-ro"] ?? Object.values(o)[0] ?? "" : "");
function titles(a: any) {
  const main = pick(a.title);
  const en = a.title?.en ?? (a.altTitles ?? []).map((t: any) => t.en).find(Boolean) ?? null;
  const title = en || main;
  return { title, altTitle: main && main !== title ? main : null, all: [main, ...(a.altTitles ?? []).flatMap((t: any) => Object.values(t))].filter(Boolean) as string[] };
}
const typeOf = (l: string) => (l === "ko" ? "manhwa" : l === "zh" || l === "zh-hk" ? "manhua" : l === "ja" ? "manga" : "comic") as WorldCard["type"];
export const coverUrl = (uuid: string, file: string | undefined, size: 256 | 512 = 512) => (file ? `/api/md/cover/${uuid}/${file}?s=${size}` : "");
const clean = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_#>]+/g, "").replace(/\n?-{3,}[\s\S]*$/, "").replace(/\n{3,}/g, "\n\n").trim();

/** Official English publisher on MangaDex's links (engtl). Shown only as a name; the URL goes through verifiedUrl later. */
function englishPublisher(links: any): { site: string; url: string } | null {
  const u = links?.engtl;
  if (!u || typeof u !== "string") return null;
  const url = u.startsWith("http") ? u : `https://${u}`;
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const NAMES: Record<string, string> = { "viz.com": "VIZ", "yenpress.com": "Yen Press", "kodansha.us": "Kodansha", "sevenseasentertainment.com": "Seven Seas", "webtoons.com": "WEBTOON", "tapas.io": "Tapas", "tappytoon.com": "Tappytoon", "mangaplus.shueisha.co.jp": "MANGA Plus", "j-novel.club": "J-Novel Club", "darkhorse.com": "Dark Horse", "comikey.com": "Comikey", "azuki.co": "Azuki", "inkr.com": "INKR", "lezhinus.com": "Lezhin", "pocketcomics.com": "Pocket Comics", "manta.net": "Manta" };
    return NAMES[h] ? { site: NAMES[h], url } : null; // only recognised publishers count as an official English edition
  } catch { return null; }
}

function toCard(m: any, stats: any): WorldCard {
  const a = m.attributes;
  const t = titles(a);
  const cover = m.relationships?.find((r: any) => r.type === "cover_art")?.attributes?.fileName;
  const s = stats?.[m.id];
  const pub = englishPublisher(a.links);
  const last = Number(a.lastChapter);
  return {
    id: localId(m.id), title: t.title, altTitle: t.altTitle, cover: coverUrl(m.id, cover, 512), color: null, type: typeOf(a.originalLanguage),
    status: STATUS[a.status] ?? "ongoing", chapters: Number.isFinite(last) && last > 0 ? Math.floor(last) : null,
    score: s?.rating?.bayesian ? Math.round(s.rating.bayesian * 10) : null, popularity: s?.follows ?? 0,
    genres: (a.tags ?? []).map((x: any) => TAG_GENRE[x.attributes?.name?.en]).filter(Boolean), year: a.year ?? null, banner: null,
    blurb: clean(pick(a.description)).slice(0, 320), official: pub ? [pub.site] : [], source: "mangadex",
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u00c0-\uffff]+/g, "");

/**
 * Decide which MangaDex results AniList is really missing.
 * 1) MangaDex links.al present -> AniList has it.
 * 2) links.mal present -> ask AniList for idMal.
 * 3) otherwise compare normalised titles with an AniList title search.
 * Results are stored in md_titles so each title is checked once a week at most.
 */
type Gql = (q: string, v: Record<string, any>) => Promise<any>;
async function missingFromAniList(list: any[], gql: Gql, knownTitles: Set<string>): Promise<any[]> {
  const week = Date.now() - 7 * 86400000;
  const out: any[] = [];
  const toMal: any[] = [], toTitle: any[] = [];
  for (const m of list) {
    const a = m.attributes, id = localId(m.id);
    if (a.links?.al) { db.prepare(`UPDATE md_titles SET anilist_id = ?, checked_at = ? WHERE id = ?`).run(Number(a.links.al) || -1, Date.now(), id); continue; }
    const t = titles(a);
    if (t.all.some((x) => knownTitles.has(norm(x)))) continue; // already on this page from AniList
    const row: any = db.prepare(`SELECT anilist_id, checked_at FROM md_titles WHERE id = ?`).get(id);
    if (row.checked_at > week) { if (!(row.anilist_id > 0)) out.push(m); continue; }
    if (a.links?.mal) toMal.push(m); else toTitle.push(m);
  }
  const mark = (m: any, al: number | null) => db.prepare(`UPDATE md_titles SET anilist_id = ?, checked_at = ? WHERE uuid = ?`).run(al ?? 0, Date.now(), m.id);
  try {
    if (toMal.length) {
      const ids = toMal.map((m) => Number(m.attributes.links.mal)).filter(Boolean);
      const d = await gql(`query ($ids:[Int]) { Page(perPage:50) { media(idMal_in:$ids, type:MANGA) { id idMal } } }`, { ids });
      const byMal = new Map<number, number>((d.Page?.media ?? []).map((x: any) => [x.idMal, x.id]));
      for (const m of toMal) { const al = byMal.get(Number(m.attributes.links.mal)) ?? null; mark(m, al); if (!al) out.push(m); }
    }
    if (toTitle.length) {
      const batch = toTitle.slice(0, 12);
      const q = `query (${batch.map((_, i) => `$s${i}:String`).join(",")}) { ${batch.map((_, i) => `a${i}: Page(perPage:5) { media(search:$s${i}, type:MANGA) { id title { romaji english native } synonyms } }`).join(" ")} }`;
      const v = Object.fromEntries(batch.map((m, i) => [`s${i}`, titles(m.attributes).title]));
      const d = await gql(q, v);
      batch.forEach((m, i) => {
        const names = new Set(titles(m.attributes).all.map(norm));
        const hit = (d[`a${i}`]?.media ?? []).find((x: any) => [x.title?.romaji, x.title?.english, x.title?.native, ...(x.synonyms ?? [])].filter(Boolean).some((n: string) => names.has(norm(n))));
        mark(m, hit?.id ?? null);
        if (!hit) out.push(m);
      });
      // anything over the batch size waits for the next request rather than risk a duplicate
    }
  } catch { /* AniList busy: show nothing extra rather than risk duplicates */ }
  return out;
}

async function statsFor(ids: string[]) {
  if (!ids.length) return {};
  try { return (await get(`/statistics/manga?${ids.map((i) => `manga[]=${i}`).join("&")}`)).statistics ?? {}; } catch { return {}; }
}

export type MdSearch = { q?: string; genres?: string[]; type?: string; status?: string; sort?: string; period?: string; page?: number; official?: boolean };
/** MangaDex titles that match the filters and are NOT already in AniList. Empty when a filter can't be expressed on MangaDex. */
export async function mdExtras(o: MdSearch, gql: Gql, aniTitles: string[], limit = 12): Promise<WorldCard[]> {
  if (o.period || (o.status && !STATUS[o.status])) return []; // no faithful MangaDex equivalent
  const p: string[] = [`limit=${o.q ? 20 : 40}`, `offset=${((o.page ?? 1) - 1) * (o.q ? 20 : 40)}`, "contentRating[]=safe", "includes[]=cover_art"];
  if (o.q) p.push(`title=${encodeURIComponent(o.q)}`);
  p.push(ORDER[o.sort ?? (o.q ? "match" : "trending")] ?? ORDER.trending);
  if (o.type) { if (!LANG[o.type]) return []; LANG[o.type].forEach((l) => p.push(`originalLanguage[]=${l}`)); }
  if (o.status) p.push(`status[]=${STATUS[o.status]}`);
  for (const g of o.genres ?? []) { const t = GENRE_TAG[g] && (await tagId(GENRE_TAG[g])); if (!t) return []; p.push(`includedTags[]=${t}`); }
  if (o.genres?.length) p.push("includedTagsMode=AND");
  for (const name of EXCLUDE) { const t = await tagId(name); if (t) p.push(`excludedTags[]=${t}`); }
  const d = await get(`/manga?${p.join("&")}`);
  const known = new Set(aniTitles.map(norm));
  const miss = await missingFromAniList((d.data ?? []).filter((m: any) => !isFanWork(m.attributes)), gql, known);
  const stats = await statsFor(miss.map((m) => m.id));
  let cards = miss.map((m) => toCard(m, stats));
  if (!o.q) cards = cards.filter((c) => c.popularity >= 300); // browsing: skip near-empty entries
  if (o.official) cards = cards.filter((c) => c.official.length);
  return cards.slice(0, limit);
}

/** Full detail for a MangaDex-only title, shaped like an AniList title. */
export async function mdTitle(id: number) {
  const uuid = uuidOf(id);
  if (!uuid) throw Object.assign(new Error("Title not found"), { status: 404 });
  const d = await get(`/manga/${uuid}?includes[]=cover_art&includes[]=author&includes[]=artist`);
  const m = d.data, a = m?.attributes;
  if (!m || a.contentRating !== "safe" || isFanWork(a)) throw Object.assign(new Error("Title not found"), { status: 404 });
  const stats = await statsFor([uuid]);
  const base = toCard(m, stats);
  const file = m.relationships?.find((r: any) => r.type === "cover_art")?.attributes?.fileName;
  const pub = englishPublisher(a.links);
  const staff: { name: string; role: string }[] = [];
  for (const r of m.relationships ?? []) if ((r.type === "author" || r.type === "artist") && r.attributes?.name && !staff.some((s) => s.name === r.attributes.name && s.role === (r.type === "author" ? "Story" : "Art"))) staff.push({ name: r.attributes.name, role: r.type === "author" ? "Story" : "Art" });
  // "More like this": other MangaDex titles sharing its first two genre tags
  let recommendations: WorldCard[] = [];
  try {
    const tags = (a.tags ?? []).filter((t: any) => t.attributes?.group === "genre").slice(0, 2).map((t: any) => `includedTags[]=${t.id}`);
    if (tags.length) {
      const r = await get(`/manga?limit=12&contentRating[]=safe&includes[]=cover_art&order[followedCount]=desc&${tags.join("&")}`);
      recommendations = (r.data ?? []).filter((x: any) => x.id !== uuid && !isFanWork(x.attributes)).slice(0, 10).map((x: any) => {
        const c = toCard(x, {});
        const al = Number(x.attributes.links?.al);
        return al > 0 ? { ...c, id: al, source: "anilist" as const } : c; // AniList twin -> link to the AniList page instead
      });
    }
  } catch { /* recommendations are optional */ }
  return {
    ...base, cover: coverUrl(uuid, file, 512), tapasUrl: pub && /tapas\.io\/series\//.test(pub.url) ? pub.url : null,
    volumes: Number(a.lastVolume) || null, siteUrl: `https://mangadex.org/title/${uuid}`, mangadexId: uuid,
    description: clean(pick(a.description)), tags: (a.tags ?? []).filter((t: any) => t.attributes?.group !== "content").slice(0, 8).map((t: any) => t.attributes?.name?.en).filter(Boolean),
    staff: staff.slice(0, 4), readLinks: pub ? [{ site: pub.site, url: pub.url }] : [], recommendations,
  };
}

// ---------- cover proxy (MangaDex forbids hotlinking; we cache covers on disk) ----------
const COVERS = path.resolve("cache", "md-covers");
fs.mkdirSync(COVERS, { recursive: true });
export async function coverFile(uuid: string, file: string, size: number): Promise<string | null> {
  if (!UUID.test(uuid) || !FILE.test(file)) return null;
  const s = size === 256 ? 256 : 512;
  const local = path.join(COVERS, `${uuid}-${s}-${file}.jpg`);
  if (fs.existsSync(local)) return local;
  const r = await fetch(`https://uploads.mangadex.org/covers/${uuid}/${file}.${s}.jpg`, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 3_000_000) return null;
  fs.writeFileSync(local, buf);
  return local;
}

/** For the chapter list: the MangaDex uuid behind a local id (used only to read the OFFICIAL publisher chapter index). */
export const mdUuidFor = uuidOf;
