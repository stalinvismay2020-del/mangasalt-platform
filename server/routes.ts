import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, verifyPassword, studio, readingStats, takedowns } from "./storage";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { seedIfEmpty, ensurePepper, removePlaceholders } from "./seed";
import { coverFile } from "./catalogue-md";
import { worldSearch, worldTitle, worldHome, WORLD_GENRES } from "./anilist";
import { registerChapterRoutes } from "./chapters";
import { signupSchema, loginSchema, SERIES_TYPES } from "@shared/schema";
import { registerSocialRoutes, notify, staffIds, countryOf, seriesRegion, badges } from "./social";
import { registerAdminRoutes, installMetrics, bootstrapAdmins, spamCheck, flagIfSpam, fileReport, modlog } from "./admin";
import { isStaff } from "@shared/platform";

function token(req: Request) {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}
function me(req: Request) { return storage.userFromToken(token(req)); }
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const u = me(req);
  if (!u) return res.status(401).json({ message: "Sign in to do that" });
  (req as any).user = u;
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  installMetrics(app);
  seedIfEmpty();
  removePlaceholders();
  ensurePepper();
  bootstrapAdmins();
  registerSocialRoutes(app, { me, requireAuth });
  registerAdminRoutes(app, { me });
  registerChapterRoutes(app, { me });
  const db = storage.raw();

  // ---------- auth ----------
  const findLogin = (id: string): any => id.includes("@") ? db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`).get(id.trim()) : storage.getUserByUsername(id.trim());
  const banMsg = (r: any) => `This account is suspended${r.ban_reason ? `: ${r.ban_reason}` : ""}. Contact support if you think this is a mistake.`;
  app.post("/api/auth/signup", (req, res) => {
    const p = signupSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Invalid details" });
    if (storage.getUserByUsername(p.data.username)) return res.status(409).json({ message: "That username is taken. Try another." });
    const email = p.data.email ? p.data.email.toLowerCase() : null;
    if (email && db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email)) return res.status(409).json({ message: "An account with that email already exists. Sign in instead." });
    const u = storage.createUser(p.data.username, p.data.password, p.data.displayName);
    if (email) db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, u.id);
    const t = storage.createSession(u.id);
    res.json({ token: t, user: storage.userFromToken(t) });
  });
  app.post("/api/auth/login", (req, res) => {
    const p = loginSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Enter username and password" });
    const r = findLogin(p.data.username);
    if (!r || !verifyPassword(p.data.password, r.password)) return res.status(401).json({ message: r?.google_sub && !p.data.username.includes("@") ? "Wrong password" : r?.google_sub ? "This account uses Google. Tap Continue with Google." : "Wrong username or password" });
    if (r.banned) return res.status(403).json({ message: banMsg(r) });
    const t = storage.createSession(r.id);
    res.json({ token: t, user: storage.userFromToken(t) });
  });

  // ---------- Google sign-in (Google Identity Services ID token) ----------
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  app.get("/api/auth/config", (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID || null }));
  app.post("/api/auth/google", async (req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ message: "Google sign-in isn't set up yet." });
    const credential = String(req.body?.credential ?? "");
    if (!credential || credential.length > 4096) return res.status(400).json({ message: "Missing Google credential" });
    let info: any;
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      info = await r.json();
      if (!r.ok) throw new Error(info?.error_description || "invalid");
    } catch { return res.status(401).json({ message: "Google sign-in failed. Please try again." }); }
    const issOk = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
    if (info.aud !== GOOGLE_CLIENT_ID || !issOk || Number(info.exp) * 1000 < Date.now()) return res.status(401).json({ message: "Google sign-in couldn't be verified." });
    if (info.email_verified !== true && info.email_verified !== "true") return res.status(401).json({ message: "Verify your Google email first." });
    const email = String(info.email).toLowerCase(), sub = String(info.sub);
    let row: any = db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(sub) ?? db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (row) {
      if (!row.google_sub) db.prepare(`UPDATE users SET google_sub = ? WHERE id = ?`).run(sub, row.id); // link existing account with the same verified email
    } else {
      const base = (email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "reader").slice(0, 15).padEnd(3, "0");
      let name = base;
      for (let i = 0; storage.getUserByUsername(name); i++) name = `${base}${Math.floor(Math.random() * 9000) + 1000}`.slice(0, 20);
      const u = storage.createUser(name, randomBytes(24).toString("hex"), String(info.name || info.given_name || name).slice(0, 40));
      db.prepare(`UPDATE users SET email = ?, google_sub = ? WHERE id = ?`).run(email, sub, u.id);
      row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id);
    }
    if (row.banned) return res.status(403).json({ message: banMsg(row) });
    const t = storage.createSession(row.id);
    res.json({ token: t, user: storage.userFromToken(t) });
  });
  app.post("/api/auth/logout", (req, res) => { const t = token(req); if (t) storage.deleteSession(t); res.json({ ok: true }); });
  app.get("/api/auth/me", (req, res) => res.json({ user: me(req) ?? null }));

  // ---------- home + discovery ----------
  app.get("/api/home", (req, res) => res.json(storage.home(me(req)?.id)));

  app.get("/api/series", (req, res) => {
    const type = typeof req.query.type === "string" && (SERIES_TYPES as readonly string[]).includes(req.query.type) ? req.query.type : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : undefined;
    const order = (["trending", "likes", "latest", "views", "week", "az", "rating", "match"] as const).find((o) => o === req.query.order) ?? "trending";
    const genre = typeof req.query.genre === "string" ? req.query.genre.slice(0, 40) : undefined;
    const status = typeof req.query.status === "string" && ["ongoing", "completed", "hiatus"].includes(req.query.status) ? req.query.status : undefined;
    res.json(storage.listSeries({ me: me(req)?.id, type, q: q || undefined, genre: genre || undefined, status, order, limit: 40 }));
  });
  app.get("/api/genres", (_req, res) => res.json(storage.genres()));
  app.get("/api/me/library", requireAuth, (req, res) => res.json(storage.library((req as any).user.id)));
  app.post("/api/series/:id/save", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!storage.seriesExists(id)) return res.status(404).json({ message: "Series not found" });
    res.json(storage.toggleSaved((req as any).user.id, id));
  });

  app.post("/api/series/:id/like", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!storage.seriesExists(id)) return res.status(404).json({ message: "Series not found" });
    res.json(storage.toggleSeriesLike((req as any).user.id, id));
  });

  app.post("/api/series/:id/view", (req, res) => {
    const id = Number(req.params.id);
    const u = me(req);
    if (u && storage.seriesExists(id)) storage.addHistory(u.id, id);
    res.json({ ok: true });
  });

  app.post("/api/follow/:type/:id", requireAuth, (req, res) => {
    const t = req.params.type === "series" ? "series" : req.params.type === "creator" ? "creator" : req.params.type === "user" ? "user" : null;
    if (!t) return res.status(400).json({ message: "Invalid follow target" });
    const uid = (req as any).user.id, target = Number(req.params.id);
    if (t === "user") {
      if (target === uid) return res.status(400).json({ message: "You can't follow yourself" });
      if (!db.prepare(`SELECT 1 FROM users WHERE id = ? AND banned = 0`).get(target)) return res.status(404).json({ message: "Reader not found" });
    }
    const r = storage.toggleFollow(uid, t, target);
    if (r.following && (t === "user" || t === "creator")) {
      const u = (req as any).user;
      notify(target, { type: "follow", title: `${u.displayName} followed you`, body: t === "creator" ? "They'll hear about your new chapters." : "", link: `/u/${u.username}`, actorId: uid });
    }
    if (r.following) badges(uid);
    res.json(r);
  });

  // ---------- series page + reader ----------
  app.get("/api/series/by-slug/:slug", (req, res) => {
    const u = me(req);
    const d = storage.seriesDetail(String(req.params.slug), u?.id, isStaff(u));
    if (!d) return res.status(404).json({ message: "Series not found" });
    res.json({ ...d, region: seriesRegion(d.series.id, countryOf(req, u)) });
  });
  const chapterGate = (req: Request, res: Response, id: number) => {
    const u = me(req);
    const c: any = db.prepare(`SELECT c.approval, c.published, c.pages, c.publish_at, s.id AS sid, s.approval AS s_approval, s.removed, s.creator_id FROM chapters c JOIN series s ON s.id = c.series_id WHERE c.id = ?`).get(id);
    if (!c) { res.status(404).json({ message: "Chapter not found" }); return false; }
    const privileged = isStaff(u) || c.creator_id === u?.id;
    if (!privileged && (c.approval !== "approved" || c.published !== 1 || c.pages === "[]" || c.publish_at > Date.now() || c.s_approval !== "approved" || c.removed)) { res.status(404).json({ message: c.publish_at > Date.now() && c.approval === "approved" && c.published === 1 ? "This chapter hasn't been released yet" : "Chapter not found" }); return false; }
    const region = seriesRegion(c.sid, countryOf(req, u));
    if (region.blocked && !privileged) { res.status(451).json({ message: `This series isn't available in your region (${region.label}).` }); return false; }
    return true;
  };
  app.get("/api/chapters/:id", (req, res) => {
    if (!chapterGate(req, res, Number(req.params.id))) return;
    const d = storage.chapter(Number(req.params.id), me(req)?.id);
    if (!d) return res.status(404).json({ message: "Chapter not found" });
    res.json(d);
  });
  app.post("/api/chapters/:id/read", (req, res) => {
    const u = me(req);
    if (u) { storage.readChapter(u.id, Number(req.params.id)); badges(u.id); }
    res.json({ ok: true });
  });
  // last page reached in each chapter, synced across devices
  db.exec(`CREATE TABLE IF NOT EXISTS reading_progress (user_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, chapter_id))`);
  app.get("/api/chapters/:id/progress", (req, res) => {
    const u = me(req);
    const r: any = u ? db.prepare(`SELECT page, updated_at FROM reading_progress WHERE user_id = ? AND chapter_id = ?`).get(u.id, Number(req.params.id)) : null;
    res.json({ page: r?.page ?? null, updatedAt: r?.updated_at ?? null });
  });
  app.put("/api/chapters/:id/progress", requireAuth, (req, res) => {
    const id = Number(req.params.id), page = Math.max(0, Math.min(500, Math.floor(Number(req.body?.page) || 0)));
    if (!db.prepare(`SELECT 1 FROM chapters WHERE id = ?`).get(id)) return res.status(404).json({ message: "Chapter not found" });
    db.prepare(`INSERT INTO reading_progress (user_id, chapter_id, page, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, chapter_id) DO UPDATE SET page = excluded.page, updated_at = excluded.updated_at`).run((req as any).user.id, id, page, Date.now());
    res.json({ ok: true });
  });
  app.post("/api/chapters/:id/bookmark", requireAuth, (req, res) => {
    const page = Math.max(0, Math.min(500, Number(req.body?.page) || 0));
    const r = storage.toggleBookmark((req as any).user.id, Number(req.params.id), page);
    if (!r) return res.status(404).json({ message: "Chapter not found" });
    res.json(r);
  });

  // ---------- comments ----------
  /** Store a comment, run spam detection and notify the person being replied to. */
  const postComment = (req: Request, sid: number, body: string, parentId: number | null, chapterId: number | null) => {
    const u = (req as any).user;
    const check = spamCheck(u.id, body);
    const r = storage.addComment(u.id, sid, body, !!req.body?.spoiler, parentId, chapterId);
    const held = flagIfSpam(r.id, u.id, check);
    if (!held) {
      badges(u.id);
      if (parentId) {
        const parent: any = db.prepare(`SELECT user_id FROM comments WHERE id = ?`).get(parentId);
        const link = sid > 0 ? `/series/${(db.prepare(`SELECT slug FROM series WHERE id = ?`).get(sid) as any)?.slug}` : `/title/${-sid}`;
        if (parent) notify(parent.user_id, { type: "reply", title: `${u.displayName} replied to you`, body: body.slice(0, 160), link, actorId: u.id });
      }
    }
    return { ...r, held };
  };
  app.get("/api/series/:id/comments", (req, res) => {
    const cid = req.query.chapter ? Number(req.query.chapter) : undefined;
    res.json(storage.comments(Number(req.params.id), me(req)?.id, cid));
  });
  app.post("/api/series/:id/comments", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!storage.seriesExists(id)) return res.status(404).json({ message: "Series not found" });
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (body.length < 1 || body.length > 2000) return res.status(400).json({ message: "Comments need 1 to 2000 characters" });
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (parentId && storage.seriesIdOfComment(parentId) !== id) return res.status(400).json({ message: "Reply target not found" });
    res.json(postComment(req, id, body, parentId, req.body?.chapterId ? Number(req.body.chapterId) : null));
  });
  app.post("/api/comments/:id/like", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!storage.seriesIdOfComment(id)) return res.status(404).json({ message: "Comment not found" });
    res.json(storage.toggleCommentLike((req as any).user.id, id));
  });
  app.post("/api/comments/:id/report", requireAuth, (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    if (reason.length < 3) return res.status(400).json({ message: "Tell us what is wrong" });
    if (!storage.reportComment((req as any).user.id, Number(req.params.id), reason)) return res.status(404).json({ message: "Comment not found" });
    fileReport((req as any).user.id, "comment", Number(req.params.id), reason);
    res.json({ ok: true });
  });

  // ---------- worldwide catalogue (AniList metadata + official in-app chapters) ----------
  const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
    fn(req, res).catch((e: any) => res.status(e.status ?? 502).json({ message: e.message ?? "Catalogue unavailable" }));
  app.get("/api/world/genres", (_req, res) => res.json(WORLD_GENRES));
  app.get("/api/world/home", wrap(async (_req, res) => res.json(await worldHome())));
  app.get("/api/world/search", wrap(async (req, res) => {
    const str = (k: string, n = 80) => (typeof req.query[k] === "string" ? String(req.query[k]).trim().slice(0, n) : "");
    res.json(await worldSearch({
      q: str("q") || undefined, genres: str("genres", 300).split(",").filter(Boolean), type: str("type") || undefined,
      status: str("status") || undefined, sort: str("sort") || undefined, period: str("period") || undefined, official: req.query.official === "1", page: Math.max(1, Math.min(100, Number(req.query.page) || 1)),
    }));
  }));
  // MangaDex covers are proxied and cached on disk (MangaDex forbids hotlinking)
  app.get("/api/md/cover/:uuid/:file", wrap(async (req, res) => {
    const f = await coverFile(String(req.params.uuid), String(req.params.file), Number(req.query.s) || 512);
    if (!f) return res.status(404).json({ message: "Cover not found" });
    res.set("Cache-Control", "public, max-age=2592000, immutable").type("image/jpeg").sendFile(f);
  }));
  app.get("/api/world/title/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ message: "Title not found" });
    const t = await worldTitle(id);
    storage.upsertWorld(t);
    res.json({ ...t, ...storage.worldState(t.id, me(req)?.id) });
  }));
  app.post("/api/legal/takedown", (req, res) => {
    const b = req.body ?? {};
    const str = (k: string, max: number) => (typeof b[k] === "string" ? b[k].trim().slice(0, max) : "");
    const t = { name: str("name", 120), email: str("email", 200), ownerOf: str("ownerOf", 300), target: str("target", 500), details: str("details", 3000) };
    if (!t.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email) || !t.ownerOf || !t.target || t.details.length < 20)
      return res.status(400).json({ message: "Please fill in every field (details: at least 20 characters)." });
    if (b.goodFaith !== true || b.accurate !== true) return res.status(400).json({ message: "Please confirm both statements." });
    const id = takedowns.create(t);
    notify(staffIds(), { type: "moderation", title: "New copyright complaint", body: `${t.ownerOf} · ${t.target.slice(0, 120)}`, link: "/admin/copyright" });
    res.status(201).json({ id });
  });
  app.get("/api/me/stats", requireAuth, (req, res) => res.json(readingStats((req as any).user.id)));
  app.get("/api/world/random", wrap(async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const page = 1 + Math.floor(Math.random() * 8);
    const r = await worldSearch({ sort: "popular", type, page, perPage: 30, extras: false });
    const pick = r.items[Math.floor(Math.random() * r.items.length)];
    if (!pick) return res.status(404).json({ message: "Nothing to pick" });
    res.json({ id: pick.id, title: pick.title });
  }));
  app.post("/api/world/title/:id/like", requireAuth, (req, res) => { const r = storage.toggleWorld("world_likes", (req as any).user.id, Number(req.params.id)); res.json({ liked: r.on, likes: r.likes }); });
  app.post("/api/world/title/:id/save", requireAuth, (req, res) => res.json({ saved: storage.toggleWorld("world_saves", (req as any).user.id, Number(req.params.id)).on }));
  app.post("/api/world/title/:id/read", (req, res) => {
    const u = me(req);
    const ch = typeof req.body?.chapter === "string" ? req.body.chapter.slice(0, 20) : "";
    if (u && ch) storage.worldRead(u.id, Number(req.params.id), ch);
    res.json({ ok: true });
  });
  app.get("/api/me/world", requireAuth, (req, res) => res.json(storage.worldLibrary((req as any).user.id)));
  app.get("/api/world/community", (_req, res) => res.json(storage.mostLikedWorld()));
  // comments on worldwide titles are stored with a negative series id (-anilistId)
  app.get("/api/world/title/:id/comments", (req, res) => res.json(storage.comments(-Number(req.params.id), me(req)?.id, req.query.chapter ? Number(req.query.chapter) : undefined)));
  app.post("/api/world/title/:id/comments", requireAuth, (req, res) => {
    const sid = -Number(req.params.id);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (body.length < 1 || body.length > 2000) return res.status(400).json({ message: "Comments need 1 to 2000 characters" });
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (parentId && storage.seriesIdOfComment(parentId) !== sid) return res.status(400).json({ message: "Reply target not found" });
    res.json(postComment(req, sid, body, parentId, null));
  });

  // ---------- Creator Studio ----------
  const UP = path.resolve("uploads");
  fs.mkdirSync(UP, { recursive: true });
  app.use("/uploads", express.static(UP, { maxAge: "30d", immutable: true, fallthrough: false }));
  const mine = (uid: number) => new RegExp(`^uploads/u${uid}/[a-f0-9]{24}\\.(webp|jpg|png)$`);
  const unlinkAll = (paths: string[]) => paths.forEach((p) => { if (/^uploads\/u\d+\/[a-f0-9]{24}\.(webp|jpg|png)$/.test(p)) fs.promises.unlink(path.resolve(p)).catch(() => {}); });
  const S_TYPES = ["manga", "manhwa", "manhua", "comic"], S_STATUS = ["ongoing", "completed", "hiatus"];
  const seriesInput = (b: any, partial = false) => {
    const out: any = {};
    const err = (m: string) => { throw Object.assign(new Error(m), { status: 400 }); };
    if (!partial || b.title !== undefined) { const t = String(b.title ?? "").trim(); if (t.length < 2 || t.length > 80) err("Title needs 2 to 80 characters"); out.title = t; }
    if (!partial || b.type !== undefined) { if (!S_TYPES.includes(b.type)) err("Pick a format"); out.type = b.type; }
    if (!partial || b.status !== undefined) { out.status = S_STATUS.includes(b.status) ? b.status : "ongoing"; }
    if (!partial || b.synopsis !== undefined) { const t = String(b.synopsis ?? "").trim(); if (t.length < 10 || t.length > 1500) err("Synopsis needs 10 to 1500 characters"); out.synopsis = t; }
    if (b.regions !== undefined) { const r = String(b.regions ?? ""); if (r && !/^(only|except):[A-Z]{2}(,[A-Z]{2})*$/.test(r)) err("Pick valid countries"); out.regions = r; }
    if (!partial || b.genres !== undefined) { const g = Array.isArray(b.genres) ? b.genres.map((x: any) => String(x).slice(0, 24)).filter(Boolean).slice(0, 6) : []; if (!g.length) err("Pick at least one genre"); out.genres = g; }
    return out;
  };
  const canPublish = (uid: number) => !!db.prepare(`SELECT 1 FROM users WHERE id = ? AND can_publish = 1`).get(uid);
  const owner = (req: Request, res: Response) => {
    const s = studio.owned((req as any).user.id, Number(req.params.id));
    if (!s) { res.status(404).json({ message: "Series not found" }); return null; }
    return s;
  };

  app.post("/api/studio/upload", requireAuth, (req, res) => {
    const m = typeof req.body?.data === "string" ? req.body.data.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/) : null;
    if (!m) return res.status(400).json({ message: "Upload a WebP, JPEG or PNG image" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ message: "Each page must be under 6 MB" });
    const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8, isPng = buf.subarray(1, 4).toString() === "PNG";
    const ext = isWebp ? "webp" : isJpg ? "jpg" : isPng ? "png" : null;
    if (!ext) return res.status(400).json({ message: "That file isn't a valid image" });
    const uid = (req as any).user.id, dir = path.join(UP, `u${uid}`);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    res.json({ path: `uploads/u${uid}/${name}` });
  });
  app.get("/api/studio", requireAuth, (req, res) => res.json({ series: studio.mySeries((req as any).user.id) }));
  app.post("/api/studio/become", requireAuth, (req, res) => { studio.becomeCreator((req as any).user.id); res.json({ ok: true }); });
  app.post("/api/studio/series", requireAuth, wrap(async (req, res) => {
    const uid = (req as any).user.id;
    if (!canPublish(uid)) return res.status(403).json({ message: "Publishing is paused on your account. Check your notifications for details." });
    if (req.body?.rights !== true) return res.status(400).json({ message: "Confirm that you own the rights to this work" });
    const d = seriesInput(req.body);
    if (!mine(uid).test(String(req.body.cover ?? ""))) return res.status(400).json({ message: "Upload a cover image" });
    const created = studio.createSeries(uid, { ...d, cover: req.body.cover });
    if (created.approval === "pending") notify(staffIds(), { type: "moderation", title: "New series waiting for approval", body: d.title, link: "/admin/approvals" });
    modlog(uid, "series.submit", "series", created.id, `${d.title} (${created.approval})`);
    res.json(created);
  }));
  app.get("/api/studio/series/:id", requireAuth, (req, res) => {
    const s = studio.getSeries((req as any).user.id, Number(req.params.id));
    s ? res.json(s) : res.status(404).json({ message: "Series not found" });
  });
  app.patch("/api/studio/series/:id", requireAuth, wrap(async (req, res) => {
    const s = owner(req, res); if (!s) return;
    const d = seriesInput(req.body, true);
    if (req.body.cover !== undefined) {
      if (!mine((req as any).user.id).test(String(req.body.cover))) return res.status(400).json({ message: "Upload a cover image" });
      if (req.body.cover !== s.cover) unlinkAll([s.cover]);
      d.cover = req.body.cover;
    }
    studio.updateSeries(s.id, d);
    res.json({ ok: true });
  }));
  app.delete("/api/studio/series/:id", requireAuth, (req, res) => {
    const s = owner(req, res); if (!s) return;
    const full = studio.getSeries((req as any).user.id, s.id)!;
    studio.deleteSeries(s.id);
    unlinkAll([s.cover, ...full.chapters.flatMap((c: any) => c.pages)]);
    res.json({ ok: true });
  });
  app.post("/api/studio/series/:id/chapters", requireAuth, (req, res) => {
    const s = owner(req, res); if (!s) return;
    const uid = (req as any).user.id;
    const title = String(req.body?.title ?? "").trim().slice(0, 80);
    const pages: string[] = Array.isArray(req.body?.pages) ? req.body.pages : [];
    if (!pages.length || pages.length > 200 || !pages.every((p) => mine(uid).test(String(p)))) return res.status(400).json({ message: "Add between 1 and 200 uploaded pages" });
    if (!canPublish(uid)) return res.status(403).json({ message: "Publishing is paused on your account. Check your notifications for details." });
    const publishAt = Number(req.body?.publishAt) || undefined;
    if (publishAt && publishAt > Date.now() + 366 * 864e5) return res.status(400).json({ message: "Schedule within the next year" });
    const ch = studio.addChapter(s.id, { title: title || "Untitled", pages, number: Number(req.body?.number) || undefined, publishAt });
    if (ch.approval === "pending" && s.approval === "approved") notify(staffIds(), { type: "moderation", title: "New chapter waiting for approval", body: `${s.title} · Chapter ${ch.number}`, link: "/admin/approvals" });
    res.json(ch);
  });
  app.patch("/api/studio/chapters/:cid", requireAuth, (req, res) => {
    const uid = (req as any).user.id;
    const c = studio.chapterOwned(uid, Number(req.params.cid));
    if (!c) return res.status(404).json({ message: "Chapter not found" });
    const pages = req.body?.pages;
    if (pages !== undefined && (!Array.isArray(pages) || !pages.length || pages.length > 200 || !pages.every((p: any) => mine(uid).test(String(p))))) return res.status(400).json({ message: "Add between 1 and 200 uploaded pages" });
    const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 80) || "Untitled" : undefined;
    if (pages) unlinkAll(JSON.parse(c.pages).filter((p: string) => !pages.includes(p)));
    studio.updateChapter(c.id, { title, pages });
    res.json({ ok: true });
  });
  app.delete("/api/studio/chapters/:cid", requireAuth, (req, res) => {
    const c = studio.chapterOwned((req as any).user.id, Number(req.params.cid));
    if (!c) return res.status(404).json({ message: "Chapter not found" });
    studio.deleteChapter(c.id);
    unlinkAll(JSON.parse(c.pages));
    res.json({ ok: true });
  });

  return httpServer;
}
