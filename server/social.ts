// Reader features: shelves & favourites, follow readers, stats, timeline, achievements,
// release calendar, regional availability and notifications.
import { inAppOnly } from "./inapp";
import type { Express, Request, Response, NextFunction } from "express";
import { storage, pub, CH_VISIBLE, SERIES_VISIBLE } from "./storage";
import { officialChapters } from "./mangadex";
import {
  BADGES, DEFAULT_PREFS, STATUS_SHELVES, COUNTRIES, regionAllowed, regionLabel,
  type BadgeStats, type EarnedBadge, type FullStats, type NotifyPrefs, type NotificationType, type Shelf, type ShelfItem, type TimelineEvent, type CalendarEvent,
} from "@shared/platform";
import type { PublicUser } from "@shared/schema";

const db = storage.raw();
const DAY = 864e5;
const IST = 5.5 * 3600e3;
const dayOf = (t: number) => Math.floor((t + IST) / DAY);
const ORIGIN: Record<string, string> = { manga: "Japan", manhwa: "South Korea", manhua: "China", comic: "Webcomic" };

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT, actor_id INTEGER, read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
CREATE TABLE IF NOT EXISTS user_badges (user_id INTEGER NOT NULL, badge TEXT NOT NULL, earned_at INTEGER NOT NULL, PRIMARY KEY (user_id, badge));
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_world_history_user ON world_history(user_id, at);
CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_type, target_id);
`);

// ======================= Notifications =======================
export function prefsOf(userId: number): NotifyPrefs {
  const r: any = db.prepare(`SELECT notify_prefs FROM users WHERE id = ?`).get(userId);
  try { return { ...DEFAULT_PREFS, ...JSON.parse(r?.notify_prefs || "{}") }; } catch { return { ...DEFAULT_PREFS }; }
}
const PREF_KEY: Record<NotificationType, keyof NotifyPrefs | null> = { chapter: "chapter", reply: "reply", follow: "follow", badge: "badge", system: "system", approval: null, moderation: null };
export function notify(userIds: number | number[], n: { type: NotificationType; title: string; body?: string; link?: string | null; actorId?: number | null }) {
  const ids = Array.from(new Set(Array.isArray(userIds) ? userIds : [userIds])).filter((u) => u > 0 && u !== n.actorId);
  if (!ids.length) return 0;
  const key = PREF_KEY[n.type];
  const ins = db.prepare(`INSERT INTO notifications (user_id, type, title, body, link, actor_id, created_at) VALUES (?,?,?,?,?,?,?)`);
  let sent = 0;
  db.transaction(() => {
    for (const u of ids) {
      if (key && !prefsOf(u)[key]) continue;
      ins.run(u, n.type, n.title.slice(0, 160), (n.body ?? "").slice(0, 500), n.link ?? null, n.actorId ?? null, Date.now());
      sent++;
    }
  })();
  return sent;
}
export function staffIds(): number[] {
  return db.prepare(`SELECT id FROM users WHERE role IN ('admin','moderator') AND banned = 0`).all().map((r: any) => r.id);
}

/** Tell followers when a chapter is approved and its release time arrives. Runs every minute. */
export function deliverChapterNotifications() {
  const due = db.prepare(`SELECT c.id, c.number, c.title, c.series_id, s.title AS s_title, s.slug, s.creator_id FROM chapters c JOIN series s ON s.id = c.series_id
    WHERE c.notified = 0 AND ${CH_VISIBLE} AND ${SERIES_VISIBLE} LIMIT 50`).all() as any[];
  for (const c of due) {
    const followers = db.prepare(`SELECT user_id FROM follows WHERE (target_type = 'series' AND target_id = ?) OR (target_type = 'creator' AND target_id = ?)`).all(c.series_id, c.creator_id).map((r: any) => r.user_id);
    notify(followers, { type: "chapter", title: `New chapter: ${c.s_title}`, body: `Chapter ${c.number}${c.title ? ` · ${c.title}` : ""} is out now.`, link: `/read/${c.id}`, actorId: c.creator_id });
    db.prepare(`UPDATE chapters SET notified = 1 WHERE id = ?`).run(c.id);
  }
  // series whose last approval happened while unpublished chapters were pending get picked up next tick
  db.prepare(`UPDATE chapters SET notified = 1 WHERE notified = 0 AND approval = 'rejected'`).run();
}

// ======================= Regions =======================
const VALID = new Set(COUNTRIES.map(([c]) => c));
export function countryOf(req: Request, user?: { id: number } | null): string | null {
  if (user) {
    const r: any = db.prepare(`SELECT country FROM users WHERE id = ?`).get(user.id);
    if (r?.country && VALID.has(r.country)) return r.country;
  }
  for (const h of ["cf-ipcountry", "x-vercel-ip-country", "x-country-code", "cloudfront-viewer-country"]) {
    const v = String(req.headers[h] ?? "").toUpperCase();
    if (/^[A-Z]{2}$/.test(v) && v !== "XX") return v;
  }
  const lang = String(req.headers["accept-language"] ?? "").match(/[a-z]{2,3}-([A-Z]{2})/);
  return lang ? lang[1] : null;
}
export function seriesRegion(seriesId: number, country: string | null) {
  const r: any = db.prepare(`SELECT regions FROM series WHERE id = ?`).get(seriesId);
  const regions = r?.regions ?? "";
  return { blocked: !regionAllowed(regions, country), country, label: regionLabel(regions), regions };
}

// ======================= Shelves & favourites =======================
// reading_list_items.series_id: positive = MANGASALT series id, negative = -AniList id (worldwide catalogue)
function ensureDefaultShelves(userId: number) {
  const has = db.prepare(`SELECT 1 FROM reading_lists WHERE user_id = ? AND kind IN ('favourites','status') LIMIT 1`).get(userId);
  if (has) return;
  const now = Date.now();
  const ins = db.prepare(`INSERT INTO reading_lists (user_id, name, kind, visibility, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`);
  db.transaction(() => {
    ins.run(userId, "Favourites", "favourites", "public", "My all-time favourite series.", now, now);
    STATUS_SHELVES.forEach((n, i) => ins.run(userId, n, "status", "private", "", now + i + 1, now + i + 1));
  })();
}
function itemsOf(listId: number, limit = 500): ShelfItem[] {
  const rows = db.prepare(`SELECT ri.series_id AS sid, ri.created_at,
      s.slug, s.title AS s_title, s.cover AS s_cover, s.type AS s_type, s.approval, s.removed,
      w.title AS w_title, w.cover AS w_cover, w.type AS w_type
    FROM reading_list_items ri
    LEFT JOIN series s ON ri.series_id > 0 AND s.id = ri.series_id
    LEFT JOIN world_titles w ON ri.series_id < 0 AND w.anilist_id = -ri.series_id
    WHERE ri.list_id = ? ORDER BY ri.created_at DESC, ri.id DESC LIMIT ?`).all(listId, limit) as any[];
  return rows.flatMap((r): ShelfItem[] => {
    if (r.sid > 0) {
      if (!r.slug || r.approval !== "approved" || r.removed) return [];
      return [{ key: `local:${r.sid}`, kind: "local", id: r.sid, title: r.s_title, cover: r.s_cover, type: r.s_type, href: `/series/${r.slug}`, addedAt: r.created_at }];
    }
    if (!r.w_title) return [];
    return [{ key: `world:${-r.sid}`, kind: "world", id: -r.sid, title: r.w_title, cover: r.w_cover, type: r.w_type, href: `/title/${-r.sid}`, addedAt: r.created_at }];
  });
}
function shelfRow(r: any, withItems = false, owner?: PublicUser): Shelf {
  const items = itemsOf(r.id, withItems ? 500 : 4);
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM reading_list_items WHERE list_id = ?`).get(r.id) as any).n;
  return {
    id: r.id, name: r.name, description: r.description ?? "", kind: r.kind, visibility: r.visibility, count,
    covers: items.slice(0, 4).map((i) => i.cover), updatedAt: r.updated_at || r.created_at || 0, owner,
    items: withItems ? items : undefined,
  };
}
export const shelves = {
  mine(userId: number) {
    ensureDefaultShelves(userId);
    const rows = db.prepare(`SELECT * FROM reading_lists WHERE user_id = ? AND kind != 'saved' ORDER BY CASE kind WHEN 'favourites' THEN 0 WHEN 'status' THEN 1 ELSE 2 END, created_at`).all(userId) as any[];
    return rows.map((r) => shelfRow(r));
  },
  publicOf(userId: number) {
    const rows = db.prepare(`SELECT * FROM reading_lists WHERE user_id = ? AND kind != 'saved' AND visibility = 'public' ORDER BY CASE kind WHEN 'favourites' THEN 0 ELSE 1 END, updated_at DESC`).all(userId) as any[];
    return rows.map((r) => shelfRow(r)).filter((s) => s.count > 0 || s.kind === "custom" || s.kind === "collection");
  },
  get(id: number, viewer?: number) {
    const r: any = db.prepare(`SELECT l.*, u.id AS uid FROM reading_lists l JOIN users u ON u.id = l.user_id WHERE l.id = ? AND l.kind != 'saved' AND u.banned = 0`).get(id);
    if (!r) return undefined;
    const isMine = r.user_id === viewer;
    if (!isMine && r.visibility !== "public") return undefined;
    const owner = pub(db.prepare(`SELECT * FROM users WHERE id = ?`).get(r.user_id));
    return { ...shelfRow(r, true, owner), isMine };
  },
  create(userId: number, d: { name: string; description: string; visibility: string; kind: string }) {
    ensureDefaultShelves(userId);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM reading_lists WHERE user_id = ?`).get(userId) as any).n;
    if (n >= 60) throw Object.assign(new Error("You can have up to 60 shelves"), { status: 400 });
    const now = Date.now();
    const r = db.prepare(`INSERT INTO reading_lists (user_id, name, description, visibility, kind, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(userId, d.name, d.description, d.visibility === "public" ? "public" : "private", d.kind === "collection" ? "collection" : "custom", now, now);
    return Number(r.lastInsertRowid);
  },
  owned(userId: number, id: number) { return db.prepare(`SELECT * FROM reading_lists WHERE id = ? AND user_id = ? AND kind != 'saved'`).get(id, userId) as any; },
  update(id: number, d: { name?: string; description?: string; visibility?: string }, kind: string) {
    const sets: string[] = [], vals: any[] = [];
    if (d.name !== undefined && kind !== "favourites") { sets.push("name = ?"); vals.push(d.name); }
    if (d.description !== undefined) { sets.push("description = ?"); vals.push(d.description); }
    if (d.visibility !== undefined) { sets.push("visibility = ?"); vals.push(d.visibility === "public" ? "public" : "private"); }
    sets.push("updated_at = ?"); vals.push(Date.now());
    db.prepare(`UPDATE reading_lists SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  },
  remove(id: number) { db.transaction(() => { db.prepare(`DELETE FROM reading_list_items WHERE list_id = ?`).run(id); db.prepare(`DELETE FROM reading_lists WHERE id = ?`).run(id); })(); },
  /** key: local:<id> | world:<anilistId> */
  toggle(listId: number, sid: number, on?: boolean) {
    const ex = db.prepare(`SELECT id FROM reading_list_items WHERE list_id = ? AND series_id = ?`).get(listId, sid);
    const want = on ?? !ex;
    if (want && !ex) db.prepare(`INSERT INTO reading_list_items (list_id, series_id, created_at) VALUES (?,?,?)`).run(listId, sid, Date.now());
    if (!want && ex) db.prepare(`DELETE FROM reading_list_items WHERE list_id = ? AND series_id = ?`).run(listId, sid);
    db.prepare(`UPDATE reading_lists SET updated_at = ? WHERE id = ?`).run(Date.now(), listId);
    return want;
  },
  membership(userId: number, sid: number) {
    ensureDefaultShelves(userId);
    return db.prepare(`SELECT l.id, l.name, l.kind, l.visibility, EXISTS(SELECT 1 FROM reading_list_items ri WHERE ri.list_id = l.id AND ri.series_id = ?) AS on_shelf
      FROM reading_lists l WHERE l.user_id = ? AND l.kind != 'saved' ORDER BY CASE l.kind WHEN 'favourites' THEN 0 WHEN 'status' THEN 1 ELSE 2 END, l.created_at`).all(sid, userId)
      .map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, visibility: r.visibility, on: !!r.on_shelf }));
  },
  favouritesId(userId: number) {
    ensureDefaultShelves(userId);
    return (db.prepare(`SELECT id FROM reading_lists WHERE user_id = ? AND kind = 'favourites'`).get(userId) as any).id as number;
  },
};
function parseKey(key: unknown): number | null {
  const m = String(key ?? "").match(/^(local|world):(\d{1,9})$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "local") return storage.seriesExists(id) ? id : null;
  return db.prepare(`SELECT 1 FROM world_titles WHERE anilist_id = ?`).get(id) ? -id : null;
}

// ======================= Stats, counters, timeline =======================
type Read = { key: string; sid: number; chapter: string; at: number; title: string; cover: string; type: string; href: string };
function reads(userId: number, since = 0): Read[] {
  const local = db.prepare(`SELECT h.series_id, h.chapter_id, h.viewed_at AS at, s.title, s.cover, s.type, s.slug FROM history h JOIN series s ON s.id = h.series_id
    WHERE h.user_id = ? AND h.chapter_id IS NOT NULL AND h.viewed_at >= ? ORDER BY h.viewed_at`).all(userId, since) as any[];
  const world = db.prepare(`SELECT h.anilist_id, h.chapter, h.at, w.title, w.cover, w.type FROM world_history h LEFT JOIN world_titles w ON w.anilist_id = h.anilist_id
    WHERE h.user_id = ? AND h.at >= ? ORDER BY h.at`).all(userId, since) as any[];
  return [
    ...local.map((r) => ({ key: `local:${r.series_id}`, sid: r.series_id, chapter: String(r.chapter_id), at: r.at, title: r.title, cover: r.cover, type: r.type, href: `/series/${r.slug}` })),
    ...world.map((r) => ({ key: `world:${r.anilist_id}`, sid: -r.anilist_id, chapter: String(r.chapter), at: r.at, title: r.title ?? "Untitled", cover: r.cover ?? "", type: r.type ?? "manga", href: `/title/${r.anilist_id}` })),
  ].sort((a, b) => a.at - b.at);
}
function streaks(days: Set<number>) {
  const today = dayOf(Date.now());
  let streak = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  let best = 0, run = 0, prev = -9;
  for (const d of Array.from(days).sort((a, b) => a - b)) { run = d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { streak, best };
}
export function fullStats(userId: number): FullStats {
  const all = reads(userId);
  // a chapter counts once per title, however many times it's reopened
  const firstReads = new Map<string, Read>();
  for (const r of all) { const k = `${r.key}#${r.chapter}`; if (!firstReads.has(k)) firstReads.set(k, r); }
  const uniq = Array.from(firstReads.values());
  const days = new Set(all.map((r) => dayOf(r.at)));
  const { streak, best } = streaks(days);
  const today = dayOf(Date.now());
  const perDay = (n: number) => Array.from({ length: n }, (_, i) => { const d = today - n + 1 + i; return { day: d, count: uniq.filter((r) => dayOf(r.at) === d).length }; });
  const now = new Date(Date.now() + IST);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - IST, yearStart = Date.UTC(now.getUTCFullYear(), 0, 1) - IST;
  const byTypeMap = new Map<string, number>(), byTitle = new Map<string, { key: string; title: string; cover: string; href: string; chapters: number }>();
  const byHour = Array(24).fill(0);
  for (const r of uniq) {
    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + 1);
    const t = byTitle.get(r.key) ?? { key: r.key, title: r.title, cover: r.cover, href: r.href, chapters: 0 };
    t.chapters++; byTitle.set(r.key, t);
    byHour[new Date(r.at + IST).getUTCHours()]++;
  }
  return {
    chapters: uniq.length, titles: byTitle.size, streak, bestStreak: best, activeDays: days.size,
    thisWeek: uniq.filter((r) => dayOf(r.at) > today - 7).length,
    thisMonth: uniq.filter((r) => r.at >= monthStart).length,
    thisYear: uniq.filter((r) => r.at >= yearStart).length,
    week: perDay(7), last30: perDay(30),
    byType: Array.from(byTypeMap, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    topTitles: Array.from(byTitle.values()).sort((a, b) => b.chapters - a.chapters).slice(0, 8),
    byHour,
  };
}
export function chapterCounter(userId: number, sid: number) {
  if (sid > 0) {
    const read = (db.prepare(`SELECT COUNT(DISTINCT chapter_id) AS n FROM history WHERE user_id = ? AND series_id = ? AND chapter_id IS NOT NULL`).get(userId, sid) as any).n;
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM chapters c WHERE c.series_id = ? AND ${CH_VISIBLE}`).get(sid) as any).n;
    return { read, total };
  }
  const read = (db.prepare(`SELECT COUNT(DISTINCT chapter) AS n FROM world_history WHERE user_id = ? AND anilist_id = ?`).get(userId, -sid) as any).n;
  return { read, total: null as number | null };
}

export function timeline(userId: number, before = Date.now(), limit = 40): TimelineEvent[] {
  const since = before - 120 * DAY;
  const ev: TimelineEvent[] = [];
  // group reads of the same title on the same day
  const groups = new Map<string, { r: Read; first: number; last: number; n: number; chapters: Set<string> }>();
  for (const r of reads(userId, since).filter((r) => r.at < before)) {
    const k = `${r.key}@${dayOf(r.at)}`;
    const g = groups.get(k) ?? { r, first: r.at, last: r.at, n: 0, chapters: new Set<string>() };
    g.last = Math.max(g.last, r.at); g.chapters.add(r.chapter); g.n = g.chapters.size; groups.set(k, g);
  }
  for (const [k, g] of Array.from(groups)) ev.push({ id: `r:${k}`, at: g.last, kind: "read", title: g.r.title, detail: g.n === 1 ? (g.r.sid < 0 ? `Read chapter ${g.r.chapter}` : "Read 1 chapter") : `Read ${g.n} chapters`, cover: g.r.cover, href: g.r.href, count: g.n });
  const q = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
  for (const r of q(`SELECT ri.created_at AS at, ri.series_id AS sid, l.name, l.kind, l.id AS lid, s.title AS st, s.cover AS sc, s.slug, w.title AS wt, w.cover AS wc FROM reading_list_items ri JOIN reading_lists l ON l.id = ri.list_id
      LEFT JOIN series s ON ri.series_id > 0 AND s.id = ri.series_id LEFT JOIN world_titles w ON ri.series_id < 0 AND w.anilist_id = -ri.series_id
      WHERE l.user_id = ? AND ri.created_at BETWEEN ? AND ?`, userId, since, before - 1)) {
    const title = r.sid > 0 ? r.st : r.wt; if (!title) continue;
    ev.push({ id: `s:${r.lid}:${r.sid}`, at: r.at, kind: r.kind === "favourites" ? "favourite" : "saved", title, detail: r.kind === "favourites" ? "Added to Favourites" : `Added to ${r.name}`, cover: r.sid > 0 ? r.sc : r.wc, href: r.sid > 0 ? `/series/${r.slug}` : `/title/${-r.sid}` });
  }
  for (const r of q(`SELECT l.created_at AS at, s.title, s.cover, s.slug, s.id FROM series_likes l JOIN series s ON s.id = l.series_id WHERE l.user_id = ? AND l.created_at BETWEEN ? AND ?`, userId, since, before - 1))
    ev.push({ id: `l:${r.id}`, at: r.at, kind: "liked", title: r.title, detail: "Liked", cover: r.cover, href: `/series/${r.slug}` });
  for (const r of q(`SELECT l.created_at AS at, w.title, w.cover, w.anilist_id AS id FROM world_likes l JOIN world_titles w ON w.anilist_id = l.anilist_id WHERE l.user_id = ? AND l.created_at BETWEEN ? AND ?`, userId, since, before - 1))
    ev.push({ id: `wl:${r.id}`, at: r.at, kind: "liked", title: r.title, detail: "Liked", cover: r.cover, href: `/title/${r.id}` });
  for (const r of q(`SELECT c.id, c.created_at AS at, c.body, c.series_id, s.title, s.cover, s.slug, w.title AS wt, w.cover AS wc FROM comments c LEFT JOIN series s ON c.series_id > 0 AND s.id = c.series_id LEFT JOIN world_titles w ON c.series_id < 0 AND w.anilist_id = -c.series_id
      WHERE c.user_id = ? AND c.hidden = 0 AND c.created_at BETWEEN ? AND ?`, userId, since, before - 1)) {
    const title = r.series_id > 0 ? r.title : r.wt; if (!title) continue;
    ev.push({ id: `c:${r.id}`, at: r.at, kind: "comment", title, detail: `“${String(r.body).slice(0, 90)}${r.body.length > 90 ? "…" : ""}”`, cover: r.series_id > 0 ? r.cover : r.wc, href: r.series_id > 0 ? `/series/${r.slug}` : `/title/${-r.series_id}` });
  }
  for (const r of q(`SELECT badge, earned_at AS at FROM user_badges WHERE user_id = ? AND earned_at BETWEEN ? AND ?`, userId, since, before - 1)) {
    const b = BADGES.find((x) => x.id === r.badge); if (!b) continue;
    ev.push({ id: `b:${r.badge}`, at: r.at, kind: "badge", title: b.name, detail: `Badge earned · ${b.description}` });
  }
  for (const r of q(`SELECT f.created_at AS at, u.username, u.display_name FROM follows f JOIN users u ON u.id = f.target_id WHERE f.user_id = ? AND f.target_type = 'user' AND f.created_at BETWEEN ? AND ?`, userId, since, before - 1))
    ev.push({ id: `f:${r.username}`, at: r.at, kind: "follow", title: r.display_name, detail: "Started following", href: `/u/${r.username}` });
  for (const r of q(`SELECT s.id, s.created_at AS at, s.title, s.cover, s.slug FROM series s WHERE s.creator_id = ? AND ${SERIES_VISIBLE} AND s.created_at BETWEEN ? AND ?`, userId, since, before - 1))
    ev.push({ id: `p:${r.id}`, at: r.at, kind: "published", title: r.title, detail: "Published a new series", cover: r.cover, href: `/series/${r.slug}` });
  return ev.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ======================= Achievements =======================
function badgeStats(userId: number): BadgeStats {
  const s = fullStats(userId);
  const n = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as any).n as number;
  const u: any = db.prepare(`SELECT created_at FROM users WHERE id = ?`).get(userId);
  return {
    chapters: s.chapters, titles: s.titles, bestStreak: s.bestStreak, types: new Set(s.byType.filter((t) => ["manga", "manhwa", "manhua"].includes(t.type)).map((t) => t.type)).size,
    shelves: n(`SELECT COUNT(*) AS n FROM reading_lists WHERE user_id = ? AND kind IN ('custom','collection')`, userId),
    publicShelves: n(`SELECT COUNT(*) AS n FROM reading_lists l WHERE user_id = ? AND visibility = 'public' AND kind IN ('custom','collection') AND EXISTS(SELECT 1 FROM reading_list_items i WHERE i.list_id = l.id)`, userId),
    favourites: n(`SELECT COUNT(*) AS n FROM reading_list_items i JOIN reading_lists l ON l.id = i.list_id WHERE l.user_id = ? AND l.kind = 'favourites'`, userId),
    comments: n(`SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND hidden = 0`, userId),
    followers: n(`SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND target_id = ?`, userId),
    following: n(`SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND user_id = ?`, userId),
    published: n(`SELECT COUNT(*) AS n FROM series s WHERE s.creator_id = ? AND ${SERIES_VISIBLE}`, userId),
    days: Math.floor((Date.now() - (u?.created_at ?? Date.now())) / DAY),
  };
}
/** Award new badges, notify, and return the full list with progress. */
export function badges(userId: number, award = true): EarnedBadge[] {
  const st = badgeStats(userId);
  const have = new Map((db.prepare(`SELECT badge, earned_at FROM user_badges WHERE user_id = ?`).all(userId) as any[]).map((r) => [r.badge, r.earned_at]));
  const out: EarnedBadge[] = [];
  for (const b of BADGES) {
    let at = have.get(b.id) ?? null;
    if (!at && award && b.test(st)) {
      at = Date.now();
      db.prepare(`INSERT OR IGNORE INTO user_badges (user_id, badge, earned_at) VALUES (?,?,?)`).run(userId, b.id, at);
      notify(userId, { type: "badge", title: `Badge unlocked: ${b.name}`, body: b.description, link: "/profile#badges" });
    }
    out.push({ id: b.id, name: b.name, description: b.description, icon: b.icon, tier: b.tier, earned: !!at, earnedAt: at, progress: b.progress ? b.progress(st) : [at ? 1 : 0, 1] });
  }
  return out;
}

// ======================= Release calendar =======================
const officialCache = new Map<number, { t: number; v: { number: string; title: string | null; publishedAt: string; publisher: string }[] }>();
async function officialFor(id: number, title: string) {
  const hit = officialCache.get(id);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
  try {
    const r = await officialChapters(id, [title]);
    const v = r.chapters.map((c) => ({ number: c.number, title: c.title, publishedAt: c.publishedAt, publisher: c.sources[0]?.publisher ?? "Official" }));
    officialCache.set(id, { t: Date.now(), v });
    return v;
  } catch { return hit?.v ?? []; }
}
export async function calendar(from: number, to: number, userId?: number, country?: string | null): Promise<CalendarEvent[]> {
  const now = Date.now();
  const mine = new Set<number>();
  if (userId) {
    for (const r of db.prepare(`SELECT target_id FROM follows WHERE user_id = ? AND target_type = 'series'`).all(userId) as any[]) mine.add(r.target_id);
    for (const r of db.prepare(`SELECT ri.series_id FROM reading_list_items ri JOIN reading_lists l ON l.id = ri.list_id WHERE l.user_id = ?`).all(userId) as any[]) mine.add(r.series_id);
  }
  // MANGASALT releases: published chapters plus approved chapters scheduled for later
  const local = db.prepare(`SELECT c.id, c.number, c.title, c.publish_at, s.id AS sid, s.title AS s_title, s.cover, s.slug, s.type, s.regions, u.display_name
    FROM chapters c JOIN series s ON s.id = c.series_id JOIN users u ON u.id = s.creator_id
    WHERE c.approval = 'approved' AND ${SERIES_VISIBLE} AND c.publish_at BETWEEN ? AND ? ORDER BY c.publish_at LIMIT 400`).all(from, to) as any[];
  const ev: CalendarEvent[] = local.filter((c) => regionAllowed(c.regions, country)).map((c) => ({
    id: `l${c.id}`, at: c.publish_at, title: c.s_title, chapter: `Ch. ${c.number}${c.title ? ` · ${c.title}` : ""}`, cover: c.cover, href: c.publish_at <= now ? `/read/${c.id}` : `/series/${c.slug}`,
    source: "mangasalt", publisher: `MANGASALT · ${c.display_name}`, origin: ORIGIN[c.type] ?? "Webcomic", type: c.type, upcoming: c.publish_at > now, regions: regionLabel(c.regions), mine: mine.has(c.sid),
  }));
  // official English releases for worldwide titles the reader saved, favourited or is reading
  if (userId && !inAppOnly()) {
    const titles = db.prepare(`SELECT DISTINCT w.anilist_id, w.title, w.cover, w.type FROM world_titles w WHERE w.anilist_id IN (
        SELECT anilist_id FROM world_saves WHERE user_id = @u UNION SELECT -ri.series_id FROM reading_list_items ri JOIN reading_lists l ON l.id = ri.list_id WHERE l.user_id = @u AND ri.series_id < 0
        UNION SELECT anilist_id FROM world_history WHERE user_id = @u AND at > @since) LIMIT 12`).all({ u: userId, since: now - 60 * DAY }) as any[];
    const lists = await Promise.all(titles.map((t) => Promise.race([officialFor(t.anilist_id, t.title), new Promise<any[]>((r) => setTimeout(() => r([]), 6000))])));
    titles.forEach((t, i) => {
      for (const c of lists[i]) {
        const at = Date.parse(c.publishedAt);
        if (!(at >= from && at <= to)) continue;
        ev.push({ id: `w${t.anilist_id}:${c.number}`, at, title: t.title, chapter: `Ch. ${c.number}${c.title ? ` · ${c.title}` : ""}`, cover: t.cover, href: `/title/${t.anilist_id}`,
          source: "official", publisher: c.publisher, origin: ORIGIN[t.type] ?? "Japan", type: t.type, upcoming: at > now, regions: "Depends on the publisher in your region", mine: true });
      }
    });
  }
  return ev.sort((a, b) => a.at - b.at);
}

// ======================= Reader profiles =======================
const followersOf = (id: number) => (db.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND target_id = ?`).get(id) as any).n as number;
const followingOf = (id: number) => (db.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND user_id = ?`).get(id) as any).n as number;
export function readerProfile(username: string, viewer?: number) {
  const r: any = db.prepare(`SELECT * FROM users WHERE username = ? AND banned = 0`).get(username.toLowerCase());
  if (!r) return undefined;
  const isMe = r.id === viewer;
  const isPrivate = !!r.private_profile && !isMe;
  const s = isPrivate ? null : fullStats(r.id);
  return {
    user: { ...pub(r), createdAt: r.created_at, country: r.country ?? null },
    followers: followersOf(r.id), following: followingOf(r.id),
    followedByMe: !!(viewer && db.prepare(`SELECT 1 FROM follows WHERE user_id = ? AND target_type = 'user' AND target_id = ?`).get(viewer, r.id)),
    isMe, isPrivate,
    shelves: isPrivate ? [] : isMe ? shelves.mine(r.id) : shelves.publicOf(r.id),
    badges: badges(r.id, isMe).filter((b) => b.earned),
    stats: s ? { chapters: s.chapters, titles: s.titles, streak: s.streak } : null,
    timeline: isPrivate ? null : timeline(r.id, Date.now(), 15),
  };
}
function readerCards(rows: any[], viewer?: number) {
  return rows.map((r) => ({
    ...pub(r), followers: followersOf(r.id),
    chapters: (db.prepare(`SELECT (SELECT COUNT(DISTINCT chapter_id) FROM history WHERE user_id = @u AND chapter_id IS NOT NULL) + (SELECT COUNT(*) FROM (SELECT DISTINCT anilist_id, chapter FROM world_history WHERE user_id = @u)) AS n`).get({ u: r.id }) as any).n,
    followedByMe: !!(viewer && db.prepare(`SELECT 1 FROM follows WHERE user_id = ? AND target_type = 'user' AND target_id = ?`).get(viewer, r.id)),
  }));
}
export function searchReaders(q: string, viewer?: number) {
  const rows = q
    ? db.prepare(`SELECT * FROM users WHERE banned = 0 AND (username LIKE @q OR display_name LIKE @q) ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.target_type='user' AND f.target_id = users.id) DESC LIMIT 30`).all({ q: `%${q}%` })
    : db.prepare(`SELECT u.* FROM users u WHERE u.banned = 0 AND u.private_profile = 0 ORDER BY (SELECT COUNT(*) FROM history h WHERE h.user_id = u.id AND h.viewed_at > @s) + (SELECT COUNT(*) FROM world_history h WHERE h.user_id = u.id AND h.at > @s) DESC, u.id LIMIT 24`).all({ s: Date.now() - 30 * DAY });
  return readerCards(rows as any[], viewer);
}
export function followList(username: string, which: "followers" | "following", viewer?: number) {
  const u: any = db.prepare(`SELECT id, private_profile FROM users WHERE username = ? AND banned = 0`).get(username.toLowerCase());
  if (!u) return undefined;
  if (u.private_profile && u.id !== viewer) return [];
  const rows = which === "followers"
    ? db.prepare(`SELECT u.* FROM follows f JOIN users u ON u.id = f.user_id WHERE f.target_type = 'user' AND f.target_id = ? AND u.banned = 0 ORDER BY f.created_at DESC LIMIT 200`).all(u.id)
    : db.prepare(`SELECT u.* FROM follows f JOIN users u ON u.id = f.target_id WHERE f.target_type = 'user' AND f.user_id = ? AND u.banned = 0 ORDER BY f.created_at DESC LIMIT 200`).all(u.id);
  return readerCards(rows as any[], viewer);
}
/** Recent activity from readers you follow. */
export function friendsFeed(userId: number) {
  const ids = db.prepare(`SELECT target_id FROM follows WHERE user_id = ? AND target_type = 'user'`).all(userId).map((r: any) => r.target_id) as number[];
  const out: (TimelineEvent & { user: PublicUser })[] = [];
  for (const id of ids.slice(0, 50)) {
    const u: any = db.prepare(`SELECT * FROM users WHERE id = ? AND banned = 0 AND private_profile = 0`).get(id);
    if (!u) continue;
    for (const e of timeline(id, Date.now(), 6)) out.push({ ...e, user: pub(u) });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 40);
}

// ======================= Routes =======================
type Helpers = { me: (req: Request) => PublicUser | undefined; requireAuth: (req: Request, res: Response, next: NextFunction) => void };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerSocialRoutes(app: Express, { me, requireAuth }: Helpers) {
  const uid = (req: Request) => (req as any).user.id as number;

  // ----- shelves -----
  app.get("/api/shelves", requireAuth, (req, res) => res.json(shelves.mine(uid(req))));
  app.post("/api/shelves", requireAuth, (req, res) => {
    const name = str(req.body?.name, 60);
    if (name.length < 1) return res.status(400).json({ message: "Give your shelf a name" });
    try {
      const id = shelves.create(uid(req), { name, description: str(req.body?.description, 300), visibility: str(req.body?.visibility, 10), kind: str(req.body?.kind, 12) });
      const key = parseKey(req.body?.add);
      if (key) shelves.toggle(id, key, true);
      badges(uid(req));
      res.status(201).json({ id });
    } catch (e: any) { res.status(e.status ?? 500).json({ message: e.message }); }
  });
  app.get("/api/shelves/:id", (req, res) => {
    const s = shelves.get(Number(req.params.id), me(req)?.id);
    s ? res.json(s) : res.status(404).json({ message: "This shelf is private or doesn't exist" });
  });
  app.patch("/api/shelves/:id", requireAuth, (req, res) => {
    const s = shelves.owned(uid(req), Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Shelf not found" });
    const name = req.body?.name !== undefined ? str(req.body.name, 60) : undefined;
    if (name !== undefined && !name) return res.status(400).json({ message: "Give your shelf a name" });
    shelves.update(s.id, { name, description: req.body?.description !== undefined ? str(req.body.description, 300) : undefined, visibility: req.body?.visibility }, s.kind);
    badges(uid(req));
    res.json({ ok: true });
  });
  app.delete("/api/shelves/:id", requireAuth, (req, res) => {
    const s = shelves.owned(uid(req), Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Shelf not found" });
    if (s.kind === "favourites") return res.status(400).json({ message: "Favourites can't be deleted" });
    shelves.remove(s.id);
    res.json({ ok: true });
  });
  app.post("/api/shelves/:id/items", requireAuth, (req, res) => {
    const s = shelves.owned(uid(req), Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Shelf not found" });
    const key = parseKey(req.body?.key);
    if (!key) return res.status(404).json({ message: "Title not found" });
    // a title sits on one reading-status shelf at a time
    const on = req.body?.on === undefined ? undefined : !!req.body.on;
    const result = shelves.toggle(s.id, key, on);
    if (result && s.kind === "status") db.prepare(`DELETE FROM reading_list_items WHERE series_id = ? AND list_id IN (SELECT id FROM reading_lists WHERE user_id = ? AND kind = 'status' AND id != ?)`).run(key, uid(req), s.id);
    badges(uid(req));
    res.json({ on: result });
  });
  app.get("/api/shelves/membership/:key", requireAuth, (req, res) => {
    const key = parseKey(req.params.key);
    if (!key) return res.json({ shelves: [], favourite: false, counter: null });
    const list = shelves.membership(uid(req), key);
    res.json({ shelves: list, favourite: list.some((l: any) => l.kind === "favourites" && l.on), counter: chapterCounter(uid(req), key) });
  });
  app.post("/api/favourites/:key", requireAuth, (req, res) => {
    const key = parseKey(req.params.key);
    if (!key) return res.status(404).json({ message: "Title not found" });
    const on = shelves.toggle(shelves.favouritesId(uid(req)), key);
    badges(uid(req));
    res.json({ favourite: on });
  });

  // ----- stats, timeline, badges -----
  app.get("/api/me/full-stats", requireAuth, (req, res) => res.json(fullStats(uid(req))));
  app.get("/api/me/timeline", requireAuth, (req, res) => res.json(timeline(uid(req), Number(req.query.before) || Date.now(), 60)));
  app.get("/api/me/badges", requireAuth, (req, res) => res.json(badges(uid(req))));
  app.get("/api/me/feed", requireAuth, (req, res) => res.json(friendsFeed(uid(req))));

  // ----- readers -----
  app.get("/api/readers", (req, res) => res.json(searchReaders(str(req.query.q, 40), me(req)?.id)));
  app.get("/api/readers/:username", (req, res) => {
    const p = readerProfile(String(req.params.username), me(req)?.id);
    p ? res.json(p) : res.status(404).json({ message: "Reader not found" });
  });
  for (const which of ["followers", "following"] as const)
    app.get(`/api/readers/:username/${which}`, (req, res) => {
      const l = followList(String(req.params.username), which, me(req)?.id);
      l ? res.json(l) : res.status(404).json({ message: "Reader not found" });
    });

  // ----- settings -----
  app.get("/api/me/settings", requireAuth, (req, res) => {
    const r: any = db.prepare(`SELECT private_profile, country, bio, display_name FROM users WHERE id = ?`).get(uid(req));
    res.json({ privateProfile: !!r.private_profile, country: r.country ?? null, detectedCountry: countryOf(req, null), bio: r.bio, displayName: r.display_name, notify: prefsOf(uid(req)) });
  });
  app.patch("/api/me/settings", requireAuth, (req, res) => {
    const b = req.body ?? {};
    if (b.privateProfile !== undefined) db.prepare(`UPDATE users SET private_profile = ? WHERE id = ?`).run(b.privateProfile ? 1 : 0, uid(req));
    if (b.country !== undefined) db.prepare(`UPDATE users SET country = ? WHERE id = ?`).run(VALID.has(b.country) ? b.country : null, uid(req));
    if (b.bio !== undefined) db.prepare(`UPDATE users SET bio = ? WHERE id = ?`).run(str(b.bio, 200), uid(req));
    if (b.displayName !== undefined) { const d = str(b.displayName, 40); if (d) db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(d, uid(req)); }
    if (b.notify && typeof b.notify === "object") {
      const next = { ...prefsOf(uid(req)) };
      for (const k of Object.keys(DEFAULT_PREFS) as (keyof NotifyPrefs)[]) if (typeof b.notify[k] === "boolean") next[k] = b.notify[k];
      db.prepare(`UPDATE users SET notify_prefs = ? WHERE id = ?`).run(JSON.stringify(next), uid(req));
    }
    res.json({ ok: true, user: pub(db.prepare(`SELECT * FROM users WHERE id = ?`).get(uid(req))) });
  });
  app.get("/api/region", (req, res) => res.json({ country: countryOf(req, me(req)), countries: COUNTRIES }));

  // ----- calendar -----
  app.get("/api/calendar", async (req, res) => {
    const from = Number(req.query.from) || Date.now() - 14 * DAY;
    const to = Math.min(Number(req.query.to) || Date.now() + 31 * DAY, from + 62 * DAY);
    const u = me(req);
    try { res.json(await calendar(from, to, u?.id, countryOf(req, u))); }
    catch (e: any) { res.status(502).json({ message: e.message ?? "Calendar unavailable" }); }
  });

  // ----- notifications -----
  app.get("/api/notifications", requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT n.*, u.id AS a_id, u.username, u.display_name, u.bio, u.avatar_hue, u.is_creator FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 60`).all(uid(req)) as any[];
    const unread = (db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0`).get(uid(req)) as any).n;
    res.json({ unread, items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, read: !!r.read, createdAt: r.created_at,
      actor: r.a_id ? { id: r.a_id, username: r.username, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator } : null })) });
  });
  app.get("/api/notifications/unread", requireAuth, (req, res) => res.json({ unread: (db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0`).get(uid(req)) as any).n,
    latest: db.prepare(`SELECT id, title, body, link FROM notifications WHERE user_id = ? AND read = 0 ORDER BY id DESC LIMIT 1`).get(uid(req)) ?? null }));
  app.post("/api/notifications/read-all", requireAuth, (req, res) => { db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(uid(req)); res.json({ ok: true }); });
  app.post("/api/notifications/:id/read", requireAuth, (req, res) => { db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(Number(req.params.id), uid(req)); res.json({ ok: true }); });
  app.delete("/api/notifications", requireAuth, (req, res) => { db.prepare(`DELETE FROM notifications WHERE user_id = ? AND read = 1`).run(uid(req)); res.json({ ok: true }); });

  setInterval(() => { try { deliverChapterNotifications(); } catch (e) { console.error("chapter notifications", e); } }, 60e3).unref();
  setTimeout(() => { try { deliverChapterNotifications(); } catch {} }, 5e3).unref();
}
