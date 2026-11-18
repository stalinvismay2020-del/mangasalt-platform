// Chapter availability, search and management.
// A chapter is "available" only when MANGASALT hosts its pages and has the right to show them:
// published + approved + released + pages uploaded + series approved + the reader's region allowed.
// Externally licensed chapters are listed for information only and link to the official publisher.
import type { Express, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import { worldTitle } from "./anilist";
import { officialChapters } from "./mangadex";
import { tapasEpisodes } from "./tapas";
import { countryOf, seriesRegion } from "./social";
import { modlog } from "./admin";
import { isStaff } from "@shared/platform";
import type { PublicUser } from "@shared/schema";
import { pageChapters, inferKind, fmtNum, CHAPTER_KINDS, type ChapterItem, type ChapterPage, type ChapterKind } from "@shared/chapters";

const db = storage.raw();

// Official publisher domains. A link is only shown when it points to one of these.
const VERIFIED = /^https:\/\/([a-z0-9-]+\.)*(mangaplus\.shueisha\.co\.jp|viz\.com|comikey\.com|webtoons\.com|tapas\.io|kodansha\.us|kmanga\.kodansha\.com|azuki\.co|manga\.bilibili\.com|bilibilicomics\.com|j-novel\.club|yenpress\.com|inkr\.com|mangamo\.com|tappytoon\.com|lezhinus\.com|lezhin\.com|pocketcomics\.com|manta\.net|globalcomix\.com|webnovel\.com|toomics\.com|coolmic\.me|mangatoon\.mobi|zebrack-comic\.shueisha\.co\.jp|comic-days\.com|shonenjumpplus\.com|mangaup\.net|square-enix-games\.com|sevenseasentertainment\.com|darkhorse\.com|amazon\.com|comixology\.com)(\/|$)/i;
export const verifiedUrl = (u: string | null | undefined) => (u && VERIFIED.test(u) ? u : null);

const PAGE_RE = /^uploads\/u\d+\/[a-f0-9]{24}\.(webp|jpg|png)$/;

type Viewer = { id: number | null; privileged: boolean; blocked: boolean; regionLabel: string };

/** Hosted chapters of one MANGASALT series, with honest statuses. */
export function hostedItems(seriesId: number, v: Viewer): ChapterItem[] {
  const now = Date.now();
  const rows = db.prepare(`SELECT id, number, title, pages, kind, language, numbered, published, approval, publish_at, created_at FROM chapters WHERE series_id = ? ORDER BY number`).all(seriesId) as any[];
  const read = new Set(v.id ? (db.prepare(`SELECT DISTINCT chapter_id AS id FROM history WHERE user_id = ? AND series_id = ? AND chapter_id IS NOT NULL`).all(v.id, seriesId) as any[]).map((r) => r.id) : []);
  const prog = new Map<number, number>(v.id ? (db.prepare(`SELECT p.chapter_id AS id, p.page FROM reading_progress p JOIN chapters c ON c.id = p.chapter_id WHERE p.user_id = ? AND c.series_id = ?`).all(v.id, seriesId) as any[]).map((r) => [r.id, r.page]) : []);
  const out: ChapterItem[] = [];
  for (const c of rows) {
    const pages: string[] = JSON.parse(c.pages || "[]");
    const approved = c.approval === "approved" && c.published === 1;
    if (!approved && !v.privileged) continue; // drafts and chapters in review are not public
    const kind = (CHAPTER_KINDS as string[]).includes(c.kind) ? (c.kind as ChapterKind) : "regular";
    const item: ChapterItem = {
      key: `h${c.id}`, number: c.numbered ? fmtNum(c.number) : null, num: c.number, kind, title: c.title || null, language: c.language || "en",
      releaseAt: c.publish_at || c.created_at, status: "available", chapterId: c.id, pageCount: pages.length,
      thumb: pages[0] ? pages[0].replace(/p\d+\.webp$/, "cover.webp") : null, read: read.has(c.id), page: prog.get(c.id) ?? null,
    };
    if (!approved) { item.status = "unavailable"; item.reason = c.published !== 1 ? "Draft. Only staff and the creator can see it." : c.approval === "pending" ? "Waiting for review." : "Rejected in review."; }
    else if (c.publish_at > now) { item.status = "coming_soon"; item.reason = "Scheduled release."; }
    else if (!pages.length) { item.status = "not_uploaded"; item.reason = "Listed, but its pages haven't been uploaded yet."; }
    else if (v.blocked) { item.status = "unavailable"; item.reason = `Not offered in your region (${v.regionLabel}).`; }
    if (item.status !== "available") { item.thumb = null; if (!v.privileged) delete item.chapterId; }
    out.push(item);
  }
  return out;
}

function viewerFor(req: Request, u: PublicUser | undefined, seriesId: number, creatorId: number): Viewer {
  const region = seriesRegion(seriesId, countryOf(req, u));
  const privileged = isStaff(u) || creatorId === u?.id;
  return { id: u?.id ?? null, privileged, blocked: region.blocked && !privileged, regionLabel: region.label };
}

const numKey = (kind: ChapterKind, n: string | null) => `${kind}:${n ?? ""}`;

/** Every known chapter of a catalogue title: hosted (authorised) + official publisher index + numbering gaps. */
async function worldItems(req: Request, u: PublicUser | undefined, id: number) {
  const t: any = await worldTitle(id);
  const hosted: any = db.prepare(`SELECT id, slug, title, creator_id FROM series WHERE anilist_id = ? AND approval = 'approved' AND removed = 0 ORDER BY id LIMIT 1`).get(id);
  const items = new Map<string, ChapterItem>();
  if (hosted) for (const c of hostedItems(hosted.id, viewerFor(req, u, hosted.id, hosted.creator_id))) items.set(numKey(c.kind, c.number ?? c.key), c);

  const [md, tapas] = await Promise.all([
    officialChapters(id, [t.title, t.altTitle ?? ""]).catch(() => ({ found: false, chapters: [] as any[] })),
    t.tapasUrl ? tapasEpisodes(t.tapasUrl).catch(() => []) : Promise.resolve([]),
  ]);
  const opened = new Set(u ? (db.prepare(`SELECT DISTINCT chapter FROM world_history WHERE user_id = ? AND anilist_id = ?`).all(u.id, id) as any[]).map((r) => r.chapter) : []);
  const external = (key: string, number: string | null, title: string | null, publishedAt: string | null, publisher: string | null, url: string | null, unavailable: boolean, access: ChapterItem["access"] = null) => {
    const kind = inferKind(number, title);
    const n = number && /^\d+(\.\d+)?$/.test(number) ? Number(number) : null;
    const label = n != null ? fmtNum(n) : null;
    const k = numKey(kind, label ?? key);
    if (items.has(k)) return; // a hosted copy wins
    const v = verifiedUrl(url);
    items.set(k, {
      key: `x${key}`, number: label, num: n, kind, title, language: "en", releaseAt: publishedAt ? Date.parse(publishedAt) || null : null,
      status: unavailable ? "unavailable" : "external", publisher, url: unavailable ? null : v, access, read: opened.has(key),
      reason: unavailable ? `${publisher ?? "The publisher"} no longer offers this chapter.` : `Published by ${publisher ?? "an official publisher"}. It can't be read inside MANGASALT.`,
    });
  };
  for (const c of md.chapters) external(c.key, c.number, c.title, c.publishedAt, c.sources[0]?.publisher ?? null, c.sources[0]?.url ?? null, !!c.unavailable);
  for (const e of tapas) external(e.key, e.number, e.title, e.publishedAt, "Tapas", e.src, false, e.access);

  // Chapters the catalogue says exist but nobody (us or an indexed publisher) has: honest gap rows.
  const regular = Array.from(items.values()).filter((c) => c.kind === "regular" && c.num != null);
  const maxKnown = regular.reduce((m, c) => Math.max(m, Math.floor(c.num!)), 0);
  const total = Math.min(3000, Math.max(t.chapters ?? 0, maxKnown));
  const licensed: string[] = t.official ?? [];
  for (let n = 1; n <= total; n++) {
    const k = numKey("regular", String(n));
    if (items.has(k)) continue;
    items.set(k, licensed.length
      ? { key: `g${n}`, number: String(n), num: n, kind: "regular", title: null, language: "en", releaseAt: null, status: "external", publisher: licensed[0], url: null, read: opened.has(String(n)),
          reason: `Licensed in English to ${licensed.slice(0, 2).join(" and ")}. Not readable on MANGASALT.` }
      : { key: `g${n}`, number: String(n), num: n, kind: "regular", title: null, language: "en", releaseAt: null, status: "not_uploaded", reason: "No authorised copy on MANGASALT yet." });
  }
  return { t, list: Array.from(items.values()), hosted: hosted ? { slug: hosted.slug, title: hosted.title } : null, publishers: licensed };
}

const opts = (req: Request) => ({
  q: typeof req.query.q === "string" ? req.query.q : "", status: typeof req.query.status === "string" ? req.query.status : "",
  sort: typeof req.query.sort === "string" ? req.query.sort : "asc", lang: typeof req.query.lang === "string" ? req.query.lang : "",
  page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerChapterRoutes(app: Express, { me }: { me: (req: Request) => PublicUser | undefined }) {
  const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
    fn(req, res).catch((e: any) => res.status(e.status ?? 502).json({ message: e.message ?? "Chapter list unavailable" }));

  // ---------- public chapter lists (server-side search, filters, sort, paging) ----------
  app.get("/api/world/title/:id/chapters", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ message: "Title not found" });
    const w = await worldItems(req, me(req), id);
    const page: ChapterPage = { ...pageChapters(w.list, opts(req)), publishers: w.publishers, catalogueCount: w.t.chapters ?? null, hosted: w.hosted };
    res.json(page);
  }));
  app.get("/api/series/by-slug/:slug/chapters", (req, res) => {
    const u = me(req);
    const s: any = db.prepare(`SELECT id, title, slug, creator_id, approval, removed, anilist_id FROM series WHERE slug = ?`).get(String(req.params.slug));
    const v = s && viewerFor(req, u, s.id, s.creator_id);
    if (!s || ((s.approval !== "approved" || s.removed) && !v.privileged)) return res.status(404).json({ message: "Series not found" });
    const page: ChapterPage = { ...pageChapters(hostedItems(s.id, v), opts(req)), publishers: [], catalogueCount: null, hosted: { slug: s.slug, title: s.title } };
    res.json(page);
  });

  // ---------- admin chapter management ----------
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
  const seriesRow = (id: number) => db.prepare(`SELECT s.*, u.username FROM series s JOIN users u ON u.id = s.creator_id WHERE s.id = ?`).get(id) as any;
  const chapterRow = (id: number) => db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(id) as any;
  const toAdminChapter = (c: any) => {
    const pages: string[] = JSON.parse(c.pages || "[]");
    const now = Date.now();
    const status = c.published !== 1 ? "draft" : c.approval !== "approved" ? c.approval : c.publish_at > now ? "scheduled" : !pages.length ? "no_pages" : "published";
    return { id: c.id, seriesId: c.series_id, number: c.number, numbered: !!c.numbered, kind: c.kind, title: c.title, language: c.language, releaseAt: c.publish_at, published: c.published === 1,
      approval: c.approval, status, pageCount: pages.length, pages, createdAt: c.created_at, updatedAt: c.updated_at || c.created_at };
  };
  const toAdminSeries = (s: any) => ({
    id: s.id, slug: s.slug, title: s.title, type: s.type, cover: s.cover, rights: s.rights, rightsNote: s.rights_note, anilistId: s.anilist_id, approval: s.approval, removed: !!s.removed,
    regions: s.regions, creator: s.username,
    chapters: (db.prepare(`SELECT COUNT(*) AS n FROM chapters WHERE series_id = ?`).get(s.id) as any).n,
    published: (db.prepare(`SELECT COUNT(*) AS n FROM chapters WHERE series_id = ? AND published = 1 AND approval = 'approved' AND pages != '[]'`).get(s.id) as any).n,
  });

  app.get("/api/admin/content/series", mod, (req, res) => {
    const q = str(req.query.q, 80);
    const rows = db.prepare(`SELECT s.*, u.username FROM series s JOIN users u ON u.id = s.creator_id WHERE s.title LIKE ? OR s.slug LIKE ? OR CAST(s.anilist_id AS TEXT) = ? ORDER BY s.removed, s.title LIMIT 100`).all(`%${q}%`, `%${q}%`, q) as any[];
    res.json(rows.map(toAdminSeries));
  });
  app.patch("/api/admin/content/series/:id", admin, (req, res) => {
    const s = seriesRow(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Series not found" });
    const b = req.body ?? {};
    const sets: string[] = [], vals: any[] = [];
    if (b.anilistId !== undefined) {
      const a = b.anilistId === null || b.anilistId === "" ? null : Number(b.anilistId);
      if (a !== null && (!Number.isInteger(a) || a <= 0)) return res.status(400).json({ message: "AniList ID must be a positive number" });
      if (a !== null && db.prepare(`SELECT 1 FROM series WHERE anilist_id = ? AND id != ?`).get(a, s.id)) return res.status(409).json({ message: "Another series is already linked to that catalogue title" });
      sets.push("anilist_id = ?"); vals.push(a);
    }
    if (b.rights !== undefined) { if (!["original", "licensed", "open"].includes(b.rights)) return res.status(400).json({ message: "Pick a rights basis" }); sets.push("rights = ?"); vals.push(b.rights); }
    if (b.rightsNote !== undefined) { sets.push("rights_note = ?"); vals.push(str(b.rightsNote, 1000)); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to change" });
    db.prepare(`UPDATE series SET ${sets.join(", ")} WHERE id = ?`).run(...vals, s.id);
    modlog(actor(req), "content.series_update", "series", s.id, JSON.stringify(b).slice(0, 500));
    res.json(toAdminSeries(seriesRow(s.id)));
  });
  app.get("/api/admin/content/series/:id/chapters", mod, (req, res) => {
    const s = seriesRow(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Series not found" });
    const rows = db.prepare(`SELECT * FROM chapters WHERE series_id = ? ORDER BY number, language`).all(s.id) as any[];
    res.json({ series: toAdminSeries(s), chapters: rows.map(toAdminChapter) });
  });

  const validPages = (pages: unknown, existing: string[]) => {
    if (!Array.isArray(pages) || pages.length > 300) return null;
    const ok = pages.every((p) => typeof p === "string" && (existing.includes(p) || (PAGE_RE.test(p) && fs.existsSync(path.resolve(p)))));
    return ok && new Set(pages).size === pages.length ? (pages as string[]) : null;
  };
  const chapterInput = (b: any, existing?: any) => {
    const errs: string[] = [];
    const out: any = {};
    const kind = b.kind ?? existing?.kind ?? "regular";
    if (!(CHAPTER_KINDS as string[]).includes(kind)) errs.push("Pick a chapter type");
    out.kind = kind;
    if (b.number !== undefined || !existing) {
      const n = Number(String(b.number ?? "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100000 || Math.round(n * 1000) !== n * 1000) errs.push("Chapter number must be 0 or more, with up to 3 decimals");
      out.number = n;
    }
    if (b.numbered !== undefined || !existing) out.numbered = kind === "regular" ? 1 : b.numbered === false ? 0 : 1;
    if (b.title !== undefined || !existing) { const t = str(b.title, 120); out.title = t; }
    if (b.language !== undefined || !existing) { const l = str(b.language ?? "en", 8).toLowerCase() || "en"; if (!/^[a-z]{2}(-[a-z]{2})?$/.test(l)) errs.push("Language must be a code like en or es"); out.language = l; }
    if (b.releaseAt !== undefined) { const r = b.releaseAt === null || b.releaseAt === "" ? Date.now() : Number(b.releaseAt); if (!Number.isFinite(r) || r < 0) errs.push("Pick a valid release date"); out.publish_at = Math.floor(r); }
    else if (!existing) out.publish_at = Date.now();
    return { out, errs };
  };
  const dupe = (seriesId: number, number: number, kind: string, language: string, exceptId = -1) =>
    db.prepare(`SELECT 1 FROM chapters WHERE series_id = ? AND number = ? AND kind = ? AND language = ? AND id != ?`).get(seriesId, number, kind, language, exceptId);

  app.post("/api/admin/content/series/:id/chapters", admin, (req, res) => {
    const s = seriesRow(Number(req.params.id));
    if (!s || s.removed) return res.status(404).json({ message: "Series not found" });
    if (req.body?.rightsConfirmed !== true) return res.status(400).json({ message: "Confirm MANGASALT has permission to distribute this chapter" });
    const { out, errs } = chapterInput(req.body ?? {});
    const pages = validPages(req.body?.pages ?? [], []);
    if (!pages) errs.push("Pages must be images uploaded here");
    if (errs.length) return res.status(400).json({ message: errs[0] });
    if (dupe(s.id, out.number, out.kind, out.language)) return res.status(409).json({ message: `That ${out.kind === "regular" ? "chapter" : out.kind} number already exists in this language` });
    const publish = req.body?.publish === true && pages!.length > 0;
    const now = Date.now();
    const r = db.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at, approval, publish_at, notified, kind, language, numbered, published, updated_at) VALUES (?,?,?,?,?,'approved',?,?,?,?,?,?,?)`)
      .run(s.id, out.number, out.title, JSON.stringify(pages), now, out.publish_at, publish ? 0 : 1, out.kind, out.language, out.numbered, publish ? 1 : 0, now);
    modlog(actor(req), "content.chapter_create", "chapter", Number(r.lastInsertRowid), `${s.title} #${out.number} (${out.kind}, ${out.language})${publish ? " published" : " draft"}`);
    res.status(201).json(toAdminChapter(chapterRow(Number(r.lastInsertRowid))));
  });
  app.patch("/api/admin/content/chapters/:cid", admin, (req, res) => {
    const c = chapterRow(Number(req.params.cid));
    if (!c) return res.status(404).json({ message: "Chapter not found" });
    const b = req.body ?? {};
    const { out, errs } = chapterInput(b, c);
    if (b.pages !== undefined) { const p = validPages(b.pages, JSON.parse(c.pages || "[]")); if (!p) errs.push("Pages must be images uploaded here"); else out.pages = JSON.stringify(p); }
    if (b.published !== undefined) {
      const pages = out.pages ? JSON.parse(out.pages) : JSON.parse(c.pages || "[]");
      if (b.published === true && !pages.length) errs.push("Upload at least one page before publishing");
      if (b.published === true && b.rightsConfirmed !== true && c.published !== 1) errs.push("Confirm MANGASALT has permission to distribute this chapter");
      out.published = b.published === true ? 1 : 0;
      if (b.published === true && c.published !== 1) { out.approval = "approved"; out.notified = 0; }
    }
    if (errs.length) return res.status(400).json({ message: errs[0] });
    const n = out.number ?? c.number, k = out.kind ?? c.kind, l = out.language ?? c.language;
    if (dupe(c.series_id, n, k, l, c.id)) return res.status(409).json({ message: "Another chapter already has that number, type and language" });
    out.updated_at = Date.now();
    const keys = Object.keys(out);
    db.prepare(`UPDATE chapters SET ${keys.map((x) => `${x} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((x) => out[x]), c.id);
    // remove page files that were dropped from the chapter (only our own uploads)
    if (out.pages) { const keep = new Set(JSON.parse(out.pages)); for (const p of JSON.parse(c.pages || "[]")) if (!keep.has(p) && PAGE_RE.test(p)) fs.promises.unlink(path.resolve(p)).catch(() => {}); }
    modlog(actor(req), b.published === true ? "content.chapter_publish" : b.published === false ? "content.chapter_unpublish" : "content.chapter_update", "chapter", c.id, keys.join(","));
    res.json(toAdminChapter(chapterRow(c.id)));
  });
  app.delete("/api/admin/content/chapters/:cid", admin, (req, res) => {
    const c = chapterRow(Number(req.params.cid));
    if (!c) return res.status(404).json({ message: "Chapter not found" });
    if (req.body?.confirm !== `delete ${fmtNum(c.number)}`) return res.status(400).json({ message: `Type "delete ${fmtNum(c.number)}" to confirm` });
    db.transaction(() => {
      db.prepare(`DELETE FROM chapters WHERE id = ?`).run(c.id);
      db.prepare(`DELETE FROM bookmarks WHERE chapter_id = ?`).run(c.id);
      db.prepare(`DELETE FROM reading_progress WHERE chapter_id = ?`).run(c.id);
      db.prepare(`UPDATE history SET chapter_id = NULL WHERE chapter_id = ?`).run(c.id);
    })();
    for (const p of JSON.parse(c.pages || "[]")) if (PAGE_RE.test(p)) fs.promises.unlink(path.resolve(p)).catch(() => {});
    modlog(actor(req), "content.chapter_delete", "chapter", c.id, `series ${c.series_id} #${c.number}`);
    res.json({ ok: true });
  });
}
