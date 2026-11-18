// Imports freely licensed manga and comics into MANGASALT as fully hosted series.
// Safe to re-run: existing chapters are skipped.
//
//   npm run open-library -- --bj <dir with enbj001.zip … enbj013.zip>   Give My Regards to Black Jack (English)
//   npm run open-library -- --mft                                     Mini Fantasy Theater (all episodes)
//
// Rights:
//  - "Give My Regards to Black Jack" by SHUHO SATO: free secondary use, including commercial, under Sato Manga
//    Works' terms (https://densho810.com/free/). Only the official data from densho810.com may be redistributed.
//    The title and "SHUHO SATO" must be shown with the work, and use must be reported to info@densho810.com
//    within a month of publishing.
//  - "Mini Fantasy Theater" by David Revoy: CC BY-SA 4.0 (https://www.peppercarrot.com/en/miniFantasyTheater/).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { storage, hashPassword } from "../server/storage";
import { imageExt, savePages, type ImportedPage } from "../server/importer";

const db = storage.raw();
const args = process.argv.slice(2);
const flag = (k: string) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : ""; };
const UP = path.resolve("uploads");

function ensureCreator(username: string, displayName: string, bio: string, hue: number): number {
  const r: any = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (r) return r.id;
  return Number(db.prepare(`INSERT INTO users (username, password, display_name, bio, avatar_hue, is_creator, verified, created_at) VALUES (?,?,?,?,?,1,1,?)`)
    .run(username, hashPassword(randomBytes(24).toString("hex")), displayName, bio, hue, Date.now()).lastInsertRowid);
}

function ensureSeries(s: { slug: string; title: string; type: string; genres: string[]; synopsis: string; status: string; year: number; rights: string; rightsNote: string; creatorId: number; cover: () => string }): number {
  const r: any = db.prepare(`SELECT id FROM series WHERE slug = ?`).get(s.slug);
  if (r) { db.prepare(`UPDATE series SET rights = ?, rights_note = ? WHERE id = ?`).run(s.rights, s.rightsNote, r.id); return r.id; }
  return Number(db.prepare(`INSERT INTO series (slug, title, type, genres, synopsis, cover, creator_id, status, views, rights, rights_note, created_at, rating, year, approval) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,0,?,'approved')`)
    .run(s.slug, s.title, s.type, JSON.stringify(s.genres), s.synopsis, s.cover(), s.creatorId, s.status, s.rights, s.rightsNote, Date.now(), s.year).lastInsertRowid);
}

