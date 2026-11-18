// Admin & moderation: approvals, users, creators, copyright, reports, spam, uploads,
// server health, database backups, moderation logs, analytics and broadcast notifications.
import type { Express, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storage, pub, studio, CH_VISIBLE } from "./storage";
import { notify, staffIds } from "./social";
import type { PublicUser } from "@shared/schema";
import type { AdminOverview, HealthReport, BackupFile, ModLog } from "@shared/platform";

const db = storage.raw();
const DAY = 864e5;
const UP = path.resolve("uploads");
const BACKUPS = path.resolve(process.env.BACKUP_DIR || "backups");
const DB_FILE = path.resolve("data.db");
const started = Date.now();

db.exec(`
CREATE TABLE IF NOT EXISTS mod_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS content_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, reporter_id INTEGER NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', resolution TEXT, resolved_by INTEGER, created_at INTEGER NOT NULL, resolved_at INTEGER);
CREATE TABLE IF NOT EXISTS spam_flags (id INTEGER PRIMARY KEY AUTOINCREMENT, comment_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL, score INTEGER NOT NULL, reasons TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status, created_at);
`);
for (const [col, def] of [["status_note", "TEXT"], ["handled_by", "INTEGER"], ["updated_at", "INTEGER"]] as const) {
  const cols = (db.prepare(`PRAGMA table_info(takedowns)`).all() as any[]).map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE takedowns ADD COLUMN ${col} ${def}`);
}
(() => { const cols = (db.prepare(`PRAGMA table_info(comments)`).all() as any[]).map((c) => c.name); if (!cols.includes("spam")) db.exec(`ALTER TABLE comments ADD COLUMN spam INTEGER NOT NULL DEFAULT 0`); })();

export const settings = {
  get<T>(key: string, fallback: T): T { const r: any = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key); try { return r ? JSON.parse(r.value) : fallback; } catch { return fallback; } },
  set(key: string, value: unknown) { db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value)); },
};

// ======================= Moderation log =======================
export function modlog(actorId: number | null, action: string, targetType: string, targetId: string | number, details = "") {
  db.prepare(`INSERT INTO mod_logs (actor_id, action, target_type, target_id, details, created_at) VALUES (?,?,?,?,?,?)`).run(actorId, action, targetType, String(targetId), details.slice(0, 1000), Date.now());
}

// ======================= Request metrics (server health) =======================
const samples: { at: number; ms: number; status: number; path: string }[] = [];
const recentErrors: HealthReport["recentErrors"] = [];
let total = 0, e5 = 0, e4 = 0;
export function installMetrics(app: Express) {
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    const t = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      total++;
      if (res.statusCode >= 500) { e5++; recentErrors.unshift({ at: Date.now(), method: req.method, path: req.path, status: res.statusCode, message: res.statusMessage || "Server error" }); recentErrors.length = Math.min(recentErrors.length, 30); }
      else if (res.statusCode >= 400) e4++;
      samples.push({ at: Date.now(), ms, status: res.statusCode, path: req.route?.path ?? req.path });
      if (samples.length > 5000) samples.splice(0, samples.length - 5000);
    });
    next();
  });
  // simple per-IP rate limits for sign-in and sign-up
  const hits = new Map<string, number[]>();
  app.use(["/api/auth/login", "/api/auth/signup"], (req, res, next) => {
    if (req.method !== "POST") return next();
    const key = `${req.path}:${req.ip}`, now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60e3);
    const limit = req.originalUrl.includes("signup") ? 5 : 15;
    if (list.length >= limit) return res.status(429).json({ message: "Too many attempts. Please wait a few minutes and try again." });
    list.push(now); hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    next();
  });
}

// ======================= Spam detection =======================
const DEFAULT_BLOCKED = ["free coins", "earn money fast", "crypto giveaway", "click here", "buy followers", "casino", "porn", "onlyfans"];
export function spamCheck(userId: number, body: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (n: number, r: string) => { score += n; reasons.push(r); };
  const lower = body.toLowerCase();
  const links = (body.match(/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|xyz|ru|top|io|gg|ly)\b/gi) ?? []).length;
  if (links >= 3) add(3, `${links} links`); else if (links >= 1) add(1, "contains a link");
  const blocked = settings.get<string[]>("spam.blocked", DEFAULT_BLOCKED).filter((w) => w && lower.includes(w.toLowerCase()));
  if (blocked.length) add(3, `blocked phrase: ${blocked.slice(0, 3).join(", ")}`);
  if (/(t\.me\/|telegram|whatsapp|discord\.gg|wa\.me)/i.test(body)) add(2, "contact or invite link");
  if (/(.)\1{9,}/.test(body)) add(1, "repeated characters");
  const letters = body.replace(/[^a-z]/gi, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) add(1, "all caps");
  const dup = (db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND body = ? AND created_at > ?`).get(userId, body, Date.now() - DAY) as any).n;
  if (dup >= 1) add(3, "same message posted again");
  const burst = (db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND created_at > ?`).get(userId, Date.now() - 60e3) as any).n;
  if (burst >= 5) add(3, `${burst} comments in a minute`);
  const u: any = db.prepare(`SELECT created_at FROM users WHERE id = ?`).get(userId);
  if (u && Date.now() - u.created_at < 10 * 60e3 && links) add(2, "new account posting links");
  return { score, reasons };
}
export const SPAM_THRESHOLD = () => settings.get<number>("spam.threshold", 3);
/** Called after a comment is stored. Hides it and queues it for review when it looks like spam. */
export function flagIfSpam(commentId: number, userId: number, check: { score: number; reasons: string[] }) {
  if (check.score < SPAM_THRESHOLD()) return false;
  db.prepare(`UPDATE comments SET hidden = 1, spam = 1 WHERE id = ?`).run(commentId);
  db.prepare(`INSERT OR IGNORE INTO spam_flags (comment_id, user_id, score, reasons, created_at) VALUES (?,?,?,?,?)`).run(commentId, userId, check.score, JSON.stringify(check.reasons), Date.now());
  modlog(null, "spam.auto_hide", "comment", commentId, check.reasons.join("; "));
  return true;
}

// ======================= Content reports =======================
export const REPORT_TARGETS = ["comment", "series", "chapter", "user", "world"] as const;
export function fileReport(reporterId: number, targetType: string, targetId: number, reason: string, details = "") {
  const dup = db.prepare(`SELECT id FROM content_reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'`).get(reporterId, targetType, targetId);
  if (dup) return (dup as any).id as number;
  const id = Number(db.prepare(`INSERT INTO content_reports (target_type, target_id, reporter_id, reason, details, created_at) VALUES (?,?,?,?,?,?)`).run(targetType, targetId, reporterId, reason, details, Date.now()).lastInsertRowid);
  const open = (db.prepare(`SELECT COUNT(*) AS n FROM content_reports WHERE status = 'open'`).get() as any).n;
  if (open === 1 || open % 10 === 0) notify(staffIds(), { type: "moderation", title: "New content report", body: `${open} open report${open === 1 ? "" : "s"} waiting for review.`, link: "/admin/reports" });
  return id;
}
function targetSummary(type: string, id: number) {
  const q = (sql: string) => db.prepare(sql).get(id) as any;
  if (type === "comment") { const c = q(`SELECT c.body, c.hidden, c.series_id, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`); return c ? { label: `“${c.body.slice(0, 140)}” by @${c.username}`, hidden: !!c.hidden, link: c.series_id > 0 ? `/series/${(q(`SELECT slug FROM series WHERE id = (SELECT series_id FROM comments WHERE id = ?)`) ?? {}).slug}` : `/title/${-c.series_id}` } : null; }
  if (type === "series") { const s = q(`SELECT title, slug, removed FROM series WHERE id = ?`); return s ? { label: s.title, hidden: !!s.removed, link: `/series/${s.slug}` } : null; }
  if (type === "chapter") { const c = q(`SELECT c.number, c.approval, s.title FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.id = ?`); return c ? { label: `${c.title} · Chapter ${c.number}`, hidden: c.approval !== "approved", link: `/read/${id}` } : null; }
  if (type === "user") { const u = q(`SELECT username, display_name, banned FROM users WHERE id = ?`); return u ? { label: `${u.display_name} (@${u.username})`, hidden: !!u.banned, link: `/u/${u.username}` } : null; }
  if (type === "world") { const w = q(`SELECT title FROM world_titles WHERE anilist_id = ?`); return { label: w?.title ?? `AniList #${id}`, hidden: false, link: `/title/${id}` }; }
  return null;
}

