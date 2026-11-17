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
  EXISTS(SELECT 1 FROM follows f WHERE f.target_type='series' AND f.target_id = s.id AND f.user_id = @me) AS followed_by_me
FROM series s JOIN users u ON u.id = s.creator_id`;

function toCard(r: any): SeriesCard {
  return {
    id: r.id, slug: r.slug, title: r.title, type: r.type, genres: JSON.parse(r.genres), synopsis: r.synopsis, cover: r.cover,
    status: r.status, views: r.views, rights: r.rights, likes: r.likes, recentLikes: r.recent_likes, chapterCount: r.chapter_count,
    latestChapter: r.latest_chapter, latestChapterAt: r.latest_chapter_at, likedByMe: !!r.liked_by_me, savedByMe: !!r.saved_by_me, followedByMe: !!r.followed_by_me, rating: r.rating / 10, year: r.year,
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
    const sql = `${SERIES_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT @limit`;
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
    return ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
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
      featured: this.listSeries({ me, order: "likes", limit: 5 }),
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

  isEmpty() { return (sqlite.prepare(`SELECT COUNT(*) AS n FROM series`).get() as any).n === 0; }
  raw() { return sqlite; }
}

export const storage = new Storage();
