import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X, Lock, BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchChapters, sortChapters, formatNumber, parseChapterQuery } from "@/lib/chapter-search";
import { timeAgo } from "@/lib/app-context";

export type ListChapter = {
  key: string; number: number | null; title: string | null; label: string;
  publishedAt: string | null; pages: number | null; readable: boolean; href?: string; unavailableReason?: string;
};

const PAGE = 100;

export function ChapterList({ chapters, readKeys, resumeKey, emptyText, latestKnown }: { chapters: ListChapter[]; readKeys?: Set<string>; resumeKey?: string | null; emptyText?: string; latestKnown?: number | null }) {
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(PAGE);
  const dq = useDeferredValue(q);

  const results = useMemo(() => {
    const sorted = sortChapters(chapters, order);
    if (!dq.trim()) return sorted.map((c) => ({ chapter: c, kind: "all" as const }));
    return searchChapters(sorted, dq);
  }, [chapters, order, dq]);

  const parsed = parseChapterQuery(dq);
  const exactHit = results.find((r) => r.kind === "exact");
  const shown = results.slice(0, limit);

  if (!chapters.length) return <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground" data-testid="text-no-chapters">{emptyText ?? "No chapters yet."}</div>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} inputMode="search" enterKeyHint="search"
            placeholder="Chapter number or title" aria-label="Search chapters"
            className="rounded-full pl-9 pr-9" data-testid="input-chapter-search" />
          {q && <button onClick={() => setQ("")} aria-label="Clear chapter search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent" data-testid="button-clear-chapter-search"><X className="h-4 w-4" /></button>}
        </div>
        <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          aria-label={order === "asc" ? "Sorted oldest first; switch to newest first" : "Sorted newest first; switch to oldest first"} data-testid="button-chapter-sort">
          {order === "asc" ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
        </Button>
      </div>

      <p className="mb-2 px-1 text-xs text-muted-foreground" aria-live="polite" data-testid="text-chapter-count">
        {dq.trim()
          ? results.length
            ? <>{results.length} match{results.length === 1 ? "" : "es"}{parsed.number !== null && (exactHit ? <> · Chapter {formatNumber(parsed.number)} found</> : <> · no chapter numbered exactly {formatNumber(parsed.number)}</>)}</>
            : null
          : <>{chapters.length} chapter{chapters.length === 1 ? "" : "s"} · {order === "desc" ? "newest first" : "oldest first"}</>}
      </p>

      {dq.trim() && !results.length ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground" data-testid="text-no-chapter-match">
          {parsed.number !== null
            ? <>There's no chapter {formatNumber(parsed.number)} in this list. {(() => { const lo = sortChapters(chapters, "asc")[0]?.number; const hi = sortChapters(chapters, "desc")[0]?.number; return lo == null ? null : lo === hi ? <>The only chapter listed is {formatNumber(lo)}.</> : <>Chapters here run from {formatNumber(lo)} to {formatNumber(hi)}.</>; })()}{latestKnown && parsed.number !== null && parsed.number > 0 && parsed.number <= latestKnown && chapters.length < latestKnown ? <> The series has reached chapter {formatNumber(latestKnown)}, but only {chapters.length} {chapters.length === 1 ? "chapter is" : "chapters are"} in the authorised index, so chapter {formatNumber(parsed.number)} can't be listed or read here.</> : null}</>
            : <>No chapter title contains “{dq.trim()}”.</>}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/50" data-testid="list-chapters">
          {shown.map(({ chapter: c, kind }) => <Row key={c.key} c={c} read={readKeys?.has(c.key)} resume={resumeKey === c.key} highlight={kind === "exact"} />)}
        </ul>
      )}
      {results.length > limit && (
        <Button variant="ghost" className="mt-2 w-full rounded-full" onClick={() => setLimit((l) => l + PAGE * 5)} data-testid="button-more-chapters">Show more ({results.length - limit} more)</Button>
      )}
    </div>
  );
}

function Row({ c, read, resume, highlight }: { c: ListChapter; read?: boolean; resume?: boolean; highlight?: boolean }) {
  const body = (
    <div className={`flex items-center gap-3 px-4 py-3 ${highlight ? "bg-primary/10" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${read && !resume ? "text-muted-foreground" : ""}`}>
          {c.label}{c.title ? <span className="font-normal text-muted-foreground"> · {c.title}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {c.publishedAt && <span>{timeAgo(c.publishedAt)}</span>}
          {c.pages && c.readable ? <span>{c.pages} pages</span> : null}
          {resume && <span className="font-medium text-primary">Continue here</span>}
        </p>
      </div>
      {c.readable ? (
        read ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Read" /> : resume ? <PlayCircle className="h-4 w-4 shrink-0 text-primary" /> : <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid={`status-unavailable-${c.key}`} title={c.unavailableReason ?? "Not available"}>
          <Lock className="h-3 w-3" /><span className="sm:hidden">Unavailable</span><span className="hidden sm:inline">{c.unavailableReason ?? "Not available"}</span>
        </span>
      )}
    </div>
  );
  return (
    <li data-testid={`row-chapter-${c.number ?? c.key}`}>
      {c.readable && c.href ? <Link href={c.href} className="block transition hover:bg-accent/60">{body}</Link> : <div aria-disabled>{body}</div>}
    </li>
  );
}