// ======================= Uploads =======================
function walk(dir: string): { rel: string; bytes: number; mtime: number }[] {
  if (!fs.existsSync(dir)) return [];
  const out: { rel: string; bytes: number; mtime: number }[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else { const st = fs.statSync(p); out.push({ rel: path.relative(process.cwd(), p).split(path.sep).join("/"), bytes: st.size, mtime: st.mtimeMs }); }
  }
  return out;
}
function referencedUploads() {
  const set = new Set<string>();
  for (const r of db.prepare(`SELECT cover FROM series`).all() as any[]) set.add(r.cover);
  for (const r of db.prepare(`SELECT pages FROM chapters WHERE pages LIKE '%uploads/%'`).all() as any[]) for (const p of JSON.parse(r.pages)) set.add(p);
  return set;
}
function uploadsReport() {
  const files = walk(UP), refs = referencedUploads();
  const users = new Map<number, { userId: number; files: number; bytes: number; orphans: number }>();
  const list = files.map((f) => {
    const uid = Number(f.rel.match(/^uploads\/u(\d+)\//)?.[1] ?? 0);
    const orphan = !refs.has(f.rel);
    const u = users.get(uid) ?? { userId: uid, files: 0, bytes: 0, orphans: 0 };
    u.files++; u.bytes += f.bytes; if (orphan) u.orphans++; users.set(uid, u);
    return { path: f.rel, bytes: f.bytes, modifiedAt: f.mtime, userId: uid, orphan };
  });
  const names = new Map((db.prepare(`SELECT id, username, display_name FROM users`).all() as any[]).map((r) => [r.id, r]));
  return {
    totalBytes: files.reduce((a, f) => a + f.bytes, 0), totalFiles: files.length,
    orphanBytes: list.filter((f) => f.orphan).reduce((a, f) => a + f.bytes, 0), orphanFiles: list.filter((f) => f.orphan).length,
    byUser: Array.from(users.values()).map((u) => ({ ...u, username: names.get(u.userId)?.username ?? "unknown", displayName: names.get(u.userId)?.display_name ?? "Unknown" })).sort((a, b) => b.bytes - a.bytes),
    recent: list.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 200),
  };
}

// ======================= Backups =======================
const backupName = (auto: boolean) => `mangasalt-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}${auto ? "-auto" : ""}.db`;
export function listBackups(): BackupFile[] {
  if (!fs.existsSync(BACKUPS)) return [];
  return fs.readdirSync(BACKUPS).filter((f) => /^mangasalt-[\w-]+\.db$/.test(f)).map((f) => {
    const st = fs.statSync(path.join(BACKUPS, f));
    return { name: f, bytes: st.size, createdAt: st.mtimeMs, auto: f.endsWith("-auto.db") };
  }).sort((a, b) => b.createdAt - a.createdAt);
}
export async function createBackup(auto = false) {
  fs.mkdirSync(BACKUPS, { recursive: true });
  const name = backupName(auto);
  await (db as any).backup(path.join(BACKUPS, name));
  // keep the newest 14 automatic backups; manual ones stay until deleted
  const keep = settings.get<number>("backup.keep", 14);
  listBackups().filter((b) => b.auto).slice(keep).forEach((b) => fs.unlinkSync(path.join(BACKUPS, b.name)));
  settings.set("backup.last", Date.now());
  return name;
}
function scheduleBackups() {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
  if (!(hours > 0)) return;
  const tick = () => {
    const last = settings.get<number>("backup.last", 0);
    if (Date.now() - last >= hours * 3600e3) createBackup(true).then((n) => modlog(null, "backup.auto", "backup", n)).catch((e) => console.error("backup failed", e));
  };
  setTimeout(tick, 30e3).unref();
  setInterval(tick, 30 * 60e3).unref();
}

// ======================= Health =======================
const size = (p: string) => { try { return fs.statSync(p).size; } catch { return 0; } };
let serviceCache: { t: number; v: HealthReport["services"] } | null = null;
async function services(): Promise<HealthReport["services"]> {
  if (serviceCache && Date.now() - serviceCache.t < 60e3) return serviceCache.v;
  const ping = async (name: string, url: string, init?: RequestInit) => {
    const t = Date.now();
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
      return { name, ok: r.ok, ms: Date.now() - t, detail: `HTTP ${r.status}` };
    } catch (e: any) { return { name, ok: false, ms: null, detail: e?.name === "TimeoutError" ? "Timed out" : e?.message ?? "Unreachable" }; }
  };
  const v = await Promise.all([
    ping("AniList catalogue", "https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ SiteStatistics { users(perPage:1){ pageInfo { total } } } }" }) }),
    ping("MangaDex chapter index", "https://api.mangadex.org/ping"),
  ]);
  const t = Date.now();
  try { db.prepare("SELECT 1").get(); v.unshift({ name: "SQLite database", ok: true, ms: Date.now() - t, detail: "Responding" }); }
  catch (e: any) { v.unshift({ name: "SQLite database", ok: false, ms: null, detail: e.message }); }
  serviceCache = { t: Date.now(), v };
  return v;
}
async function health(): Promise<HealthReport> {
  const now = Date.now();
  const recent = samples.filter((s) => now - s.at < 15 * 60e3);
  const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
  const byPath = new Map<string, number>();
  for (const s of recent) byPath.set(s.path, Math.max(byPath.get(s.path) ?? 0, s.ms));
  let disk: { free: number | null; total: number | null } = { free: null, total: null };
  try { const st: any = (fs as any).statfsSync?.(process.cwd()); if (st) disk = { free: st.bavail * st.bsize, total: st.blocks * st.bsize }; } catch {}
  const up = walk(UP);
  const svc = await services();
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as any[])
    .map((t) => ({ name: t.name, rows: (db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as any).n }));
  const integrity = (db.prepare(`PRAGMA quick_check`).get() as any)?.quick_check ?? "unknown";
  const mem = process.memoryUsage();
  const errRate = recent.length ? recent.filter((s) => s.status >= 500).length / recent.length : 0;
  const lowDisk = disk.free !== null && disk.total !== null && disk.free / disk.total < 0.05;
  const status = !svc[0]?.ok || integrity !== "ok" ? "down" : errRate > 0.05 || lowDisk || svc.some((s) => !s.ok) ? "degraded" : "ok";
  const lastBackup = settings.get<number | null>("backup.last", null);
  return {
    status, uptime: now - started, node: process.version, pid: process.pid, platform: `${os.type()} ${os.release()} (${os.arch()})`,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, systemFree: os.freemem(), systemTotal: os.totalmem() },
    load: os.loadavg(), cpus: os.cpus().length,
    disk: { dbBytes: size(DB_FILE), walBytes: size(DB_FILE + "-wal"), uploadsBytes: up.reduce((a, f) => a + f.bytes, 0), uploadsFiles: up.length, backupsBytes: listBackups().reduce((a, b) => a + b.bytes, 0), freeBytes: disk.free, totalBytes: disk.total },
    requests: {
      total, errors5xx: e5, errors4xx: e4, perMinute: Math.round(recent.filter((s) => now - s.at < 60e3).length),
      avgMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      p95Ms: sorted.length ? Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]) : 0,
      slowest: Array.from(byPath, ([p, ms]) => ({ path: p, ms: Math.round(ms) })).sort((a, b) => b.ms - a.ms).slice(0, 6),
    },
    recentErrors: recentErrors.slice(0, 15), services: svc, db: { integrity, tables }, lastBackup,
  };
}

