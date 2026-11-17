import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, verifyPassword } from "./storage";
import { seedIfEmpty, backfillMeta, ensurePepper } from "./seed";
import { signupSchema, loginSchema, SERIES_TYPES } from "@shared/schema";

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
  seedIfEmpty();
  backfillMeta();
  ensurePepper();

  // ---------- auth ----------
  app.post("/api/auth/signup", (req, res) => {
    const p = signupSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Invalid details" });
    if (storage.getUserByUsername(p.data.username)) return res.status(409).json({ message: "That username is taken" });
    const u = storage.createUser(p.data.username, p.data.password, p.data.displayName);
    const t = storage.createSession(u.id);
    res.json({ token: t, user: storage.userFromToken(t) });
  });
  app.post("/api/auth/login", (req, res) => {
    const p = loginSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Enter username and password" });
    const r = storage.getUserByUsername(p.data.username);
    if (!r || !verifyPassword(p.data.password, r.password)) return res.status(401).json({ message: "Wrong username or password" });
    const t = storage.createSession(r.id);
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
    const t = req.params.type === "series" ? "series" : req.params.type === "creator" ? "creator" : null;
    if (!t) return res.status(400).json({ message: "Invalid follow target" });
    res.json(storage.toggleFollow((req as any).user.id, t, Number(req.params.id)));
  });

  // ---------- series page + reader ----------
  app.get("/api/series/by-slug/:slug", (req, res) => {
    const d = storage.seriesDetail(String(req.params.slug), me(req)?.id);
    if (!d) return res.status(404).json({ message: "Series not found" });
    res.json(d);
  });
  app.get("/api/chapters/:id", (req, res) => {
    const d = storage.chapter(Number(req.params.id), me(req)?.id);
    if (!d) return res.status(404).json({ message: "Chapter not found" });
    res.json(d);
  });
  app.post("/api/chapters/:id/read", (req, res) => {
    const u = me(req);
    if (u) storage.readChapter(u.id, Number(req.params.id));
    res.json({ ok: true });
  });
  app.post("/api/chapters/:id/bookmark", requireAuth, (req, res) => {
    const page = Math.max(0, Math.min(500, Number(req.body?.page) || 0));
    const r = storage.toggleBookmark((req as any).user.id, Number(req.params.id), page);
    if (!r) return res.status(404).json({ message: "Chapter not found" });
    res.json(r);
  });

  // ---------- comments ----------
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
    res.json(storage.addComment((req as any).user.id, id, body, !!req.body?.spoiler, parentId, req.body?.chapterId ? Number(req.body.chapterId) : null));
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
    res.json({ ok: true });
  });

  return httpServer;
}
