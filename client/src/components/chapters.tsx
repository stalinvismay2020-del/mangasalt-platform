import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search as SearchIcon, X, ArrowDownUp, Play, CheckCircle2, CalendarClock, ExternalLink, Ban, Upload, Loader2, RotateCw, ChevronLeft, ChevronRight, Clock, Coins, BookOpen } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { asset } from "@/components/shared";
import { STATUS_LABEL, STATUS_ORDER, MATCH_LABEL, chapterLabel, parseQuery, type ChapterItem, type ChapterPage, type ChapterStatus } from "@shared/chapters";

const STATUS_STYLE: Record<ChapterStatus, string> = {
  available: "bg-primary/15 text-primary",
  coming_soon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  external: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  unavailable: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  not_uploaded: "bg-muted text-muted-foreground",
};
const SORTS = [{ v: "asc", l: "Oldest first" }, { v: "desc", l: "Newest first" }, { v: "newest", l: "Recently released" }] as const;
const LANG: Record<string, string> = { en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German", id: "Indonesian", it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese", hi: "Hindi", ta: "Tamil" };
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Chapter list with server-side search, status filters, sort and paging. Only "available" chapters get a Read button. */
export function ChapterBrowser({ endpoint, worldId, onCounts, embedded = false }: { endpoint: string; worldId?: number; onCounts?: (p: ChapterPage) => void; embedded?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ChapterStatus | "">("");
  const [sort, setSort] = useState<"asc" | "desc" | "newest">("asc");
  const [lang, setLang] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 150);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => setPage(1), [dq, status, sort, lang]);
  const params = { q: dq.trim(), status, sort, lang, page: String(page), limit: "40" };
  const r = useQuery<ChapterPage>({ queryKey: [endpoint, params], placeholderData: keepPreviousData, staleTime: 60_000, retry: 2 });
  const d = r.data;
  useEffect(() => { if (d && onCounts && !params.q && !status) onCounts(d); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const typing = q.trim() !== dq.trim() || (r.isFetching && r.isPlaceholderData);
  const parsed = useMemo(() => parseQuery(dq), [dq]);
  const go = (p: number) => { setPage(p); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const summary = d ? STATUS_ORDER.filter((s) => d.counts[s] > 0) : [];

  return (
    <section id="chapters" className={embedded ? "mt-3 scroll-mt-28" : "mt-12 scroll-mt-20"} aria-labelledby="chapters-h">
      <div ref={top} className="scroll-mt-28" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="chapters-h" className={embedded ? "sr-only" : "font-display text-xl font-semibold sm:text-2xl"}>Chapters</h2>
          {d && (
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-chapter-stats">
              {d.counts.all === 0 ? "No chapters listed yet." : <>
                <span className={d.counts.available ? "font-semibold text-primary" : ""}>{d.counts.available} available to read on MANGASALT</span>
                {d.counts.all - d.counts.available > 0 && <> · {d.counts.all - d.counts.available} not readable here</>}
              </>}
            </p>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")}
            inputMode="search" enterKeyHint="search" placeholder="Chapter number or title, e.g. 59, 5.5, prologue"
            aria-label="Search chapters" className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-10 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="input-chapter-search" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear chapter search" className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-clear-chapter-search">
              {typing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {d && d.languages.length > 1 && (
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language" className="h-10 rounded-full border border-input bg-background px-3 text-sm" data-testid="select-chapter-language">
              <option value="">All languages</option>
              {d.languages.map((l) => <option key={l} value={l}>{LANG[l] ?? l.toUpperCase()}</option>)}
            </select>
          )}
          <label className="relative flex h-10 flex-1 items-center sm:flex-none">
            <ArrowDownUp className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort chapters" className="h-10 w-full appearance-none rounded-full border border-input bg-background pl-9 pr-4 text-sm" data-testid="select-chapter-sort">
              {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </label>
        </div>
      </div>
      {summary.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by availability">
          <Chip on={!status} onClick={() => setStatus("")} testid="chip-status-all">All {d!.counts.all}</Chip>
          {summary.map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? "" : s)} testid={`chip-status-${s}`}>{STATUS_LABEL[s]} {d!.counts[s]}</Chip>)}
        </div>
      )}

      {/* states */}
      {r.isLoading && <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-busy>{Array.from({ length: 6 }).map((_, k) => <div key={k} className="shimmer relative h-[68px] overflow-hidden rounded-xl bg-muted" />)}</div>}
      {r.isError && !d && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center text-sm" role="alert" data-testid="chapters-error">
          <p className="text-muted-foreground">The chapter list couldn't load. Check your connection and try again.</p>
          <button onClick={() => r.refetch()} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 font-semibold text-primary-foreground"><RotateCw className="h-3.5 w-3.5" />Try again</button>
        </div>
      )}
      {d && d.counts.all === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="chapters-none">
          <BookOpen className="mx-auto mb-2 h-6 w-6 text-primary" />
          {d.publishers.length ? `Officially published in English by ${d.publishers.slice(0, 3).join(", ")}. MANGASALT doesn't host this title.` : "MANGASALT has no chapters for this title yet. Save it to hear when an authorised edition arrives."}
        </div>
      )}
      {d && d.counts.all > 0 && d.total === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center" data-testid="chapters-empty">
          <p className="text-sm font-medium">{d.query ? <>No chapter matches “{d.query}”{status ? ` in ${STATUS_LABEL[status].toLowerCase()}` : ""}.</> : `No ${status ? STATUS_LABEL[status as ChapterStatus].toLowerCase() : ""} chapters.`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{parsed.number ? `There's no chapter ${parsed.number} listed for this title.` : "Try a chapter number, a word from the title, or prologue / extra / special."}</p>
          <div className="mt-3 flex justify-center gap-2">
            {q && <button onClick={() => setQ("")} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" data-testid="button-empty-clear">Clear search</button>}
            {status && <button onClick={() => setStatus("")} className="rounded-full border border-border px-4 py-1.5 text-sm">Show all statuses</button>}
          </div>
        </div>
      )}

      {d && d.items.length > 0 && (
        <ul className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 transition-opacity ${typing ? "opacity-60" : ""}`} data-testid="list-chapters">
          {d.items.map((c, k) => {
            const head = d.query && c.match && (k === 0 || d.items[k - 1].match !== c.match);
            return (
              <li key={c.key} className={head ? "contents" : undefined}>
                {head && <p className="col-span-full mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0" data-testid={`group-${c.match}`}>{MATCH_LABEL[c.match!]}</p>}
                <ChapterCard c={c} worldId={worldId} />
              </li>
            );
          })}
        </ul>
      )}

      {d && d.pages > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Chapter pages">
          <button disabled={d.page <= 1} onClick={() => go(d.page - 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-border px-4 text-sm disabled:opacity-40" data-testid="button-chapters-prev"><ChevronLeft className="h-4 w-4" />Previous</button>
          <span className="text-sm tabular-nums text-muted-foreground" data-testid="text-chapter-page">Page {d.page} of {d.pages} · {d.total} chapters</span>
          <button disabled={d.page >= d.pages} onClick={() => go(d.page + 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-border px-4 text-sm disabled:opacity-40" data-testid="button-chapters-next">Next<ChevronRight className="h-4 w-4" /></button>
        </nav>
      )}
    </section>
  );
}

function Chip({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid: string }) {
  return <button onClick={onClick} aria-pressed={on} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`} data-testid={testid}>{children}</button>;
}

function AccessTag({ a }: { a: ChapterItem["access"] }) {
  if (!a) return null;
  if (a === "wait") return <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300"><Clock className="h-2.5 w-2.5" />Wait-free</span>;
  if (a === "coins") return <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"><Coins className="h-2.5 w-2.5" />Paid</span>;
  return <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Free</span>;
}

export function ChapterCard({ c, worldId }: { c: ChapterItem; worldId?: number }) {
  const label = chapterLabel(c);
  const badge = <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[c.status]}`} data-testid={`status-${c.key}`}>{STATUS_LABEL[c.status]}</span>;
  const meta = (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{label}</span>{c.language !== "en" && <span className="rounded bg-muted px-1 text-[10px] font-semibold uppercase text-muted-foreground">{c.language}</span>}</span>
      {c.title && <span className="block truncate text-xs text-muted-foreground">{c.title}</span>}
    </span>
  );
  const thumb = c.status === "available" && c.thumb
    ? <img src={asset(c.thumb)} alt="" loading="lazy" decoding="async" className="h-12 w-9 shrink-0 rounded object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    : <span className={`grid h-12 w-9 shrink-0 place-items-center rounded text-xs font-bold ${STATUS_STYLE[c.status]}`} aria-hidden>{c.number ?? "·"}</span>;

  if (c.status === "available" && c.chapterId) {
    const inProgress = c.page != null && c.page > 0 && !!c.pageCount && c.page < c.pageCount - 1;
    return (
      <Link href={`/read/${c.chapterId}`} className={`flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3 transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg ${c.read && !inProgress ? "opacity-75" : ""}`} data-testid={`card-chapter-${c.key}`}>
        {thumb}
        <span className="flex min-w-0 flex-1 flex-col">{meta}<span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">{badge}{c.pageCount ? `${c.pageCount} pages` : ""}{c.releaseAt ? ` · ${fmtDate(c.releaseAt)}` : ""}</span></span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" data-testid={`button-read-${c.key}`}>
          {c.read && !inProgress ? <><CheckCircle2 className="h-3.5 w-3.5" />Read again</> : inProgress ? <><Play className="h-3.5 w-3.5 fill-current" />Page {c.page! + 1}</> : <><Play className="h-3.5 w-3.5 fill-current" />Read</>}
        </span>
      </Link>
    );
  }

  const icon = c.status === "coming_soon" ? CalendarClock : c.status === "external" ? ExternalLink : c.status === "unavailable" ? Ban : Upload;
  const Icon = icon;
  const note = c.status === "coming_soon"
    ? c.releaseAt ? `Releases ${fmtDate(c.releaseAt)}` : "Release date to be announced"
    : c.reason ?? "";
  const open = () => { if (worldId) apiRequest("POST", `/api/world/title/${worldId}/read`, { chapter: c.key.slice(1) }).catch(() => {}); };
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card/40 p-2 pr-3" data-testid={`card-chapter-${c.key}`} aria-label={`${label}: ${STATUS_LABEL[c.status]}`}>
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col">
        {meta}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">{badge}<AccessTag a={c.status === "external" ? c.access ?? null : null} />{c.releaseAt && c.status !== "coming_soon" ? fmtDate(c.releaseAt) : ""}</span>
        <span className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><Icon className="mt-0.5 h-3 w-3 shrink-0" /><span className="min-w-0 break-words">{note}</span></span>
      </span>
      {c.status === "external" && c.url && (
        <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={open} className="inline-flex shrink-0 items-center gap-1 self-center rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/60" data-testid={`link-publisher-${c.key}`} aria-label={`Open ${label} on ${c.publisher ?? "the publisher's site"} (opens a new tab)`}>
          {c.publisher ?? "Publisher"}<ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
