// Bulk chapter import from ZIP / CBZ archives and PDFs.
//
// Layouts understood:
//   - images at the root of the archive              -> one chapter
//   - one folder per chapter ("Chapter 12/001.jpg")  -> one chapter per folder, numbered from the folder name
//   - one or more PDFs                               -> one chapter per PDF (pages rendered to images)
// Pages are sorted naturally by file name (2.jpg before 10.jpg). Every page is checked to be a real
// WebP / JPEG / PNG image and written to uploads/u<uid>/ exactly like single-page uploads, so the
// reader, page proxy and clean-up code treat imported chapters the same as hand-made ones.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { unzipSync } from "fflate";

const run = promisify(execFile);

export const IMPORT_LIMITS = { archiveBytes: 450 * 1024 * 1024, pageBytes: 15 * 1024 * 1024, pagesPerChapter: 300, chapters: 300 };

export type ImportedPage = { data: Buffer; ext: "webp" | "jpg" | "png" };
export type ImportedChapter = { name: string; number: number | null; title: string; pages: ImportedPage[] };
export type ImportProblem = { name: string; reason: string };

const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function imageExt(b: Uint8Array): ImportedPage["ext"] | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return "webp";
  return null;
}
const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) ;
const isPdf = (b: Uint8Array) => b.length > 5 && Buffer.from(b.subarray(0, 5)).toString("latin1") === "%PDF-";

