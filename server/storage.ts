import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PublicUser, SeriesCard, CreatorCard, DiscussionItem, HomeData, User } from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', avatar_hue INTEGER NOT NULL DEFAULT 0, is_creator INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS series (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, type TEXT NOT NULL, genres TEXT NOT NULL DEFAULT '[]', synopsis TEXT NOT NULL, cover TEXT NOT NULL, creator_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ongoing', views INTEGER NOT NULL DEFAULT 0, rights TEXT NOT NULL DEFAULT 'original', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, series_id INTEGER NOT NULL, number INTEGER NOT NULL, title TEXT NOT NULL, pages TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS series_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, series_id INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id, series_id));
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, series_id INTEGER NOT NULL, chapter_id INTEGER, parent_id INTEGER, user_id INTEGER NOT NULL, body TEXT NOT NULL, spoiler INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS comment_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, comment_id INTEGER NOT NULL, UNIQUE(user_id, comment_id));
CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, UNIQUE(user_id, target_type, target_id));
CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, series_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reading_lists (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reading_list_items (id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, series_id INTEGER NOT NULL, UNIQUE(list_id, series_id));
CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, series_id INTEGER NOT NULL, chapter_id INTEGER, viewed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, comment_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
`);
sqlite.exec(`
CREATE TABLE IF NOT EXISTS world_titles (anilist_id INTEGER PRIMARY KEY, title TEXT NOT NULL, cover TEXT NOT NULL, type TEXT NOT NULL, color TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS world_likes (user_id INTEGER NOT NULL, anilist_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, anilist_id));
CREATE TABLE IF NOT EXISTS world_saves (user_id INTEGER NOT NULL, anilist_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, anilist_id));
CREATE TABLE IF NOT EXISTS world_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, anilist_id INTEGER NOT NULL, chapter TEXT, at INTEGER NOT NULL);
`);
for (const [col, def] of [["rating", "INTEGER NOT NULL DEFAULT 80"], ["year", "INTEGER NOT NULL DEFAULT 2025"]]) {
  const cols = (sqlite.prepare(`PRAGMA table_info(series)`).all() as any[]).map((c) => c.name);
  if (!cols.includes(col)) sqlite.exec(`ALTER TABLE series ADD COLUMN ${col} ${def}`);
}

// ---------- helpers ----------
export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const test = scryptSync(pw, salt, 32);
  return timingSafeEqual(test, Buffer.from(hash, "hex"));
}
const pub = (r: any): PublicUser => ({
  id: r.id, username: r.username, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator,
});
const WEEK = 7 * 24 * 3600 * 1000;

const SERIES_SELECT = `
SELECT s.*, u.id AS u_id, u.username AS u_username, u.display_name AS u_display_name, u.bio AS u_bio, u.avatar_hue AS u_avatar_hue, u.is_creator AS u_is_creator,
  (SELECT COUNT(*) FROM series_likes l WHERE l.series_id = s.id) AS likes,
  (SELECT COUNT(*) FROM series_likes l WHERE l.series_id = s.id AND l.created_at > @since) AS recent_likes,
  (SELECT COUNT(*) FROM chapters c WHERE c.series_id = s.id) AS chapter_count,
  (SELECT COALESCE(MAX(number),0) FROM chapters c WHERE c.series_id = s.id) AS latest_chapter,
  (SELECT COALESCE(MAX(created_at),0) FROM chapters c WHERE c.series_id = s.id) AS latest_chapter_at,
  (SELECT COUNT(*) FROM comments cm WHERE cm.series_id = s.id AND cm.created_at > @since) AS recent_comments,
  EXISTS(SELECT 1 FROM series_likes l WHERE l.series_id = s.id AND l.user_id = @me) AS liked_by_me,
  EXISTS(SELECT 1 FROM reading_list_items ri JOIN reading_lists rl ON rl.id = ri.list_id WHERE ri.series_id = s.id AND rl.user_id = @me AND rl.name = 'Saved') AS saved_by_me,
  EXISTS(SELECT 1 FROM follows f WHERE f.target_type='series' AND f.target_id = s.id AND f.user_id = @me) AS followed_by_me,
  EXISTS(SELECT 1 FROM chapters c WHERE c.series_id = s.id AND c.pages != '[]') AS readable