// ======================= Analytics =======================
const IST = 5.5 * 3600e3;
const dayKey = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
function overview(): AdminOverview {
  const n = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as any).n as number;
  const now = Date.now(), d30 = now - 30 * DAY;
  const todayStart = Date.parse(dayKey(now) + "T00:00:00Z") - IST;
  const active = (since: number) => n(`SELECT COUNT(*) AS n FROM (SELECT user_id FROM history WHERE viewed_at > @s UNION SELECT user_id FROM world_history WHERE at > @s UNION SELECT user_id FROM comments WHERE created_at > @s)`, { s: since } as any);
  const daily: AdminOverview["daily"] = Array.from({ length: 30 }, (_, i) => ({ day: dayKey(now - (29 - i) * DAY), signups: 0, reads: 0, comments: 0, active: 0 }));
  const idx = new Map(daily.map((d, i) => [d.day, i]));
  const bump = (t: number, k: "signups" | "reads" | "comments") => { const i = idx.get(dayKey(t)); if (i !== undefined) daily[i][k]++; };
  const actives = new Map<string, Set<number>>();
  for (const r of db.prepare(`SELECT created_at FROM users WHERE created_at > ?`).all(d30) as any[]) bump(r.created_at, "signups");
  for (const r of db.prepare(`SELECT user_id, viewed_at AS at FROM history WHERE chapter_id IS NOT NULL AND viewed_at > ? UNION ALL SELECT user_id, at FROM world_history WHERE at > ?`).all(d30, d30) as any[]) {
    bump(r.at, "reads"); const k = dayKey(r.at); (actives.get(k) ?? actives.set(k, new Set()).get(k)!).add(r.user_id);
  }
  for (const r of db.prepare(`SELECT created_at FROM comments WHERE created_at > ?`).all(d30) as any[]) bump(r.created_at, "comments");
  daily.forEach((d) => (d.active = actives.get(d.day)?.size ?? 0));
  return {
    totals: {
      users: n(`SELECT COUNT(*) AS n FROM users`), creators: n(`SELECT COUNT(*) AS n FROM users WHERE is_creator = 1`),
      series: n(`SELECT COUNT(*) AS n FROM series WHERE removed = 0`), chapters: n(`SELECT COUNT(*) AS n FROM chapters c WHERE ${CH_VISIBLE}`),
      comments: n(`SELECT COUNT(*) AS n FROM comments WHERE hidden = 0`),
      readsToday: n(`SELECT (SELECT COUNT(*) FROM history WHERE chapter_id IS NOT NULL AND viewed_at > @t) + (SELECT COUNT(*) FROM world_history WHERE at > @t) AS n`, { t: todayStart } as any),
      activeToday: active(todayStart), active7: active(now - 7 * DAY), active30: active(d30), newUsers7: n(`SELECT COUNT(*) AS n FROM users WHERE created_at > ?`, now - 7 * DAY),
    },
    queues: {
      pendingSeries: n(`SELECT COUNT(*) AS n FROM series WHERE approval = 'pending' AND removed = 0`),
      pendingChapters: n(`SELECT COUNT(*) AS n FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.approval = 'pending' AND s.approval = 'approved'`),
      openReports: n(`SELECT COUNT(*) AS n FROM content_reports WHERE status = 'open'`),
      openTakedowns: n(`SELECT COUNT(*) AS n FROM takedowns WHERE status IN ('open','reviewing')`),
      spam: n(`SELECT COUNT(*) AS n FROM spam_flags WHERE status = 'open'`),
    },
    daily,
    topSeries: (db.prepare(`SELECT s.id, s.slug, s.title, s.cover, COUNT(h.id) AS reads, (SELECT COUNT(*) FROM series_likes l WHERE l.series_id = s.id) AS likes FROM series s LEFT JOIN history h ON h.series_id = s.id AND h.viewed_at > ? WHERE s.removed = 0 GROUP BY s.id ORDER BY reads DESC, likes DESC LIMIT 8`).all(d30) as any[]),
    topWorld: (db.prepare(`SELECT w.anilist_id AS id, w.title, w.cover, COUNT(*) AS reads FROM world_history h JOIN world_titles w ON w.anilist_id = h.anilist_id WHERE h.at > ? GROUP BY h.anilist_id ORDER BY reads DESC LIMIT 8`).all(d30) as any[]),
    byType: (db.prepare(`SELECT type, SUM(n) AS reads FROM (SELECT s.type, COUNT(*) AS n FROM history h JOIN series s ON s.id = h.series_id WHERE h.viewed_at > @d GROUP BY s.type UNION ALL SELECT w.type, COUNT(*) FROM world_history h JOIN world_titles w ON w.anilist_id = h.anilist_id WHERE h.at > @d GROUP BY w.type) GROUP BY type ORDER BY reads DESC`).all({ d: d30 }) as any[]),
    byCountry: (db.prepare(`SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS users FROM users GROUP BY country ORDER BY users DESC LIMIT 10`).all() as any[]),
  };
}

