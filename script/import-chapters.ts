// Import chapters from a ZIP / CBZ / PDF (or a folder of them) into an existing series, from the server shell.
// Use this for big archives that are slow to upload through the browser.
//
//   npm run import-chapters -- --series <slug> --file <path> [--language en] [--kind regular|volume|…]
//                              [--number 5] [--title "…"] [--publish] --rights-confirmed
//
// --rights-confirmed is required: only import work MANGASALT owns, licenses, or that is under an open license.
import fs from "node:fs";
import path from "node:path";
import { storage } from "../server/storage";
import { readArchive, savePages } from "../server/importer";
import { CHAPTER_KINDS } from "@shared/chapters";

const a = process.argv.slice(2);
const opt = (k: string) => { const i = a.indexOf(k); return i < 0 ? undefined : a[i + 1]; };
const has = (k: string) => a.includes(k);
const die = (m: string) => { console.error(m); process.exit(1); };

(async () => {
  const slug = opt("--series"), file = opt("--file");
  if (!slug || !file) die("Usage: npm run import-chapters -- --series <slug> --file <path> [--language en] [--kind regular] [--number N] [--title T] [--publish] --rights-confirmed");
  if (!has("--rights-confirmed")) die("Add --rights-confirmed to confirm MANGASALT may distribute these chapters.");
  const db = storage.raw();
  const s: any = db.prepare(`SELECT * FROM series WHERE slug = ?`).get(slug);
  if (!s) die(`No series with slug "${slug}"`);
  const language = (opt("--language") ?? "en").toLowerCase(), kind = opt("--kind") ?? "regular";
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(language)) die("Language must be a code like en or es");
  if (!(CHAPTER_KINDS as string[]).includes(kind)) die(`Kind must be one of ${CHAPTER_KINDS.join(", ")}`);
  const files = fs.statSync(file!).isDirectory() ? fs.readdirSync(file!).filter((f) => /\.(zip|cbz|pdf)$/i.test(f)).sort(new Intl.Collator(undefined, { numeric: true }).compare).map((f) => path.join(file!, f)) : [file!];
  const publish = has("--publish"), now = Date.now();
  let next = (db.prepare(`SELECT COALESCE(MAX(number), 0) AS m FROM chapters WHERE series_id = ? AND kind = ? AND language = ?`).get(s.id, kind, language) as any).m;
  const ins = db.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at, approval, publish_at, notified, kind, language, numbered, published, updated_at) VALUES (?,?,?,?,?,'approved',?,?,?,?,1,?,?)`);
  let created = 0;
  for (const f of files) {
    const { chapters, problems } = await readArchive(fs.readFileSync(f), path.basename(f));
    problems.forEach((p) => console.warn(`skip ${p.name}: ${p.reason}`));
    for (const c of chapters) {
      const single = files.length === 1 && chapters.length === 1;
      const n = single && opt("--number") ? Number(opt("--number")) : c.number ?? next + 1;
      if (db.prepare(`SELECT 1 FROM chapters WHERE series_id = ? AND number = ? AND kind = ? AND language = ?`).get(s.id, n, kind, language)) { console.warn(`skip ${c.name}: number ${n} already exists`); continue; }
      const pages = savePages(s.creator_id, c.pages);
      ins.run(s.id, n, (single && opt("--title")) || c.title, JSON.stringify(pages), now, now, publish ? 0 : 1, kind, language, publish ? 1 : 0, now);
      next = Math.max(next, n); created++;
      console.log(`${publish ? "published" : "draft"}  #${n}  ${c.title || c.name}  (${pages.length} pages)`);
    }
  }
  console.log(`${created} chapter(s) imported into ${s.title}.`);
  process.exit(0);
})().catch((e) => die(e.message ?? String(e)));