FROM series s JOIN users u ON u.id = s.creator_id`;

function toCard(r: any): SeriesCard {
  return {
    id: r.id, slug: r.slug, title: r.title, type: r.type, genres: JSON.parse(r.genres), synopsis: r.synopsis, cover: r.cover,
    status: r.status, views: r.views, rights: r.rights, likes: r.likes, recentLikes: r.recent_likes, chapterCount: r.chapter_count,
    latestChapter: r.latest_chapter, latestChapterAt: r.latest_chapter_at, likedByMe: !!r.liked_by_me, savedByMe: !!r.saved_by_me, followedByMe: !!r.followed_by_me, rating: r.rating / 10, year: r.year, readable: !!r.readable,
    creator: { id: r.u_id, username: r.u_username, displayName: r.u_display_name, bio: r.u_bio, avatarHue: r.u_avatar_hue, isCreator: r.u_is_creator },
  };
}

export class Storage {
  // ---------- auth ----------
  createUser(username: string, password: string, displayName: string): User {
    const hue = Math.floor(Math.random() * 360);
    const info = sqlite.prepare(`INSERT INTO users (username, password, display_name, avatar_hue, created_at) VALUES (?,?,?,?,?)`)
      .run(username.toLowerCase(), hashPassword(password), displayName, hue, Date.now());
    return this.getUserRaw(Number(info.lastInsertRowid))!;
  }
  getUserRaw(id: number): User | undefined {
    const r: any = sqlite.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!r) return undefined;
    return { id: r.id, username: r.username, password: r.password, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator, createdAt: r.created_at };
  }
  getUserByUsername(username: string): any {
    return sqlite.prepare(`SELECT * FROM users WHERE username = ?`).get(username.toLowerCase());
  }
  createSession(userId: number) {
    const token = randomBytes(24).toString("hex");
    sqlite.prepare(`INSERT INTO sessions (token, user_id) VALUES (?,?)`).run(token, userId);
    return token;
  }
  userFromToken(token?: string): PublicUser | undefined {
    if (!token) return undefined;
    const r = sqlite.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
    return r ? pub(r) : undefined;
  }
  deleteSession(token: string) { sqlite.prepare(`DELETE FROM sessions WHERE token = ?`).run(token); }

  // ---------- series ----------
  listSeries(opts: { me?: number; type?: string; q?: string; genre?: string; status?: string; order?: "trending" | "likes" | "latest" | "views" | "week" | "az" | "rating" | "match"; limit?: number }): SeriesCard[] {
    const where: string[] = [];
    const params: any = { since: Date.now() - WEEK, me: opts.me ?? -1, limit: opts.limit ?? 24 };
    if (opts.type) { where.push(`s.type = @type`); params.type = opts.type; }
    if (opts.q) {
      where.push(`(s.title LIKE @q OR s.genres LIKE @q OR u.display_name LIKE @q OR s.synopsis LIKE @q)`);
      params.q = `%${opts.q}%`;
    }
    if (opts.genre) { where.push(`s.genres LIKE @genre`); params.genre = `%"${opts.genre}"%`; }
    if (opts.status) { where.push(`s.status = @status`); params.status = opts.status; }
    const order = {
      week: `recent_likes DESC, likes DESC`,
      az: `s.title COLLATE NOCASE ASC`,
      rating: `s.rating DESC`,
      match: opts.q ? `(CASE WHEN s.title LIKE @q THEN 0 ELSE 1 END), likes DESC` : `likes DESC`,
      trending: `(recent_likes * 5 + recent_comments * 3 + s.views / 200.0) DESC`,
      likes: `likes DESC, s.views DESC`,
      latest: `latest_chapter_at DESC`,
      views: `s.views DESC`,
    }[opts.order ?? "trending"];
    const sql = `${SERIES_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${opts.order === "trending" ? "readable DESC, " : ""}${order} LIMIT @limit`;
    return sqlite.prepare(sql).all(params).map(toCard);
  }

  toggleSeriesLike(userId: number, seriesId: number) {
    const existing = sqlite.prepare(`SELECT id FROM series_likes WHERE user_id = ? AND series_id = ?`).get(userId, seriesId);
    if (existing) sqlite.prepare(`DELETE FROM series_likes WHERE user_id = ? AND series_id = ?`).run(userId, seriesId);
    else sqlite.prepare(`INSERT INTO series_likes (user_id, series_id, created_at) VALUES (?,?,?)`).run(userId, seriesId, Date.now());
    const likes = (sqlite.prepare(`SELECT COUNT(*) AS n FROM series_likes WHERE series_id = ?`).get(seriesId) as any).n;
    return { liked: !existing, likes };
  }
  seriesExists(id: number) { return !!sqlite.prepare(`SELECT 1 FROM series WHERE id = ?`).get(id); }

  // ---------- creators ----------
  topCreators(me?: number, limit = 6): CreatorCard[] {
    return sqlite.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM series s WHERE s.creator_id = u.id) AS series_count,
        (SELECT COUNT(*) FROM follows f WHERE f.target_type = 'creator' AND f.target_id = u.id) AS followers,
        (SELECT COUNT(*) FROM series_likes l JOIN series s ON s.id = l.series_id WHERE s.creator_id = u.id) AS total_likes,
        EXISTS(SELECT 1 FROM follows f WHERE f.target_type='creator' AND f.target_id = u.id AND f.user_id = ?) AS followed_by_me
      FROM users u WHERE u.is_creator = 1 ORDER BY total_likes DESC LIMIT ?`).all(me ?? -1, limit)
      .map((r: any) => ({ ...pub(r), seriesCount: r.series_count, followers: r.followers, totalLikes: r.total_likes, followedByMe: !!r.followed_by_me }));
  }
  toggleFollow(userId: number, targetType: "series" | "creator", targetId: number) {
    const existing = sqlite.prepare(`SELECT id FROM follows WHERE user_id=? AND target_type=? AND target_id=?`).get(userId, targetType, targetId);
    if (existing) sqlite.prepare(`DELETE FROM follows WHERE user_id=? AND target_type=? AND target_id=?`).run(userId, targetType, targetId);
    else sqlite.prepare(`INSERT INTO follows (user_id, target_type, target_id) VALUES (?,?,?)`).run(userId, targetType, targetId);
    const followers = (sqlite.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type=? AND target_id=?`).get(targetType, targetId) as any).n;
    return { following: !existing, followers };
  }

  // ---------- discussions ----------
  latestDiscussions(limit = 6): DiscussionItem[] {
    return sqlite.prepare(`
      SELECT c.*, u.username, u.display_name, u.bio, u.avatar_hue, u.is_creator,
        s.slug AS s_slug, s.title AS s_title, s.cover AS s_cover, s.type AS s_type,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes,
        (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id AND r.hidden = 0) AS replies
      FROM comments c JOIN users u ON u.id = c.user_id JOIN series s ON s.id = c.series_id
      WHERE c.parent_id IS NULL AND c.hidden = 0
      ORDER BY (likes * 2 + replies * 3) DESC, c.created_at DESC LIMIT ?`).all(limit)
      .map((r: any) => ({
        id: r.id, body: r.body, spoiler: !!r.spoiler, likes: r.likes, replies: r.replies, createdAt: r.created_at,
        user: { id: r.user_id, username: r.username, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator },
        series: { id: r.series_id, slug: r.s_slug, title: r.s_title, cover: r.s_cover, type: r.s_type },
      }));
  }

  // ---------- history ----------
  recentlyViewed(userId: number, limit = 8): SeriesCard[] {
    const ids = sqlite.prepare(`SELECT series_id, MAX(viewed_at) AS t FROM history WHERE user_id = ? GROUP BY series_id ORDER BY t DESC LIMIT ?`)
      .all(userId, limit).map((r: any) => r.series_id);
    if (!ids.length) return [];
    const params = { since: Date.now() - WEEK, me: userId };
    const rows = sqlite.prepare(`${SERIES_SELECT} WHERE s.id IN (${ids.join(",")})`).all(params).map(toCard);
    const last = sqlite.prepare(`SELECT c.id, c.number, c.title FROM history h JOIN chapters c ON c.id = h.chapter_id WHERE h.user_id = ? AND h.series_id = ? ORDER BY h.viewed_at DESC LIMIT 1`);
    return ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean).map((c) => ({ ...c, lastChapter: (last.get(userId, c.id) as any) ?? null }));
  }
  addHistory(userId: number, seriesId: number, chapterId?: number) {
    sqlite.prepare(`INSERT INTO history (user_id, series_id, chapter_id, viewed_at) VALUES (?,?,?,?)`).run(userId, seriesId, chapterId ?? null, Date.now());
    sqlite.prepare(`UPDATE series SET views = views + 1 WHERE id = ?`).run(seriesId);
  }

  stats() {
    const n = (sql: string) => (sqlite.prepare(sql).get() as any).n;
    return {
      series: n(`SELECT COUNT(*) AS n FROM series`),
      chapters: n(`SELECT COUNT(*) AS n FROM chapters`),
      creators: n(`SELECT COUNT(*) AS n FROM users WHERE is_creator = 1`),
      readers: n(`SELECT COUNT(*) AS n FROM users`),
    };
  }

  home(me?: number): HomeData {
    const trending = this.listSeries({ me, order: "trending", limit: 12 });
    return {
      featured: this.listSeries({ me, order: "trending", limit: 5 }),
      trending,
      topLiked: this.listSeries({ me, order: "likes", limit: 10 }),
      latest: this.listSeries({ me, order: "latest", limit: 12 }),
      creators: this.topCreators(me),
      discussions: this.latestDiscussions(),
      stats: this.stats(),
      recent: me ? this.recentlyViewed(me) : [],
    };
  }

  // ---------- saved list ----------
  savedListId(userId: number) {
    const r: any = sqlite.prepare(`SELECT id FROM reading_lists WHERE user_id = ? AND name = 'Saved'`).get(userId);
    if (r) return r.id as number;
    return Number(sqlite.prepare(`INSERT INTO reading_lists (user_id, name) VALUES (?, 'Saved')`).run(userId).lastInsertRowid);
  }
  toggleSaved(userId: number, seriesId: number) {
    const lid = this.savedListId(userId);
    const ex = sqlite.prepare(`SELECT id FROM reading_list_items WHERE list_id = ? AND series_id = ?`).get(lid, seriesId);
    if (ex) sqlite.prepare(`DELETE FROM reading_list_items WHERE list_id = ? AND series_id = ?`).run(lid, seriesId);
    else sqlite.prepare(`INSERT INTO reading_list_items (list_id, series_id) VALUES (?,?)`).run(lid, seriesId);
    return { saved: !ex };
  }
  cardsByIds(ids: number[], me: number) {
    if (!ids.length) return [];
    const rows = sqlite.prepare(`${SERIES_SELECT} WHERE s.id IN (${ids.map(Number).join(",")})`).all({ since: Date.now() - WEEK, me }).map(toCard);
    return ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
  }
  library(userId: number) {
    const lid = this.savedListId(userId);
    const saved = sqlite.prepare(`SELECT series_id FROM reading_list_items WHERE list_id = ? ORDER BY id DESC`).all(lid).map((r: any) => r.series_id);
    const followedCreators = sqlite.prepare(`SELECT u.* FROM follows f JOIN users u ON u.id = f.target_id WHERE f.user_id = ? AND f.target_type = 'creator'`).all(userId).map(pub);
    const following = sqlite.prepare(`SELECT target_id FROM follows WHERE user_id = ? AND target_type = 'series'`).all(userId).map((r: any) => r.target_id);
    const counts: any = sqlite.prepare(`SELECT (SELECT COUNT(*) FROM series_likes WHERE user_id = @u) AS likes, (SELECT COUNT(*) FROM comments WHERE user_id = @u) AS comments, (SELECT COUNT(DISTINCT series_id) FROM history WHERE user_id = @u) AS read`).get({ u: userId });
    return { continueReading: this.recentlyViewed(userId, 10), saved: this.cardsByIds(saved, userId), following: this.cardsByIds(following, userId), followedCreators, counts };
  }
  genres() {
    const set = new Set<string>();
    for (const r of sqlite.prepare(`SELECT genres FROM series`).all() as any[]) JSON.parse(r.genres).forEach((g: string) => set.add(g));
    return Array.from(set).sort();
  }

  // ---------- series page + reader ----------
  seriesDetail(slug: string, me?: number) {
    const r = sqlite.prepare(`${SERIES_SELECT} WHERE s.slug = @slug`).get({ since: Date.now() - WEEK, me: me ?? -1, slug });
    if (!r) return undefined;
    const card = toCard(r);
    const read = new Set(me ? sqlite.prepare(`SELECT DISTINCT chapter_id FROM history WHERE user_id = ? AND series_id = ? AND chapter_id IS NOT NULL`).all(me, card.id).map((x: any) => x.chapter_id) : []);
    const chapters = sqlite.prepare(`SELECT id, number, title, pages, created_at FROM chapters WHERE series_id = ? ORDER BY number ASC`).all(card.id).map((c: any) => {
      const pages: string[] = JSON.parse(c.pages);
      return { id: c.id, number: c.number, title: c.title, pageCount: pages.length, createdAt: c.created_at, read: read.has(c.id), thumb: pages.length ? pages[0].replace(/p\d+\.webp$/, "cover.webp") : null };
    });
    const resume: any = me ? sqlite.prepare(`SELECT c.id, c.number FROM history h JOIN chapters c ON c.id = h.chapter_id WHERE h.user_id = ? AND h.series_id = ? ORDER BY h.viewed_at DESC LIMIT 1`).get(me, card.id) : null;
    const bookmarks = me ? sqlite.prepare(`SELECT b.chapter_id AS chapterId, b.page, c.number, c.title FROM bookmarks b JOIN chapters c ON c.id = b.chapter_id WHERE b.user_id = ? AND b.series_id = ? ORDER BY c.number`).all(me, card.id) as any[] : [];
    return { series: card, chapters, resume: resume ?? null, bookmarks };
  }
  chapter(id: number, me?: number) {
    const c: any = sqlite.prepare(`SELECT * FROM chapters WHERE id = ?`).get(id);
    if (!c) return undefined;
    const s: any = sqlite.prepare(`SELECT s.*, u.username, u.display_name, u.bio, u.avatar_hue, u.is_creator, (SELECT COUNT(*) FROM chapters x WHERE x.series_id = s.id) AS cc FROM series s JOIN users u ON u.id = s.creator_id WHERE s.id = ?`).get(c.series_id);
    const prev = sqlite.prepare(`SELECT id, number FROM chapters WHERE series_id = ? AND number < ? ORDER BY number DESC LIMIT 1`).get(c.series_id, c.number) as any;
    const next = sqlite.prepare(`SELECT id, number FROM chapters WHERE series_id = ? AND number > ? ORDER BY number ASC LIMIT 1`).get(c.series_id, c.number) as any;
    const bm: any = me ? sqlite.prepare(`SELECT page FROM bookmarks WHERE user_id = ? AND chapter_id = ?`).get(me, id) : null;
    return {
      chapter: { id: c.id, number: c.number, title: c.title, pages: JSON.parse(c.pages) },
      series: { id: s.id, slug: s.slug, title: s.title, type: s.type, rights: s.rights, cover: s.cover, chapterCount: s.cc,
        creator: { id: s.creator_id, username: s.username, displayName: s.display_name, bio: s.bio, avatarHue: s.avatar_hue, isCreator: s.is_creator } },
      prev: prev ?? null, next: next ?? null, bookmark: bm ? bm.page : null,
    };
  }
  readChapter(userId: number, chapterId: number) {
    const c: any = sqlite.prepare(`SELECT series_id FROM chapters WHERE id = ?`).get(chapterId);
    if (c) this.addHistory(userId, c.series_id, chapterId);
  }
  toggleBookmark(userId: number, chapterId: number, page: number) {
    const c: any = sqlite.prepare(`SELECT series_id FROM chapters WHERE id = ?`).get(chapterId);
    if (!c) return undefined;
    const ex: any = sqlite.prepare(`SELECT id, page FROM bookmarks WHERE user_id = ? AND chapter_id = ?`).get(userId, chapterId);
    if (ex && ex.page === page) { sqlite.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(ex.id); return { bookmark: null }; }
    if (ex) sqlite.prepare(`UPDATE bookmarks SET page = ?, created_at = ? WHERE id = ?`).run(page, Date.now(), ex.id);
    else sqlite.prepare(`INSERT INTO bookmarks (user_id, series_id, chapter_id, page, created_at) VALUES (?,?,?,?,?)`).run(userId, c.series_id, chapterId, page, Date.now());
    return { bookmark: page };
  }

  // ---------- comments ----------
  comments(seriesId: number, me?: number, chapterId?: number) {
    const rows = sqlite.prepare(`
      SELECT c.*, u.username, u.display_name, u.bio, u.avatar_hue, u.is_creator,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes,
        EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = @me) AS liked
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.series_id = @sid AND c.hidden = 0 AND ${chapterId ? "c.chapter_id = @cid" : "1=1"}
      ORDER BY c.created_at ASC`).all({ me: me ?? -1, sid: seriesId, cid: chapterId ?? null }) as any[];
    const map = new Map<number, any>();
    for (const r of rows) map.set(r.id, { id: r.id, body: r.body, spoiler: !!r.spoiler, likes: r.likes, likedByMe: !!r.liked, createdAt: r.created_at, parentId: r.parent_id,
      user: { id: r.user_id, username: r.username, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator }, replies: [] });
    const roots: any[] = [];
    for (const c of Array.from(map.values())) (c.parentId && map.get(c.parentId) ? map.get(c.parentId).replies : roots).push(c);
    return roots.sort((a, b) => (b.likes * 2 + b.replies.length) - (a.likes * 2 + a.replies.length) || b.createdAt - a.createdAt);
  }
  addComment(userId: number, seriesId: number, body: string, spoiler: boolean, parentId?: number | null, chapterId?: number | null) {
    const id = sqlite.prepare(`INSERT INTO comments (series_id, chapter_id, parent_id, user_id, body, spoiler, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(seriesId, chapterId ?? null, parentId ?? null, userId, body, spoiler ? 1 : 0, Date.now()).lastInsertRowid;
    return { id: Number(id) };
  }
  toggleCommentLike(userId: number, commentId: number) {
    const ex = sqlite.prepare(`SELECT id FROM comment_likes WHERE user_id = ? AND comment_id = ?`).get(userId, commentId);
    if (ex) sqlite.prepare(`DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?`).run(userId, commentId);
    else sqlite.prepare(`INSERT INTO comment_likes (user_id, comment_id) VALUES (?,?)`).run(userId, commentId);
    return { liked: !ex, likes: (sqlite.prepare(`SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = ?`).get(commentId) as any).n };
  }
  reportComment(userId: number, commentId: number, reason: string) {
    if (!sqlite.prepare(`SELECT 1 FROM comments WHERE id = ?`).get(commentId)) return false;
    if (!sqlite.prepare(`SELECT 1 FROM reports WHERE user_id = ? AND comment_id = ?`).get(userId, commentId))
      sqlite.prepare(`INSERT INTO reports (comment_id, user_id, reason, created_at) VALUES (?,?,?,?)`).run(commentId, userId, reason, Date.now());
    const n = (sqlite.prepare(`SELECT COUNT(*) AS n FROM reports WHERE comment_id = ?`).get(commentId) as any).n;
    if (n >= 3) sqlite.prepare(`UPDATE comments SET hidden = 1 WHERE id = ?`).run(commentId);
    return true;
  }
  seriesIdOfComment(id: number) { return (sqlite.prepare(`SELECT series_id FROM comments WHERE id = ?`).get(id) as any)?.series_id as number | undefined; }

  // ---------- worldwide (AniList) titles ----------
  upsertWorld(t: { id: number; title: string; cover: string; type: string; color: string | null }) {
    sqlite.prepare(`INSERT INTO world_titles (anilist_id, title, cover, type, color, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(anilist_id) DO UPDATE SET title=excluded.title, cover=excluded.cover, type=excluded.type, color=excluded.color, updated_at=excluded.updated_at`).run(t.id, t.title, t.cover, t.type, t.color, Date.now());
  }
  worldState(id: number, me?: number) {
    const likes = (sqlite.prepare(`SELECT COUNT(*) AS n FROM world_likes WHERE anilist_id = ?`).get(id) as any).n;
    const u = me ?? -1;
    const liked = !!sqlite.prepare(`SELECT 1 FROM world_likes WHERE user_id = ? AND anilist_id = ?`).get(u, id);
    const saved = !!sqlite.prepare(`SELECT 1 FROM world_saves WHERE user_id = ? AND anilist_id = ?`).get(u, id);
    const last: any = sqlite.prepare(`SELECT chapter FROM world_history WHERE user_id = ? AND anilist_id = ? ORDER BY at DESC LIMIT 1`).get(u, id);
    const read = sqlite.prepare(`SELECT DISTINCT chapter FROM world_history WHERE user_id = ? AND anilist_id = ?`).all(u, id).map((r: any) => r.chapter);
    return { likes, likedByMe: liked, savedByMe: saved, lastChapter: last?.chapter ?? null, readChapters: read };
  }
  toggleWorld(table: "world_likes" | "world_saves", userId: number, id: number) {
    const ex = sqlite.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND anilist_id = ?`).get(userId, id);
    if (ex) sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ? AND anilist_id = ?`).run(userId, id);
    else sqlite.prepare(`INSERT INTO ${table} (user_id, anilist_id, created_at) VALUES (?,?,?)`).run(userId, id, Date.now());
    return { on: !ex, likes: (sqlite.prepare(`SELECT COUNT(*) AS n FROM world_likes WHERE anilist_id = ?`).get(id) as any).n };
  }
  worldRead(userId: number, id: number, chapter: string) {
    sqlite.prepare(`INSERT INTO world_history (user_id, anilist_id, chapter, at) VALUES (?,?,?,?)`).run(userId, id, chapter, Date.now());
  }
  worldLibrary(userId: number) {
    const saved = sqlite.prepare(`SELECT w.* FROM world_saves s JOIN world_titles w ON w.anilist_id = s.anilist_id WHERE s.user_id = ? ORDER BY s.created_at DESC`).all(userId);
    const reading = sqlite.prepare(`SELECT w.*, h.chapter, h.at FROM (SELECT anilist_id, chapter, MAX(at) AS at FROM world_history WHERE user_id = ? GROUP BY anilist_id) h JOIN world_titles w ON w.anilist_id = h.anilist_id ORDER BY h.at DESC LIMIT 12`).all(userId);
    const map = (r: any) => ({ id: r.anilist_id, title: r.title, cover: r.cover, type: r.type, color: r.color, chapter: r.chapter ?? null });
    return { saved: saved.map(map), reading: reading.map(map) };
  }
  mostLikedWorld(limit = 10) {
    return sqlite.prepare(`SELECT w.*, COUNT(l.user_id) AS likes FROM world_likes l JOIN world_titles w ON w.anilist_id = l.anilist_id GROUP BY l.anilist_id ORDER BY likes DESC LIMIT ?`).all(limit)
      .map((r: any) => ({ id: r.anilist_id, title: r.title, cover: r.cover, type: r.type, color: r.color, likes: r.likes }));
  }

  isEmpty() { return (sqlite.prepare(`SELECT COUNT(*) AS n FROM series`).get() as any).n === 0; }
  raw() { return sqlite; }
}