/** "Chapter 12.5 - The Exam" -> { number: 12.5, title: "The Exam" }; "Vol.03" -> 3. */
export function parseName(raw: string): { number: number | null; title: string } {
  const name = raw.replace(/\.(zip|cbz|pdf)$/i, "").replace(/[_]+/g, " ").trim();
  const kw = name.match(/\b(?:ch(?:apter)?|ep(?:isode)?|vol(?:ume)?|part|no|#)\.?\s*[-.]?\s*(\d{1,5}(?:\.\d{1,3})?)/i);
  const any = kw ?? name.match(/(\d{1,5}(?:\.\d{1,3})?)/);
  const number = any ? Number(any[1]) : null;
  let title = any ? name.replace(any[0], " ") : name;
  title = title.replace(/^[\s\-–—:.,|]+|[\s\-–—:.,|]+$/g, "").replace(/\s{2,}/g, " ");
  // a bare series prefix like "enbj" or "bj" is not a useful chapter title
  if (/^[a-z]{0,6}$/i.test(title)) title = "";
  return { number: number != null && Number.isFinite(number) ? number : null, title: title.slice(0, 120) };
}

/** Render a PDF to page images. Needs poppler (pdfimages / pdftoppm), installed on the server. */
async function pdfPages(pdf: Uint8Array, maxPages: number): Promise<ImportedPage[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-pdf-"));
  try {
    const file = path.join(dir, "in.pdf");
    fs.writeFileSync(file, pdf);
    const { stdout } = await run("pdfinfo", [file]).catch(() => { throw Object.assign(new Error("This server can't read PDFs (poppler-utils is not installed). Upload a ZIP of images instead."), { status: 415 }); });
    const pages = Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] ?? 0);
    if (!pages) throw Object.assign(new Error("That PDF has no pages"), { status: 400 });
    if (pages > maxPages) throw Object.assign(new Error(`That PDF has ${pages} pages. The limit is ${maxPages} per chapter.`), { status: 413 });
    // scanned books are one JPEG per page: extract them unchanged (lossless, fast); otherwise render
    const list = await run("pdfimages", ["-list", file]).then((r) => r.stdout.split("\n").slice(2).filter(Boolean)).catch(() => [] as string[]);
    const onePerPage = list.length === pages && list.every((l, i) => Number(l.trim().split(/\s+/)[0]) === i + 1 && / jpeg /.test(l));
    if (onePerPage) await run("pdfimages", ["-j", file, path.join(dir, "p")], { maxBuffer: 1 << 24 });
    else await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=85", "-scale-to", "2000", file, path.join(dir, "p")], { maxBuffer: 1 << 24, timeout: 15 * 60_000 });
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("p") && IMG_EXT.test(f)).sort(natural.compare);
    return files.map((f) => { const data = fs.readFileSync(path.join(dir, f)); return { data, ext: imageExt(data) ?? "jpg" }; });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Turn an uploaded file into chapters. Throws { status, message } on unusable input. */
export async function readArchive(buf: Uint8Array, fileName = "upload", maxPages = IMPORT_LIMITS.pagesPerChapter): Promise<{ chapters: ImportedChapter[]; problems: ImportProblem[] }> {
  const problems: ImportProblem[] = [];
  if (buf.length > IMPORT_LIMITS.archiveBytes) throw Object.assign(new Error("That file is too large (450 MB max). Split it into smaller archives."), { status: 413 });
  if (isPdf(buf)) {
    const p = parseName(path.basename(fileName));
    return { chapters: [{ name: path.basename(fileName), ...p, pages: await pdfPages(buf, maxPages) }], problems };
  }
  if (!isZip(buf)) throw Object.assign(new Error("Upload a ZIP, CBZ or PDF file"), { status: 415 });

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, { filter: (f) => !f.name.endsWith("/") && !/(^|\/)(__MACOSX|\.)/.test(f.name) && (IMG_EXT.test(f.name) || /\.pdf$/i.test(f.name)) && f.originalSize <= IMPORT_LIMITS.archiveBytes });
  } catch { throw Object.assign(new Error("That archive is damaged or encrypted"), { status: 400 }); }
  const names = Object.keys(files).sort(natural.compare);
  if (!names.length) throw Object.assign(new Error("No images or PDFs found in the archive"), { status: 400 });

  // drop a shared top-level folder ("My Series/Chapter 1/001.jpg" -> "Chapter 1/001.jpg")
  const split = names.map((n) => n.split("/"));
  while (split.every((s) => s.length > 1 && s[0] === split[0][0])) split.forEach((s) => s.shift());

  const groups = new Map<string, { name: string; images: string[]; pdf?: string }>();
  split.forEach((parts, i) => {
    const full = names[i];
    if (/\.pdf$/i.test(full)) { groups.set(`pdf:${full}`, { name: parts[parts.length - 1], images: [], pdf: full }); return; }
    const key = parts.length > 1 ? parts[0] : "";
    if (!groups.has(key)) groups.set(key, { name: key, images: [] });
    groups.get(key)!.images.push(full);
  });
  // loose images next to chapter folders are usually covers/credits: skip them, but say so
  if (groups.size > 1 && groups.has("")) { problems.push({ name: "(top-level images)", reason: `Skipped ${groups.get("")!.images.length} loose image(s) outside the chapter folders` }); groups.delete(""); }
  if (groups.size > IMPORT_LIMITS.chapters) throw Object.assign(new Error(`Too many chapters in one archive (max ${IMPORT_LIMITS.chapters})`), { status: 413 });

  const chapters: ImportedChapter[] = [];
  for (const g of Array.from(groups.values()).sort((a, b) => natural.compare(a.name, b.name))) {
    const label = g.name || path.basename(fileName);
    try {
      let pages: ImportedPage[];
      if (g.pdf) pages = await pdfPages(files[g.pdf], maxPages);
      else {
        pages = [];
        for (const n of g.images) {
          const data = files[n];
          const ext = imageExt(data);
          if (!ext) { problems.push({ name: `${label}/${path.basename(n)}`, reason: "Not a valid image, skipped" }); continue; }
          if (data.length > IMPORT_LIMITS.pageBytes) { problems.push({ name: `${label}/${path.basename(n)}`, reason: "Larger than 15 MB, skipped" }); continue; }
          pages.push({ data: Buffer.from(data), ext });
        }
      }
      if (!pages.length) { problems.push({ name: label, reason: "No usable pages" }); continue; }
      if (pages.length > maxPages) { problems.push({ name: label, reason: `${pages.length} pages; the limit is ${maxPages} per chapter` }); continue; }
      chapters.push({ name: label, ...parseName(label), pages });
    } catch (e: any) { problems.push({ name: label, reason: e.message ?? "Couldn't read this chapter" }); }
  }
  return { chapters, problems };
}

/** Write pages to uploads/u<uid>/ and return their stored paths (same format as /api/studio/upload). */
export function savePages(uid: number, pages: ImportedPage[], uploadsDir = path.resolve("uploads")): string[] {
  const dir = path.join(uploadsDir, `u${uid}`);
  fs.mkdirSync(dir, { recursive: true });
  return pages.map((p) => {
    const name = `${randomBytes(12).toString("hex")}.${p.ext}`;
    fs.writeFileSync(path.join(dir, name), p.data);
    return `uploads/u${uid}/${name}`;
  });
}