const hasChapter = (sid: number, kind: string, n: number) => !!db.prepare(`SELECT 1 FROM chapters WHERE series_id = ? AND kind = ? AND number = ? AND language = 'en'`).get(sid, kind, n);
function addChapter(sid: number, kind: string, n: number, title: string, pages: string[], at: number) {
  db.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at, approval, publish_at, notified, kind, language, numbered, published, updated_at) VALUES (?,?,?,?,?,'approved',?,1,?,'en',1,1,?)`)
    .run(sid, n, title, JSON.stringify(pages), at, at, kind, at);
}

/** Resize/convert images in a folder to WebP (max 1200 px wide) in parallel. Returns pages in order. */
function optimise(dir: string, files: string[], width = 1200): ImportedPage[] {
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, files.map((f) => path.join(dir, f)).join("\n"));
  execFileSync("bash", ["-c", `xargs -a "${list}" -P ${Math.max(2, os.cpus().length)} -I{} magick {} -resize '${width}x>' -quality 80 -define webp:method=4 {}.webp`], { stdio: "inherit" });
  return files.map((f) => { const data = fs.readFileSync(path.join(dir, `${f}.webp`)); if (imageExt(data) !== "webp") throw new Error(`conversion failed: ${f}`); return { data, ext: "webp" as const }; });
}

function coverFrom(image: string, uid: number): string {
  const out = path.join(os.tmpdir(), `cover-${randomBytes(4).toString("hex")}.webp`);
  execFileSync("magick", [image, "-resize", "600x900^", "-gravity", "center", "-extent", "600x900", "-quality", "82", out]);
  const [p] = savePages(uid, [{ data: fs.readFileSync(out), ext: "webp" }], UP);
  fs.rmSync(out, { force: true });
  return p;
}

// ---------------------------------------------------------------- Give My Regards to Black Jack
function blackJack(dir: string) {
  const uid = ensureCreator("shuho_sato", "SHUHO SATO", "Author of Give My Regards to Black Jack (ブラックジャックによろしく). The series is free for secondary use under Sato Manga Works' terms: densho810.com/free", 200);
  const zips = Array.from({ length: 13 }, (_, i) => path.join(dir, `enbj${String(i + 1).padStart(3, "0")}.zip`));
  let sid = 0;
  for (let v = 1; v <= 13; v++) {
    const zip = zips[v - 1];
    if (sid && hasChapter(sid, "volume", v)) { console.log(`Black Jack vol ${v}: already imported`); continue; }
    if (!fs.existsSync(zip) || !fs.existsSync(`${zip}.done`) && v > 1) { console.log(`Black Jack vol ${v}: ${zip} not downloaded yet, skipping`); continue; }
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `bj${v}-`));
    try {
      execFileSync("unzip", ["-q", "-o", zip, "-d", work]);
      const pdf = fs.readdirSync(work).find((f) => /\.pdf$/i.test(f));
      if (!pdf) throw new Error("no PDF in archive");
      execFileSync("pdfimages", ["-j", path.join(work, pdf), path.join(work, "p")]);
      fs.rmSync(path.join(work, pdf));
      const files = fs.readdirSync(work).filter((f) => /^p-\d+\.jpg$/.test(f)).sort();
      if (!sid) sid = ensureSeries({
        slug: "give-my-regards-to-black-jack", title: "Give My Regards to Black Jack", type: "manga", status: "completed", year: 2002, creatorId: uid,
        genres: ["Drama", "Medical", "Psychological", "Slice of Life"],
        synopsis: "Eijiro Saito is a newly graduated intern at a top university hospital, earning almost nothing and learning fast that medicine is not what he was taught. Rotating from surgery to cardiology, the NICU, oncology and psychiatry, he keeps asking what a doctor owes the patient in front of him, even when the system pushes back. Complete in 13 volumes.",
        rights: "open", rightsNote: "Give My Regards to Black Jack, SHUHO SATO. Free secondary use under the terms of Sato Manga Works Ltd. (https://densho810.com/free/). Official English data from densho810.com.",
        cover: () => coverFrom(path.join(work, files[0]), uid),
      });
      if (hasChapter(sid, "volume", v)) { console.log(`Black Jack vol ${v}: already imported`); continue; }
      console.log(`Black Jack vol ${v}: ${files.length} pages, converting…`);
      const pages = savePages(uid, optimise(work, files), UP);
      addChapter(sid, "volume", v, "", pages, Date.parse("2026-11-18T00:00:00Z") + v * 60_000);
      console.log(`Black Jack vol ${v}: imported`);
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------- Mini Fantasy Theater
async function miniFantasyTheater() {
  const author: any = db.prepare(`SELECT id FROM users WHERE username = 'david_revoy'`).get();
  const uid = author?.id ?? ensureCreator("david_revoy", "David Revoy", "Author of Pepper&Carrot and Mini Fantasy Theater, free and open-source webcomics.", 24);
  const BASE = "https://www.peppercarrot.com";
  const get = async (u: string) => { const r = await fetch(u, { headers: { "User-Agent": "MANGASALT open-library importer" } }); if (!r.ok) throw Object.assign(new Error(`${r.status} ${u}`), { status: r.status }); return r; };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "mft-"));
  let sid = (db.prepare(`SELECT id FROM series WHERE slug = 'mini-fantasy-theater'`).get() as any)?.id ?? 0;
  try {
    for (let n = 1; n < 500; n++) {
      const id = String(n).padStart(3, "0");
      if (sid && hasChapter(sid, "regular", n)) continue;
      let html: string;
      try { html = await (await get(`${BASE}/en/miniFantasyTheater/${id}.html`)).text(); } catch (e: any) { if (e.status === 404) break; throw e; }
      const img = `${BASE}/0_sources/miniFantasyTheater/low-res/en_${id}_miniFantasyTheater.jpg`;
      let buf: Buffer;
      try { buf = Buffer.from(await (await get(img)).arrayBuffer()); } catch (e: any) { if (e.status === 404) break; throw e; }
      if (!imageExt(buf)) throw new Error(`not an image: ${img}`);
      const title = (/<title>\s*\d+\.\s*([^<]+?)\s*-\s*Pepper&amp;Carrot/i.exec(html)?.[1] ?? `Episode ${n}`).replace(/&amp;/g, "&").replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"');
      fs.writeFileSync(path.join(work, `${id}.jpg`), buf);
      if (!sid) {
        const panel = path.join(work, "cover.jpg");
        fs.writeFileSync(panel, Buffer.from(await (await get(`${BASE}/0_sources/miniFantasyTheater/low-res/panels/en_001a_miniFantasyTheater.jpg`)).arrayBuffer()));
        sid = ensureSeries({
          slug: "mini-fantasy-theater", title: "Mini Fantasy Theater", type: "comic", status: "ongoing", year: 2024, creatorId: uid,
          genres: ["Comedy", "Fantasy", "Slice of Life"],
          synopsis: "Short, funny fantasy strips from the world of Hereva, the same world as Pepper&Carrot. Adventurers, witches, fairies and one very honest dragon get into small magical trouble, one four-panel episode at a time. By David Revoy.",
          rights: "open", rightsNote: "Mini Fantasy Theater by David Revoy, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Source: https://www.peppercarrot.com/en/miniFantasyTheater/. Hosted unchanged apart from format conversion.",
          cover: () => coverFrom(panel, uid),
        });
        if (hasChapter(sid, "regular", n)) continue;
      }
      const pages = savePages(uid, optimise(work, [`${id}.jpg`], 1400), UP);
      addChapter(sid, "regular", n, title, pages, Date.parse("2026-11-18T00:00:00Z") + n * 60_000);
      console.log(`Mini Fantasy Theater ${id}: ${title}`);
      await new Promise((r) => setTimeout(r, 400)); // be gentle with peppercarrot.com
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

(async () => {
  const bj = flag("--bj");
  if (bj != null) blackJack(bj || "/tmp/bj");
  if (flag("--mft") != null) await miniFantasyTheater();
  if (bj == null && flag("--mft") == null) console.log("Usage: npm run open-library -- [--bj <dir>] [--mft]");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
