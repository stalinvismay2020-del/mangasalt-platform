// Chapter search: numbers are matched as numbers, titles as text.
//
//  "10"           → chapter 10 first (exact), then chapters whose number starts with 10 (100–109, 1000…)
//  "10.5"         → chapter 10.5 exactly (and 10.5x prefixes)
//  "ch 10", "#10", "chapter 10", "ep. 10" → treated as the number 10
//  "romance dawn" → case/whitespace-insensitive title match
//  Mixed input such as "10 romance" matches number OR title text.

export type SearchableChapter = { number: number | null; title?: string | null; label?: string | null };

export type ChapterMatch<T> = { chapter: T; kind: "exact" | "prefix" | "title" };

const NUM_RE = /^(?:(?:ch(?:apter)?|ep(?:isode)?|no)\.?\s*|#\s*)?(\d+(?:[.,]\d+)?)\s*$/i;

export function normalizeText(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’'`]/g, "").replace(/[^\p{L}\p{N}.]+/gu, " ").trim();
}

/** Canonical display string for a chapter number: 10 → "10", 10.50 → "10.5". */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

export function parseChapterQuery(q: string): { number: number | null; digits: string | null; text: string } {
  const trimmed = q.replace(/\s+/g, " ").trim();
  const m = trimmed.match(NUM_RE);
  if (m) {
    const digits = m[1].replace(",", ".");
    return { number: Number(digits), digits: digits.replace(/^0+(?=\d)/, ""), text: normalizeText(trimmed) };
  }
  return { number: null, digits: null, text: normalizeText(trimmed) };
}

export function searchChapters<T extends SearchableChapter>(chapters: T[], query: string): ChapterMatch<T>[] {
  const q = parseChapterQuery(query);
  if (!q.text && q.number === null) return chapters.map((chapter) => ({ chapter, kind: "title" as const }));
  const exact: ChapterMatch<T>[] = [], prefix: ChapterMatch<T>[] = [], title: ChapterMatch<T>[] = [];
  for (const c of chapters) {
    const n = c.number;
    if (q.number !== null && n !== null && Math.abs(n - q.number) < 1e-9) { exact.push({ chapter: c, kind: "exact" }); continue; }
    if (q.digits !== null && n !== null) {
      const s = formatNumber(n);
      if (s.startsWith(q.digits) && s !== q.digits) { prefix.push({ chapter: c, kind: "prefix" }); continue; }
    }
    if (q.text) {
      const hay = normalizeText(`${c.title ?? ""} ${c.label ?? ""}`);
      // every word of the query must appear (order-free), so "dawn romance" also works
      const words = q.text.split(" ").filter(Boolean);
      if (words.length && words.every((w) => hay.includes(w)) && q.number === null) title.push({ chapter: c, kind: "title" });
      else if (q.number !== null && c.title && normalizeText(c.title).includes(q.text)) title.push({ chapter: c, kind: "title" });
    }
  }
  return [...exact, ...prefix, ...title];
}

export function sortChapters<T extends SearchableChapter>(list: T[], order: "asc" | "desc"): T[] {
  const dir = order === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.number === null && b.number === null) return 0;
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    return (a.number - b.number) * dir;
  });
}