export const storage = new Storage();

// ---------- Creator Studio ----------
const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60) || "series";
export const studio = {
  becomeCreator(userId: number) { sqlite.prepare(`UPDATE users SET is_creator = 1 WHERE id = ?`).run(userId); },
  mySeries(userId: number) {
    return sqlite.prepare(`SELECT s.id, s.slug, s.title, s.type, s.cover, s.status, s.views, s.created_at,
      (SELECT COUNT(*) FROM chapters c WHERE c.series_id = s.id) AS chapters,
      (SELECT COUNT(*) FROM series_likes l WHERE l.series_id = s.id) AS likes,
      (SELECT COUNT(*) FROM comments m WHERE m.series_id = s.id) AS comments
      FROM series s WHERE s.creator_id = ? ORDER BY s.created_at DESC`).all(userId);
  },
  owned(userId: number, seriesId: number) {
    return sqlite.prepare(`SELECT * FROM series WHERE id = ? AND creator_id = ?`).get(seriesId, userId) as any;
  },
  getSeries(userId: number, seriesId: number) {
    const s = this.owned(userId, seriesId);
    if (!s) return undefined;
    const chapters = sqlite.prepare(`SELECT id, number, title, pages, created_at FROM chapters WHERE series_id = ? ORDER BY number`).all(seriesId)
      .map((c: any) => ({ id: c.id, number: c.number, title: c.title, pages: JSON.parse(c.pages), createdAt: c.created_at }));
    return { id: s.id, slug: s.slug, title: s.title, type: s.type, genres: JSON.parse(s.genres), synopsis: s.synopsis, cover: s.cover, status: s.status, views: s.views, chapters };
  },
  createSeries(userId: number, d: { title: string; type: string; genres: string[]; synopsis: string; cover: string; status: string }) {
    let slug = slugify(d.title), n = 1;
    while (sqlite.prepare(`SELECT 1 FROM series WHERE slug = ?`).get(slug)) slug = `${slugify(d.title)}-${++n}`;
    const r = sqlite.prepare(`INSERT INTO series (slug, title, type, genres, synopsis, cover, creator_id, status, views, rights, created_at, rating, year) VALUES (?,?,?,?,?,?,?,?,0,'original',?,0,?)`)
      .run(slug, d.title, d.type, JSON.stringify(d.genres), d.synopsis, d.cover, userId, d.status, Date.now(), new Date().getFullYear());
    this.becomeCreator(userId);
    return { id: Number(r.lastInsertRowid), slug };
  },
  updateSeries(seriesId: number, d: Partial<{ title: string; type: string; genres: string[]; synopsis: string; cover: string; status: string }>) {
    const sets: string[] = [], vals: any[] = [];
    for (const [k, v] of Object.entries(d)) { if (v === undefined) continue; sets.push(`${k} = ?`); vals.push(k === "genres" ? JSON.stringify(v) : v); }
    if (sets.length) sqlite.prepare(`UPDATE series SET ${sets.join(", ")} WHERE id = ?`).run(...vals, seriesId);
  },
  deleteSeries(seriesId: number) {
    const chapterIds = sqlite.prepare(`SELECT id FROM chapters WHERE series_id = ?`).all(seriesId).map((c: any) => c.id);
    const tx = sqlite.transaction(() => {
      for (const t of ["chapters", "series_likes", "comments", "bookmarks", "history", "reading_list_items"]) sqlite.prepare(`DELETE FROM ${t} WHERE series_id = ?`).run(seriesId);
      sqlite.prepare(`DELETE FROM follows WHERE target_type = 'series' AND target_id = ?`).run(seriesId);
      sqlite.prepare(`DELETE FROM series WHERE id = ?`).run(seriesId);
    });
    tx();
    return chapterIds;
  },
  addChapter(seriesId: number, d: { title: string; pages: string[]; number?: number }) {
    const max = (sqlite.prepare(`SELECT COALESCE(MAX(number), 0) AS m FROM chapters WHERE series_id = ?`).get(seriesId) as any).m;
    const number = d.number && !sqlite.prepare(`SELECT 1 FROM chapters WHERE series_id = ? AND number = ?`).get(seriesId, d.number) ? d.number : max + 1;
    const r = sqlite.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at) VALUES (?,?,?,?,?)`).run(seriesId, number, d.title, JSON.stringify(d.pages), Date.now());
    return { id: Number(r.lastInsertRowid), number };
  },
  chapterOwned(userId: number, chapterId: number) {
    return sqlite.prepare(`SELECT c.* FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.id = ? AND s.creator_id = ?`).get(chapterId, userId) as any;
  },
  updateChapter(chapterId: number, d: { title?: string; pages?: string[] }) {
    if (d.title !== undefined) sqlite.prepare(`UPDATE chapters SET title = ? WHERE id = ?`).run(d.title, chapterId);
    if (d.pages !== undefined) sqlite.prepare(`UPDATE chapters SET pages = ? WHERE id = ?`).run(JSON.stringify(d.pages), chapterId);
  },
  deleteChapter(chapterId: number) {
    for (const t of ["bookmarks"]) sqlite.prepare(`DELETE FROM ${t} WHERE chapter_id = ?`).run(chapterId);
    sqlite.prepare(`UPDATE history SET chapter_id = NULL WHERE chapter_id = ?`).run(chapterId);
    sqlite.prepare(`DELETE FROM chapters WHERE id = ?`).run(chapterId);
  },
};

// ---------- official English verification cache (AniList links, then MangaDex "engtl" as a second check) ----------
sqlite.exec(`CREATE TABLE IF NOT EXISTS official_en (anilist_id INTEGER PRIMARY KEY, sites TEXT, checked_at INTEGER NOT NULL)`);
export const officialCache = {
  get(id: number): string[] | null | undefined {
    const r: any = sqlite.prepare(`SELECT sites, checked_at FROM official_en WHERE anilist_id = ?`).get(id);
    if (!r) return undefined;
    if (r.sites === null && Date.now() - r.checked_at > 7 * 864e5) return undefined; // re-check negatives weekly
    return r.sites === null ? null : JSON.parse(r.sites);
  },
  set(id: number, sites: string[] | null) {
    sqlite.prepare(`INSERT INTO official_en (anilist_id, sites, checked_at) VALUES (?,?,?) ON CONFLICT(anilist_id) DO UPDATE SET sites = excluded.sites, checked_at = excluded.checked_at`).run(id, sites ? JSON.stringify(sites) : null, Date.now());
  },
};

// ---------- reading stats ----------
export function readingStats(userId: number) {
  const rows = sqlite.prepare(`SELECT anilist_id, chapter, at FROM world_history WHERE user_id = ? ORDER BY at`).all(userId) as any[];
  const local = sqlite.prepare(`SELECT series_id, chapter_id, viewed_at AS at FROM history WHERE user_id = ?`).all(userId) as any[];
  const chapters = new Set(rows.map((r) => `${r.anilist_id}:${r.chapter}`)).size + new Set(local.map((r) => r.chapter_id)).size;
  const titles = new Set(rows.map((r) => r.anilist_id)).size + new Set(local.map((r) => r.series_id)).size;
  const day = (t: number) => Math.floor((t + 5.5 * 3600e3) / 864e5); // IST calendar days
  const days = new Set([...rows, ...local].map((r) => day(Number(r.at))));
  let streak = 0; const today = day(Date.now());
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  const week = Array.from({ length: 7 }, (_, i) => { const d = today - 6 + i; return { day: d, count: [...rows, ...local].filter((r) => day(Number(r.at)) === d).length }; });
  return { chapters, titles, streak, activeDays: days.size, week };
}

// ---------- copyright / DMCA takedown requests ----------
sqlite.exec(`CREATE TABLE IF NOT EXISTS takedowns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, owner_of TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)`);
export const takedowns = {
  create(t: { name: string; email: string; ownerOf: string; target: string; details: string }) {
    const r = sqlite.prepare(`INSERT INTO takedowns (name, email, owner_of, target, details, created_at) VALUES (?,?,?,?,?,?)`).run(t.name, t.email, t.ownerOf, t.target, t.details, Date.now());
    return Number(r.lastInsertRowid);
  },
};
