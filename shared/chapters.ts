// Chapter model shared by the server (search, paging) and the client (cards, labels).
// Every chapter has one honest status. Only "available" chapters can be opened in MANGASALT.

export type ChapterStatus = "available" | "coming_soon" | "external" | "unavailable" | "not_uploaded";
export type ChapterKind = "regular" | "prologue" | "side" | "extra" | "special" | "oneshot";
export const CHAPTER_KINDS: ChapterKind[] = ["regular", "prologue", "side", "extra", "special", "oneshot"];
export const STATUS_ORDER: ChapterStatus[] = ["available", "coming_soon", "external", "unavailable", "not_uploaded"];
export const STATUS_LABEL: Record<ChapterStatus, string> = {
  available: "Available to read",
  coming_soon: "Coming soon",
  external: "Licensed externally",
  unavailable: "Unavailable",
  not_uploaded: "Not yet uploaded",
};
export const KIND_LABEL: Record<ChapterKind, string> = {
  regular: "Chapter", prologue: "Prologue", side: "Side story", extra: "Extra", special: "Special", oneshot: "Oneshot",
};

export type ChapterMatch = "exact" | "related" | "kind" | "title" | "prefix";
export const MATCH_LABEL: Record<ChapterMatch, string> = {
  exact: "Exact match", related: "Parts of this chapter", kind: "Matching chapter type", title: "Title matches", prefix: "Other chapter numbers",
};

export type ChapterItem = {
  key: string;
  /** chapter number as written, e.g. "5", "5.5"; null for unnumbered extras / oneshots */
  number: string | null;
  num: number | null;
  kind: ChapterKind;
  title: string | null;
  language: string;
  releaseAt: number | null;
  status: ChapterStatus;
  /** human explanation for non-available statuses */
  reason?: string | null;
  publisher?: string | null;
  /** only set for verified official publisher pages */
  url?: string | null;
  access?: "free" | "wait" | "coins" | null;
  /** hosted chapter id (available / coming soon) */
  chapterId?: number;
  pageCount?: number;
  thumb?: string | null;
  read?: boolean;
  /** last page reached (0-based) when partly read */
  page?: number | null;
  match?: ChapterMatch;
};

export type ChapterPage = {
  items: ChapterItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  counts: Record<ChapterStatus | "all", number>;
  query: string;
  /** true when the query is a chapter number and that exact chapter exists */
  exact: boolean;
  languages: string[];
  publishers: string[];
  catalogueCount: number | null;
  hosted: { slug: string; title: string } | null;
};

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function chapterLabel(c: Pick<ChapterItem, "kind" | "number">): string {
  if (c.kind === "regular") return c.number != null ? `Chapter ${c.number}` : "Chapter";
  return c.number != null && c.kind !== "oneshot" ? `${KIND_LABEL[c.kind]} ${c.number}` : KIND_LABEL[c.kind];
}

/** Guess the kind of an externally indexed chapter from its number / title. */
export function inferKind(number: string | null, title: string | null): ChapterKind {
  const t = (title ?? "").toLowerCase();
  if (!number || /^oneshot$/i.test(number)) return /prologue/.test(t) ? "prologue" : "oneshot";
  if (/\bprologue\b/.test(t)) return "prologue";
  if (/\bside ?stor(y|ies)\b/.test(t)) return "side";
  if (/\b(extra|bonus|omake)\b/.test(t)) return "extra";
  if (/\bspecial\b/.test(t)) return "special";
  return "regular";
}

const KIND_WORDS: [RegExp, ChapterKind][] = [
  [/^prolog(ue)?$/, "prologue"], [/^side( ?stor(y|ies))?$/, "side"], [/^(extras?|bonus|omake)$/, "extra"],
  [/^specials?$/, "special"], [/^(one ?-?shot|oneshot)$/, "oneshot"],
];
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();

