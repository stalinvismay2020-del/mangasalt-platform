// "In-app only" reading mode.
// When on (the default), MANGASALT only lists titles that can be read inside the app: series whose pages
// MANGASALT hosts and has the right to show. Outside reading links (publisher sites, Tapas, MANGA Plus),
// externally licensed chapter rows and catalogue-only titles are hidden everywhere.
// Admins can switch it off in Admin -> Settings to bring back the worldwide catalogue.
import { storage, SERIES_VISIBLE } from "./storage";
import { settings } from "./admin";
import type { WorldCard, WorldHome, WorldPage, WorldShelfItem } from "@shared/world";

const db = storage.raw();
const KEY = "in_app_only";

export const inAppOnly = (): boolean => settings.get<boolean>(KEY, true) !== false;
export const setInAppOnly = (on: boolean) => settings.set(KEY, !!on);

/** A chapter a reader can open right now (published, approved, released, pages uploaded). */
const READABLE_CH = `c.published = 1 AND c.approval = 'approved' AND c.publish_at <= @now AND c.pages != '[]'`;
const READABLE_SERIES = `${SERIES_VISIBLE} AND EXISTS (SELECT 1 FROM chapters c WHERE c.series_id = s.id AND ${READABLE_CH})`;

const TYPES = new Set(["manga", "manhwa", "manhua", "comic"]);

function toCard(r: any): WorldCard {
  const genres: string[] = (() => { try { return JSON.parse(r.genres || "[]"); } catch { return []; } })();
  return {
    id: r.anilist_id ?? r.id, title: r.title, altTitle: null, cover: r.cover, color: null,
    type: TYPES.has(r.type) ? r.type : "comic", status: r.status === "completed" ? "completed" : r.status === "hiatus" ? "hiatus" : "ongoing",
    chapters: r.chapters ?? null, score: r.rating ?? null, popularity: r.views ?? 0, genres, year: r.year ?? null,
    banner: r.banner ?? null, blurb: String(r.synopsis ?? "").slice(0, 220), official: [], source: "mangasalt", href: `/series/${r.slug}`,
  };
}

const SELECT = `SELECT s.*, (SELECT COUNT(*) FROM chapters c WHERE c.series_id = s.id AND ${READABLE_CH}) AS chapters,
  (SELECT MAX(c.publish_at) FROM chapters c WHERE c.series_id = s.id AND ${READABLE_CH}) AS last_at FROM series s`;

const ORDER: Record<string, string> = {
  popular: "s.views DESC", trending: "last_at DESC, s.views DESC", score: "s.rating DESC", newest: "last_at DESC", latest: "last_at DESC",
  title: "s.title COLLATE NOCASE", match: "s.views DESC", favourites: "s.views DESC",
};

/** Search over hosted, readable series. Mirrors the worldwide search filters. */
export function hostedSearch(o: { q?: string; genres?: string[]; type?: string; status?: string; sort?: string; period?: string; page?: number; perPage?: number }): WorldPage {
  const per = Math.min(50, o.perPage ?? 24), page = Math.max(1, o.page ?? 1);
  if (o.period === "upcoming") return { items: [], hasNext: false, page, total: 0 };
  const where = [READABLE_SERIES], p: any = { now: Date.now() };
  if (o.q) { where.push(`(s.title LIKE @q OR s.synopsis LIKE @q)`); p.q = `%${o.q}%`; }
  if (o.type && TYPES.has(o.type)) { where.push(`s.type = @type`); p.type = o.type; }
  if (o.status === "completed" || o.status === "ongoing" || o.status === "hiatus") { where.push(`s.status = @status`); p.status = o.status; }
  (o.genres ?? []).slice(0, 6).forEach((g, i) => { where.push(`EXISTS (SELECT 1 FROM json_each(s.genres) j WHERE lower(j.value) = lower(@g${i}))`); p[`g${i}`] = g; });
  const sql = `${SELECT} WHERE ${where.join(" AND ")}`;
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(p) as any).n as number;
  let order = ORDER[o.sort ?? "popular"] ?? ORDER.popular;
  if (o.q && (o.sort ?? "match") === "match") { order = `(s.title LIKE @qs) DESC, ${ORDER.popular}`; p.qs = `${o.q}%`; }
  const rows = db.prepare(`${sql} ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`).all(p) as any[];
  return { items: rows.map(toCard), hasNext: page * per < total, page, total };
}

export function hostedHome(): WorldHome {
  const s = (o: Parameters<typeof hostedSearch>[0]) => hostedSearch({ perPage: 20, ...o }).items;
  return { trending: s({ sort: "trending" }), manhwa: s({ type: "manhwa" }), manga: s({ type: "manga" }), manhua: s({ type: "manhua" }), top: s({ sort: "score" }) };
}

/** Hosted titles that share genres with the given ones (for "If you like" on title pages). */
export function hostedLike(genres: string[], exceptId?: number): WorldCard[] {
  const all = hostedSearch({ perPage: 50 }).items.filter((c) => c.id !== exceptId);
  const g = new Set(genres.map((x) => x.toLowerCase()));
  return all.map((c) => ({ c, n: c.genres.filter((x) => g.has(x.toLowerCase())).length })).sort((a, b) => b.n - a.n).slice(0, 10).map((x) => x.c);
}

/** Readers' "continue reading" shelf built from hosted chapters they opened. */
export function hostedShelf(userId: number): { saved: WorldShelfItem[]; reading: WorldShelfItem[] } {
  const rows = db.prepare(`SELECT s.id, s.slug, s.title, s.cover, s.type, c.number, c.id AS cid, MAX(h.viewed_at) AS at FROM history h JOIN series s ON s.id = h.series_id
    LEFT JOIN chapters c ON c.id = h.chapter_id WHERE h.user_id = ? AND ${SERIES_VISIBLE} GROUP BY s.id ORDER BY at DESC LIMIT 12`).all(userId) as any[];
  const reading = rows.map((r) => ({ id: r.id, title: r.title, cover: r.cover, type: r.type, color: null, chapter: r.number != null ? String(r.number) : null, href: r.cid ? `/read/${r.cid}` : `/series/${r.slug}` }));
  return { saved: [], reading };
}

/** Strip every outside reading link from a catalogue title. */
export function stripExternal<T extends Record<string, any>>(t: T): T {
  return { ...t, official: [], readLinks: [], tapasUrl: null };
}