// ======================= Routes =======================
type Helpers = { me: (req: Request) => PublicUser | undefined };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerAdminRoutes(app: Express, { me }: Helpers) {
  const staff = (level: "moderator" | "admin") => (req: Request, res: Response, next: NextFunction) => {
    const u = me(req);
    if (!u) return res.status(401).json({ message: "Sign in to do that" });
    const ok = level === "admin" ? u.role === "admin" : u.role === "admin" || u.role === "moderator";
    if (!ok) return res.status(403).json({ message: level === "admin" ? "Admins only" : "Moderators and admins only" });
    (req as any).user = u;
    next();
  };
  const mod = staff("moderator"), admin = staff("admin");
  const actor = (req: Request) => (req as any).user.id as number;

  // ----- public: report anything -----
  app.post("/api/report", (req, res) => {
    const u = me(req);
    if (!u) return res.status(401).json({ message: "Sign in to report content" });
    const type = String(req.body?.targetType);
    if (!(REPORT_TARGETS as readonly string[]).includes(type)) return res.status(400).json({ message: "Unknown content type" });
    const reason = str(req.body?.reason, 80);
    if (reason.length < 3) return res.status(400).json({ message: "Pick a reason" });
    const id = Number(req.body?.targetId);
    if (!targetSummary(type, id)) return res.status(404).json({ message: "That content no longer exists" });
    res.status(201).json({ id: fileReport(u.id, type, id, reason, str(req.body?.details, 1000)) });
  });

  // ----- overview & analytics -----
  app.get("/api/admin/overview", mod, (_req, res) => res.json(overview()));

  // ----- approvals -----
  app.get("/api/admin/approvals", mod, (_req, res) => {
    const series = db.prepare(`SELECT s.*, u.username, u.display_name, u.verified, (SELECT COUNT(*) FROM chapters c WHERE c.series_id = s.id) AS chapters FROM series s JOIN users u ON u.id = s.creator_id WHERE s.approval = 'pending' AND s.removed = 0 ORDER BY s.created_at`).all() as any[];
    const chapters = db.prepare(`SELECT c.id, c.number, c.title, c.pages, c.created_at, c.publish_at, s.id AS sid, s.title AS s_title, s.slug, s.cover, u.username, u.display_name FROM chapters c JOIN series s ON s.id = c.series_id JOIN users u ON u.id = s.creator_id WHERE c.approval = 'pending' AND s.approval = 'approved' ORDER BY c.created_at`).all() as any[];
    const recent = db.prepare(`SELECT l.*, u.display_name FROM mod_logs l LEFT JOIN users u ON u.id = l.actor_id WHERE l.action LIKE 'series.%' OR l.action LIKE 'chapter.%' ORDER BY l.created_at DESC LIMIT 15`).all();
    res.json({
      series: series.map((s) => ({ id: s.id, slug: s.slug, title: s.title, type: s.type, genres: JSON.parse(s.genres), synopsis: s.synopsis, cover: s.cover, status: s.status, regions: s.regions, createdAt: s.created_at, chapters: s.chapters, creator: { username: s.username, displayName: s.display_name, verified: !!s.verified } })),
      chapters: chapters.map((c) => ({ id: c.id, number: c.number, title: c.title, pages: JSON.parse(c.pages), createdAt: c.created_at, publishAt: c.publish_at, series: { id: c.sid, title: c.s_title, slug: c.slug, cover: c.cover }, creator: { username: c.username, displayName: c.display_name } })),
      recent,
    });
  });
  app.get("/api/admin/chapters/:id/pages", mod, (req, res) => {
    const c: any = db.prepare(`SELECT pages FROM chapters WHERE id = ?`).get(Number(req.params.id));
    c ? res.json(JSON.parse(c.pages)) : res.status(404).json({ message: "Chapter not found" });
  });
  app.post("/api/admin/series/:id/review", mod, (req, res) => {
    const s: any = db.prepare(`SELECT * FROM series WHERE id = ?`).get(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Series not found" });
    const decision = req.body?.decision === "approve" ? "approved" : req.body?.decision === "reject" ? "rejected" : null;
    if (!decision) return res.status(400).json({ message: "Approve or reject" });
    const note = str(req.body?.note, 500);
    if (decision === "rejected" && note.length < 3) return res.status(400).json({ message: "Tell the creator why it was rejected" });
    db.transaction(() => {
      db.prepare(`UPDATE series SET approval = ?, review_note = ? WHERE id = ?`).run(decision, note || null, s.id);
      if (decision === "approved" && req.body?.withChapters !== false) db.prepare(`UPDATE chapters SET approval = 'approved' WHERE series_id = ? AND approval = 'pending'`).run(s.id);
    })();
    modlog(actor(req), `series.${decision === "approved" ? "approve" : "reject"}`, "series", s.id, `${s.title}${note ? ` — ${note}` : ""}`);
    notify(s.creator_id, { type: "approval", title: decision === "approved" ? `“${s.title}” is live` : `“${s.title}” needs changes`, body: decision === "approved" ? "Your series was approved and is now public on MANGASALT." : note, link: decision === "approved" ? `/series/${s.slug}` : `/studio/series/${s.id}`, actorId: actor(req) });
    res.json({ ok: true });
  });
  app.post("/api/admin/chapters/:id/review", mod, (req, res) => {
    const c: any = db.prepare(`SELECT c.*, s.title AS s_title, s.creator_id, s.id AS sid FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.id = ?`).get(Number(req.params.id));
    if (!c) return res.status(404).json({ message: "Chapter not found" });
    const decision = req.body?.decision === "approve" ? "approved" : req.body?.decision === "reject" ? "rejected" : null;
    if (!decision) return res.status(400).json({ message: "Approve or reject" });
    const note = str(req.body?.note, 500);
    if (decision === "rejected" && note.length < 3) return res.status(400).json({ message: "Tell the creator why it was rejected" });
    db.prepare(`UPDATE chapters SET approval = ?, review_note = ? WHERE id = ?`).run(decision, note || null, c.id);
    modlog(actor(req), `chapter.${decision === "approved" ? "approve" : "reject"}`, "chapter", c.id, `${c.s_title} ch. ${c.number}${note ? ` — ${note}` : ""}`);
    notify(c.creator_id, { type: "approval", title: decision === "approved" ? `Chapter ${c.number} of “${c.s_title}” approved` : `Chapter ${c.number} of “${c.s_title}” needs changes`, body: decision === "approved" ? (c.publish_at > Date.now() ? "It will go live at its scheduled time." : "It is now live.") : note, link: `/studio/series/${c.sid}`, actorId: actor(req) });
    res.json({ ok: true });
  });

  // ----- users -----
  app.get("/api/admin/users", mod, (req, res) => {
    const q = str(req.query.q, 40), role = str(req.query.role, 12), status = str(req.query.status, 12);
    const where = ["1=1"]; const p: any = {};
    if (q) { where.push(`(username LIKE @q OR display_name LIKE @q)`); p.q = `%${q}%`; }
    if (["user", "moderator", "admin"].includes(role)) { where.push(`role = @role`); p.role = role; }
    if (status === "banned") where.push(`banned = 1`);
    if (status === "creators") where.push(`is_creator = 1`);
    const rows = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comments, (SELECT COUNT(*) FROM content_reports r WHERE r.target_type = 'user' AND r.target_id = u.id AND r.status = 'open') AS reports,
      (SELECT MAX(t) FROM (SELECT MAX(viewed_at) AS t FROM history WHERE user_id = u.id UNION ALL SELECT MAX(at) FROM world_history WHERE user_id = u.id UNION ALL SELECT MAX(created_at) FROM comments WHERE user_id = u.id)) AS last_active
      FROM users u WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC LIMIT 200`).all(p) as any[];
    res.json(rows.map((r) => ({ ...pub(r), createdAt: r.created_at, banned: !!r.banned, banReason: r.ban_reason, country: r.country, comments: r.comments, reports: r.reports, lastActive: r.last_active, canPublish: !!r.can_publish })));
  });
  app.patch("/api/admin/users/:id", mod, (req, res) => {
    const id = Number(req.params.id);
    const u: any = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!u) return res.status(404).json({ message: "User not found" });
    const me_ = (req as any).user as PublicUser;
    if (id === me_.id) return res.status(400).json({ message: "You can't change your own account here" });
    if (u.role === "admin" && me_.role !== "admin") return res.status(403).json({ message: "Only admins can change other admins" });
    const b = req.body ?? {};
    if (b.role !== undefined) {
      if (me_.role !== "admin") return res.status(403).json({ message: "Only admins can change roles" });
      if (!["user", "moderator", "admin"].includes(b.role)) return res.status(400).json({ message: "Unknown role" });
      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(b.role, id);
      modlog(me_.id, "user.role", "user", id, `@${u.username}: ${u.role} → ${b.role}`);
      notify(id, { type: "system", title: "Your account role changed", body: `You are now a ${b.role} on MANGASALT.`, link: b.role === "user" ? null : "/admin", actorId: me_.id });
    }
    if (b.banned !== undefined) {
      const reason = str(b.reason, 300);
      if (b.banned && reason.length < 3) return res.status(400).json({ message: "Add a reason for the suspension" });
      db.prepare(`UPDATE users SET banned = ?, ban_reason = ? WHERE id = ?`).run(b.banned ? 1 : 0, b.banned ? reason : null, id);
      if (b.banned) db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);
      modlog(me_.id, b.banned ? "user.ban" : "user.unban", "user", id, `@${u.username}${reason ? ` — ${reason}` : ""}`);
    }
    if (b.signOut) { db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id); modlog(me_.id, "user.signout", "user", id, `@${u.username}`); }
    res.json({ ok: true });
  });

  // ----- creators -----
  app.get("/api/admin/creators", mod, (_req, res) => {
    const rows = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM series s WHERE s.creator_id = u.id) AS series, (SELECT COUNT(*) FROM series s WHERE s.creator_id = u.id AND s.approval = 'pending') AS pending,
      (SELECT COUNT(*) FROM chapters c JOIN series s ON s.id = c.series_id WHERE s.creator_id = u.id) AS chapters,
      (SELECT COUNT(*) FROM series_likes l JOIN series s ON s.id = l.series_id WHERE s.creator_id = u.id) AS likes,
      (SELECT COALESCE(SUM(views),0) FROM series s WHERE s.creator_id = u.id) AS views,
      (SELECT COUNT(*) FROM follows f WHERE f.target_type = 'creator' AND f.target_id = u.id) AS followers,
      (SELECT COUNT(*) FROM takedowns t WHERE t.target LIKE '%' || u.username || '%') AS complaints
      FROM users u WHERE u.is_creator = 1 ORDER BY likes DESC`).all() as any[];
    res.json(rows.map((r) => ({ ...pub(r), createdAt: r.created_at, banned: !!r.banned, canPublish: !!r.can_publish, series: r.series, pending: r.pending, chapters: r.chapters, likes: r.likes, views: r.views, followers: r.followers, complaints: r.complaints })));
  });
  app.get("/api/admin/creators/:id/series", mod, (req, res) => res.json(db.prepare(`SELECT id, slug, title, cover, type, approval, removed, views, created_at AS createdAt, (SELECT COUNT(*) FROM chapters c WHERE c.series_id = s.id) AS chapters FROM series s WHERE creator_id = ? ORDER BY created_at DESC`).all(Number(req.params.id))));
  app.patch("/api/admin/creators/:id", mod, (req, res) => {
    const id = Number(req.params.id);
    const u: any = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!u) return res.status(404).json({ message: "Creator not found" });
    const b = req.body ?? {};
    if (b.verified !== undefined) { db.prepare(`UPDATE users SET verified = ? WHERE id = ?`).run(b.verified ? 1 : 0, id); modlog(actor(req), b.verified ? "creator.verify" : "creator.unverify", "user", id, `@${u.username}`); if (b.verified) notify(id, { type: "system", title: "You're a verified creator", body: "Your new series and chapters now go live without waiting for review.", link: "/studio", actorId: actor(req) }); }
    if (b.canPublish !== undefined) { db.prepare(`UPDATE users SET can_publish = ? WHERE id = ?`).run(b.canPublish ? 1 : 0, id); modlog(actor(req), b.canPublish ? "creator.restore_publishing" : "creator.suspend_publishing", "user", id, `@${u.username}${b.reason ? ` — ${str(b.reason, 300)}` : ""}`); notify(id, { type: "moderation", title: b.canPublish ? "Publishing restored" : "Publishing paused", body: b.canPublish ? "You can publish on MANGASALT again." : str(b.reason, 300) || "A moderator paused publishing on your account.", link: "/studio", actorId: actor(req) }); }
    res.json({ ok: true });
  });
  app.post("/api/admin/series/:id/visibility", mod, (req, res) => {
    const s: any = db.prepare(`SELECT * FROM series WHERE id = ?`).get(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Series not found" });
    const removed = !!req.body?.removed, reason = str(req.body?.reason, 300);
    if (removed && reason.length < 3) return res.status(400).json({ message: "Add a reason" });
    db.prepare(`UPDATE series SET removed = ? WHERE id = ?`).run(removed ? 1 : 0, s.id);
    modlog(actor(req), removed ? "series.remove" : "series.restore", "series", s.id, `${s.title}${reason ? ` — ${reason}` : ""}`);
    notify(s.creator_id, { type: "moderation", title: removed ? `“${s.title}” was taken down` : `“${s.title}” was restored`, body: removed ? reason : "Your series is visible again.", link: `/studio/series/${s.id}`, actorId: actor(req) });
    res.json({ ok: true });
  });
  app.patch("/api/admin/series/:id/regions", mod, (req, res) => {
    const s: any = db.prepare(`SELECT * FROM series WHERE id = ?`).get(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Series not found" });
    const regions = String(req.body?.regions ?? "");
    if (regions && !/^(only|except):[A-Z]{2}(,[A-Z]{2})*$/.test(regions)) return res.status(400).json({ message: "Invalid region list" });
    db.prepare(`UPDATE series SET regions = ? WHERE id = ?`).run(regions, s.id);
    modlog(actor(req), "series.regions", "series", s.id, `${s.title}: ${regions || "worldwide"}`);
    res.json({ ok: true });
  });
  app.get("/api/admin/series", mod, (req, res) => {
    const q = str(req.query.q, 60);
    res.json(db.prepare(`SELECT s.id, s.slug, s.title, s.cover, s.type, s.approval, s.removed, s.regions, s.views, u.username FROM series s JOIN users u ON u.id = s.creator_id ${q ? "WHERE s.title LIKE @q OR s.slug LIKE @q" : ""} ORDER BY s.created_at DESC LIMIT 100`).all(q ? { q: `%${q}%` } : {}));
  });

  // ----- copyright complaints -----
  app.get("/api/admin/takedowns", mod, (req, res) => {
    const status = str(req.query.status, 12);
    res.json(db.prepare(`SELECT t.*, u.display_name AS handler FROM takedowns t LEFT JOIN users u ON u.id = t.handled_by ${status ? "WHERE t.status = ?" : ""} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, t.created_at DESC LIMIT 200`).all(...(status ? [status] : []))
      .map((t: any) => ({ id: t.id, name: t.name, email: t.email, ownerOf: t.owner_of, target: t.target, details: t.details, status: t.status, note: t.status_note, handler: t.handler, createdAt: t.created_at, updatedAt: t.updated_at })));
  });
  app.patch("/api/admin/takedowns/:id", mod, (req, res) => {
    const t: any = db.prepare(`SELECT * FROM takedowns WHERE id = ?`).get(Number(req.params.id));
    if (!t) return res.status(404).json({ message: "Complaint not found" });
    const status = String(req.body?.status);
    if (!["open", "reviewing", "resolved", "rejected"].includes(status)) return res.status(400).json({ message: "Unknown status" });
    const note = str(req.body?.note, 1000);
    db.prepare(`UPDATE takedowns SET status = ?, status_note = ?, handled_by = ?, updated_at = ? WHERE id = ?`).run(status, note || t.status_note, actor(req), Date.now(), t.id);
    // optionally take the named series down as part of resolving the complaint
    const sid = Number(req.body?.removeSeriesId);
    if (sid && status === "resolved") {
      const s: any = db.prepare(`SELECT * FROM series WHERE id = ?`).get(sid);
      if (s) {
        db.prepare(`UPDATE series SET removed = 1 WHERE id = ?`).run(sid);
        modlog(actor(req), "series.remove", "series", sid, `${s.title} — copyright complaint #${t.id}`);
        notify(s.creator_id, { type: "moderation", title: `“${s.title}” was taken down`, body: `We received a copyright complaint (#${t.id}) and removed this series. Reply via the copyright page if you believe this is a mistake.`, link: "/legal/copyright", actorId: actor(req) });
      }
    }
    modlog(actor(req), `takedown.${status}`, "takedown", t.id, `${t.owner_of} → ${t.target.slice(0, 120)}${note ? ` — ${note}` : ""}`);
    res.json({ ok: true });
  });

  // ----- content reports -----
  app.get("/api/admin/reports", mod, (req, res) => {
    const status = str(req.query.status, 12) || "open";
    const rows = db.prepare(`SELECT r.*, u.username, u.display_name FROM content_reports r JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 300`).all(status) as any[];
    // group reports about the same item
    const groups = new Map<string, any>();
    for (const r of rows) {
      const k = `${r.target_type}:${r.target_id}`;
      const g = groups.get(k) ?? { key: k, targetType: r.target_type, targetId: r.target_id, target: targetSummary(r.target_type, r.target_id), reports: [] as any[], latest: 0 };
      g.reports.push({ id: r.id, reason: r.reason, details: r.details, createdAt: r.created_at, reporter: { username: r.username, displayName: r.display_name }, resolution: r.resolution });
      g.latest = Math.max(g.latest, r.created_at); groups.set(k, g);
    }
    res.json(Array.from(groups.values()).sort((a, b) => b.reports.length - a.reports.length || b.latest - a.latest));
  });
  app.post("/api/admin/reports/resolve", mod, (req, res) => {
    const type = String(req.body?.targetType), id = Number(req.body?.targetId), action = String(req.body?.action);
    if (!(REPORT_TARGETS as readonly string[]).includes(type)) return res.status(400).json({ message: "Unknown content type" });
    const note = str(req.body?.note, 300);
    if (action === "hide") {
      if (type === "comment") db.prepare(`UPDATE comments SET hidden = 1 WHERE id = ?`).run(id);
      else if (type === "series") db.prepare(`UPDATE series SET removed = 1 WHERE id = ?`).run(id);
      else if (type === "chapter") db.prepare(`UPDATE chapters SET approval = 'rejected', review_note = ? WHERE id = ?`).run(note || "Removed after a report", id);
      else if (type === "user") { db.prepare(`UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?`).run(note || "Suspended after reports", id); db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id); }
      const owner: any = type === "comment" ? db.prepare(`SELECT user_id AS u FROM comments WHERE id = ?`).get(id) : type === "series" ? db.prepare(`SELECT creator_id AS u FROM series WHERE id = ?`).get(id) : type === "chapter" ? db.prepare(`SELECT s.creator_id AS u FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.id = ?`).get(id) : null;
      if (owner?.u) notify(owner.u, { type: "moderation", title: `Your ${type} was removed`, body: note || "It broke the MANGASALT community rules.", link: "/legal/terms", actorId: actor(req) });
    } else if (action !== "dismiss") return res.status(400).json({ message: "Dismiss or hide" });
    db.prepare(`UPDATE content_reports SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE target_type = ? AND target_id = ? AND status = 'open'`).run(action === "hide" ? `removed${note ? `: ${note}` : ""}` : "dismissed", actor(req), Date.now(), type, id);
    modlog(actor(req), `report.${action}`, type, id, note);
    res.json({ ok: true });
  });

  // ----- spam -----
  app.get("/api/admin/spam", mod, (_req, res) => {
    const rows = db.prepare(`SELECT f.*, c.body, c.series_id, c.created_at AS posted, u.username, u.display_name, u.created_at AS joined FROM spam_flags f JOIN comments c ON c.id = f.comment_id JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.created_at DESC LIMIT 200`).all() as any[];
    res.json({
      flags: rows.map((r) => ({ id: r.id, commentId: r.comment_id, score: r.score, reasons: JSON.parse(r.reasons), body: r.body, postedAt: r.posted, user: { id: r.user_id, username: r.username, displayName: r.display_name, joined: r.joined } })),
      settings: { threshold: SPAM_THRESHOLD(), blocked: settings.get<string[]>("spam.blocked", DEFAULT_BLOCKED) },
      stats: { caught7: (db.prepare(`SELECT COUNT(*) AS n FROM spam_flags WHERE created_at > ?`).get(Date.now() - 7 * DAY) as any).n, released: (db.prepare(`SELECT COUNT(*) AS n FROM spam_flags WHERE status = 'released'`).get() as any).n, removed: (db.prepare(`SELECT COUNT(*) AS n FROM spam_flags WHERE status = 'removed'`).get() as any).n },
    });
  });
  app.post("/api/admin/spam/:id", mod, (req, res) => {
    const f: any = db.prepare(`SELECT * FROM spam_flags WHERE id = ?`).get(Number(req.params.id));
    if (!f) return res.status(404).json({ message: "Flag not found" });
    const action = String(req.body?.action);
    if (action === "release") { db.prepare(`UPDATE comments SET hidden = 0, spam = 0 WHERE id = ?`).run(f.comment_id); db.prepare(`UPDATE spam_flags SET status = 'released' WHERE id = ?`).run(f.id); }
    else if (action === "remove" || action === "ban") {
      db.prepare(`DELETE FROM comment_likes WHERE comment_id = ?`).run(f.comment_id);
      db.prepare(`DELETE FROM comments WHERE id = ?`).run(f.comment_id);
      db.prepare(`UPDATE spam_flags SET status = 'removed' WHERE id = ?`).run(f.id);
      if (action === "ban") { db.prepare(`UPDATE users SET banned = 1, ban_reason = 'Spam' WHERE id = ? AND role = 'user'`).run(f.user_id); db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(f.user_id); }
    } else return res.status(400).json({ message: "Unknown action" });
    modlog(actor(req), `spam.${action}`, "comment", f.comment_id, `user #${f.user_id}`);
    res.json({ ok: true });
  });
  app.put("/api/admin/spam/settings", admin, (req, res) => {
    const threshold = Math.max(1, Math.min(10, Number(req.body?.threshold) || 3));
    const blocked = Array.isArray(req.body?.blocked) ? req.body.blocked.map((w: any) => String(w).trim().slice(0, 60)).filter(Boolean).slice(0, 200) : DEFAULT_BLOCKED;
    settings.set("spam.threshold", threshold); settings.set("spam.blocked", blocked);
    modlog(actor(req), "spam.settings", "settings", "spam", `threshold ${threshold}, ${blocked.length} phrases`);
    res.json({ ok: true });
  });

  // ----- uploads -----
  app.get("/api/admin/uploads", admin, (_req, res) => res.json(uploadsReport()));
  app.post("/api/admin/uploads/clean", admin, (req, res) => {
    const refs = referencedUploads(), cutoff = Date.now() - 3600e3; // leave fresh uploads alone (a chapter may still be in progress)
    const only = Array.isArray(req.body?.paths) ? new Set(req.body.paths.map(String)) : null;
    let n = 0, bytes = 0;
    for (const f of walk(UP)) {
      if (refs.has(f.rel) || f.mtime > cutoff || (only && !only.has(f.rel))) continue;
      try { fs.unlinkSync(path.resolve(f.rel)); n++; bytes += f.bytes; } catch {}
    }
    modlog(actor(req), "uploads.clean", "uploads", "orphans", `${n} files, ${bytes} bytes`);
    res.json({ removed: n, bytes });
  });

  // ----- health -----
  app.get("/api/admin/health", admin, async (_req, res) => res.json(await health()));

  // ----- backups -----
  app.get("/api/admin/backups", admin, (_req, res) => res.json({ backups: listBackups(), intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24), keep: settings.get<number>("backup.keep", 14), dir: path.relative(process.cwd(), BACKUPS) || "." }));
  app.post("/api/admin/backups", admin, async (req, res) => {
    try { const name = await createBackup(false); modlog(actor(req), "backup.create", "backup", name); res.status(201).json({ name }); }
    catch (e: any) { res.status(500).json({ message: `Backup failed: ${e.message}` }); }
  });
  app.get("/api/admin/backups/:name", admin, (req, res) => {
    const name = String(req.params.name);
    if (!/^mangasalt-[\w-]+\.db$/.test(name) || !fs.existsSync(path.join(BACKUPS, name))) return res.status(404).json({ message: "Backup not found" });
    modlog(actor(req), "backup.download", "backup", name);
    res.download(path.join(BACKUPS, name));
  });
  app.delete("/api/admin/backups/:name", admin, (req, res) => {
    const name = String(req.params.name);
    if (!/^mangasalt-[\w-]+\.db$/.test(name)) return res.status(400).json({ message: "Invalid name" });
    try { fs.unlinkSync(path.join(BACKUPS, name)); } catch { return res.status(404).json({ message: "Backup not found" }); }
    modlog(actor(req), "backup.delete", "backup", name);
    res.json({ ok: true });
  });

  // ----- moderation logs -----
  app.get("/api/admin/logs", mod, (req, res) => {
    const q = str(req.query.q, 60), action = str(req.query.action, 40), before = Number(req.query.before) || Date.now() + 1;
    const where = ["l.created_at < @before"]; const p: any = { before };
    if (q) { where.push(`(l.details LIKE @q OR l.target_id = @raw)`); p.q = `%${q}%`; p.raw = q; }
    if (action) { where.push(`l.action LIKE @a`); p.a = `${action}%`; }
    const rows = db.prepare(`SELECT l.*, u.id AS uid, u.username, u.display_name, u.bio, u.avatar_hue, u.is_creator FROM mod_logs l LEFT JOIN users u ON u.id = l.actor_id WHERE ${where.join(" AND ")} ORDER BY l.created_at DESC LIMIT 100`).all(p) as any[];
    const logs: ModLog[] = rows.map((r) => ({ id: r.id, at: r.created_at, action: r.action, targetType: r.target_type, targetId: r.target_id, details: r.details, actor: r.uid ? { id: r.uid, username: r.username, displayName: r.display_name, bio: r.bio, avatarHue: r.avatar_hue, isCreator: r.is_creator } : null }));
    res.json(logs);
  });

  // ----- broadcast notifications -----
  app.post("/api/admin/notify", admin, (req, res) => {
    const title = str(req.body?.title, 120), body = str(req.body?.body, 500), link = str(req.body?.link, 200) || null;
    if (title.length < 3) return res.status(400).json({ message: "Add a title" });
    if (link && !link.startsWith("/")) return res.status(400).json({ message: "Links must start with / (an in-app page)" });
    const audience = String(req.body?.audience ?? "all");
    const sql = audience === "creators" ? `SELECT id FROM users WHERE banned = 0 AND is_creator = 1` : audience === "readers" ? `SELECT id FROM users WHERE banned = 0 AND is_creator = 0` : audience === "staff" ? `SELECT id FROM users WHERE banned = 0 AND role IN ('admin','moderator')` : `SELECT id FROM users WHERE banned = 0`;
    const ids = db.prepare(sql).all().map((r: any) => r.id);
    const sent = notify(ids, { type: "system", title, body, link });
    modlog(actor(req), "notify.broadcast", "audience", audience, `${title} (${sent} recipients)`);
    res.json({ sent });
  });

  scheduleBackups();
}

/** Promote users listed in ADMIN_USERNAMES (comma separated) to admin at startup. */
export function bootstrapAdmins() {
  const names = String(process.env.ADMIN_USERNAMES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const n of names) {
    const r = db.prepare(`UPDATE users SET role = 'admin' WHERE username = ? AND role != 'admin'`).run(n);
    if (r.changes) modlog(null, "user.role", "user", n, `@${n}: promoted to admin from ADMIN_USERNAMES`);
  }
}
export { studio };
