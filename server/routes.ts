import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, verifyPassword } from "./storage";
import { seedIfEmpty } from "./seed";
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
    const order = (["trending", "likes", "latest", "views"] as const).find((o) => o === req.query.order) ?? "trending";
    res.json(storage.listSeries({ me: me(req)?.id, type, q: q || undefined, order, limit: 40 }));
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

  return httpServer;
}