export type ParsedQuery = { raw: string; text: string; number: string | null; kind: ChapterKind | null };
export function parseQuery(q: string): ParsedQuery {
  const raw = (q ?? "").slice(0, 120);
  const text = norm(raw);
  // "ch 5", "chapter 5", "ep. 5", "#5", "no.5", "5 9" (spaces ignored) -> 5 / 59
  const stripped = raw.toLowerCase().replace(/^\s*(chapters?|chap|ch|episodes?|ep|no|#)\s*\.?\s*#?/, "").replace(/\s+/g, "");
  const m = stripped.match(/^0*(\d+)(?:[.,](\d+))?$/);
  let number: string | null = null;
  if (m) {
    const n = Number(`${m[1] || "0"}${m[2] ? "." + m[2] : ""}`);
    number = fmtNum(n);
  }
  let kind: ChapterKind | null = null;
  for (const [re, k] of KIND_WORDS) if (re.test(text)) kind = k;
  return { raw, text, number, kind };
}

/** Rank chapters against a query. Never returns a chapter that doesn't actually match. */
export function searchChapters<T extends ChapterItem>(list: T[], q: string): { items: T[]; exact: boolean } {
  const p = parseQuery(q);
  if (!p.text && !p.number) return { items: list.map((c) => ({ ...c, match: undefined })), exact: false };
  const rank: Record<ChapterMatch, number> = { exact: 0, related: 1, kind: 2, title: 3, prefix: 4 };
  const out: T[] = [];
  const words = p.text.split(" ").filter(Boolean);
  for (const c of list) {
    let match: ChapterMatch | undefined;
    const title = norm(c.title ?? "");
    if (p.number != null) {
      const n = Number(p.number);
      const isInt = Number.isInteger(n);
      if (c.number != null && c.num === n) match = "exact";
      else if (c.number != null && c.num != null && isInt && Math.floor(c.num) === n) match = "related"; // 5.1, 5.5 for "5"
      else if (title && new RegExp(`(^| )${p.number.replace(".", "\\.")}( |$)`).test(title)) match = "title";
      else if (c.number != null && isInt && c.number.replace(/\..*$/, "").startsWith(p.number) && c.number.replace(/\..*$/, "").length > p.number.length) match = "prefix"; // 50-59 for "5", never 15
    } else {
      if (p.kind && c.kind === p.kind) match = "kind";
      if (title && title === p.text) match = "exact";
      else if (!match && title && (title.includes(p.text) || words.every((w) => title.split(" ").some((tw) => tw.startsWith(w))))) match = "title";
    }
    if (match) out.push({ ...c, match });
  }
  out.sort((a, b) => rank[a.match!] - rank[b.match!] || (a.num ?? -1) - (b.num ?? -1));
  return { items: out, exact: out.some((c) => c.match === "exact") };
}

export type ChapterSort = "asc" | "desc" | "newest";
export function sortChapters<T extends ChapterItem>(list: T[], sort: ChapterSort): T[] {
  const kindRank = (k: ChapterKind) => (k === "prologue" ? -1 : 0);
  const byNum = (a: T, b: T) => kindRank(a.kind) - kindRank(b.kind) || (a.num ?? 1e9) - (b.num ?? 1e9) || a.key.localeCompare(b.key);
  const l = [...list];
  if (sort === "desc") return l.sort((a, b) => Number(a.num == null) - Number(b.num == null) || byNum(b, a));
  if (sort === "newest") return l.sort((a, b) => (b.releaseAt ?? 0) - (a.releaseAt ?? 0) || byNum(b, a));
  return l.sort(byNum);
}

export function pageChapters(all: ChapterItem[], o: { q?: string; status?: string; sort?: string; lang?: string; page?: number; limit?: number }):
  Omit<ChapterPage, "publishers" | "catalogueCount" | "hosted"> {
  const languages = Array.from(new Set(all.map((c) => c.language))).sort();
  const scoped = o.lang && languages.includes(o.lang) ? all.filter((c) => c.language === o.lang) : all;
  const counts = { all: scoped.length } as ChapterPage["counts"];
  for (const s of STATUS_ORDER) counts[s] = scoped.filter((c) => c.status === s).length;
  const sort: ChapterSort = o.sort === "desc" || o.sort === "newest" ? o.sort : "asc";
  let list = sortChapters(scoped, sort);
  const q = (o.q ?? "").trim();
  let exact = false;
  if (q) ({ items: list, exact } = searchChapters(list, q));
  if (o.status && (STATUS_ORDER as string[]).includes(o.status)) list = list.filter((c) => c.status === o.status);
  const limit = Math.max(10, Math.min(100, o.limit ?? 50));
  const pages = Math.max(1, Math.ceil(list.length / limit));
  const page = Math.max(1, Math.min(pages, o.page ?? 1));
  return { items: list.slice((page - 1) * limit, page * limit), total: list.length, page, pages, limit, counts, query: q, exact, languages };
}
