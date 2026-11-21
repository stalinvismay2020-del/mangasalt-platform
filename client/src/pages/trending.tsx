import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Flame, Loader2, Crown, Star, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalog, type BrowseResult, type CatalogCard } from "@/lib/catalog";
import { PageHead, PosterGrid, InlineError, EmptyBox, fromCatalog, Cover, TypeBadge } from "@/components/shared";
import { FloatingCovers, Embers, Ticker, Float, Twinkles } from "@/components/motion";

const SORTS = [["trending", "Trending now"], ["popularity", "Most popular"], ["score", "Top rated"], ["newest", "Newest"]] as const;
const FORMATS = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]] as const;

export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={label}>
      {options.map(([v, l]) => (
        <motion.button key={v || "all"} role="tab" aria-selected={value === v} onClick={() => onChange(v)} data-testid={`tab-${label.toLowerCase().replace(/\s/g, "-")}-${v || "all"}`} whileTap={{ scale: 0.94 }}
          className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${value === v ? "border-primary text-primary-foreground" : "border-border bg-card/40 text-muted-foreground backdrop-blur hover:text-foreground"}`}>
          {value === v && <motion.span layoutId={`pill-${label}`} className="absolute inset-0 rounded-full bg-primary shadow-[0_6px_20px_-6px_hsl(var(--primary))]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
          <span className="relative">{l}</span>
        </motion.button>
      ))}
    </div>
  );
}

export function useBrowseInfinite(params: Record<string, string | undefined>, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["catalog", "browse-inf", params],
    queryFn: ({ pageParam, signal }) => catalog<BrowseResult>("/browse", { ...params, page: pageParam, limit: 30 }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function CatalogResults({ q }: { q: ReturnType<typeof useBrowseInfinite> }) {
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const seen = new Set<number>();
  const unique = items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  if (q.error && !items.length) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.isLoading && !unique.length) return <EmptyBox>No titles match these filters.</EmptyBox>;
  const attribution = q.data?.pages[0]?.attribution;
  return (
    <>
      <PosterGrid items={unique.map(fromCatalog)} loading={q.isLoading} count={18} />
      {q.error && items.length > 0 && <div className="mt-4"><InlineError error={q.error} onRetry={() => q.fetchNextPage()} title="Couldn't load more" /></div>}
      {q.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" className="rounded-full px-6" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="button-load-more">
            {q.isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</> : "Load more"}
          </Button>
        </div>
      )}
      {attribution && <p className="mt-6 text-center text-[11px] text-muted-foreground">Catalogue data: <a href={attribution.url} target="_blank" rel="noreferrer" className="underline">{attribution.name}</a> via {attribution.via}</p>}
    </>
  );
}

const MEDAL = [
  { ring: "from-amber-300 via-yellow-500 to-orange-500", text: "text-amber-400", glow: "rgba(251,191,36,.55)", label: "1st" },
  { ring: "from-slate-200 via-slate-400 to-slate-500", text: "text-slate-300", glow: "rgba(203,213,225,.45)", label: "2nd" },
  { ring: "from-orange-300 via-amber-700 to-orange-800", text: "text-orange-400", glow: "rgba(251,146,60,.45)", label: "3rd" },
];

function PodiumCard({ m, rank }: { m: CatalogCard; rank: number }) {
  const reduce = useReducedMotion();
  const md = MEDAL[rank - 1];
  const first = rank === 1;
  return (
    <motion.div initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 16, delay: first ? 0.1 : rank === 2 ? 0.25 : 0.35 }}
      className={`relative flex min-w-0 flex-col items-center ${first ? "z-10 -mt-2" : "mt-8 sm:mt-12"}`}>
      {first && (
        <motion.span aria-hidden className="absolute -top-6 z-20 sm:-top-8" animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-6, 6, -6] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
          <Crown className="h-7 w-7 fill-amber-400 text-amber-500 drop-shadow-[0_0_12px_rgba(251,191,36,.9)] sm:h-9 sm:w-9" />
        </motion.span>
      )}
      <Float amp={first ? 12 : 8} dur={first ? 4.2 : 5 + rank * 0.4} delay={rank * 0.3} className="relative w-full">
        <Link href={`/title/${m.id}`} className="group relative block" data-testid={`podium-${rank}`}>
          <div className="relative overflow-hidden rounded-2xl p-[2px]" style={{ boxShadow: `0 24px 60px -18px ${md.glow}` }}>
            <span aria-hidden className={`spin-slow absolute -inset-[60%] bg-[conic-gradient(var(--tw-gradient-stops))] ${md.ring}`} />
            <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] bg-muted">
              <Cover src={m.cover} alt={`${m.title} cover`} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" />
              <div className="shine pointer-events-none absolute inset-0" />
              {m.score ? <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />{(m.score / 10).toFixed(1)}</span> : null}
              <span className={`font-display absolute bottom-0 left-1.5 font-bold leading-none text-white [text-shadow:0_4px_18px_rgba(0,0,0,.8)] ${first ? "text-6xl sm:text-7xl" : "text-5xl sm:text-6xl"}`}>{rank}</span>
            </div>
          </div>
          {first && <Twinkles />}
        </Link>
      </Float>
      <p className={`mt-3 text-[10px] font-bold uppercase tracking-[0.18em] ${md.text}`}>{md.label}</p>
      <Link href={`/title/${m.id}`} className="mt-0.5 line-clamp-2 text-center text-xs font-semibold leading-tight hover:text-primary sm:text-sm">{m.title}</Link>
      <div className={`mt-2 w-full rounded-t-xl bg-gradient-to-b ${md.ring} opacity-25 ${first ? "h-10 sm:h-14" : rank === 2 ? "h-6 sm:h-9" : "h-4 sm:h-6"}`} />
    </motion.div>
  );
}

function Podium({ items }: { items: CatalogCard[] }) {
  const [a, b, c] = items;
  return (
    <section aria-label="Top three" className="relative mx-auto mb-8 mt-2 grid max-w-xl grid-cols-3 items-end gap-3 px-1 sm:gap-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 mx-auto h-40 w-4/5 rounded-full bg-primary/25 blur-3xl" />
      <PodiumCard m={b} rank={2} />
      <PodiumCard m={a} rank={1} />
      <PodiumCard m={c} rank={3} />
    </section>
  );
}

function RankRow({ m, rank, i }: { m: CatalogCard; rank: number; i: number }) {
  const pct = m.score ? Math.max(8, Math.min(100, m.score)) : 0;
  return (
    <motion.li initial={{ opacity: 0, x: -24, filter: "blur(6px)" }} whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.55, delay: (i % 10) * 0.04, ease: [0.16, 1, 0.3, 1] }}>
      <Link href={`/title/${m.id}`} data-testid={`rank-row-${m.id}`}
        className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-2.5 pr-3 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/80 hover:shadow-[0_16px_40px_-20px_hsl(var(--primary)/.7)] sm:gap-4 sm:p-3">
        <span className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-500 group-hover:scale-y-100" />
        <span className="font-display w-9 shrink-0 text-center text-2xl font-bold tabular-nums text-muted-foreground/70 transition-colors group-hover:text-primary sm:w-12 sm:text-3xl">{rank}</span>
        <Float amp={4} dur={4 + (i % 4) * 0.5} delay={(i % 6) * 0.35} className="shrink-0">
          <div className="h-[72px] w-12 overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10 sm:h-20 sm:w-14">
            <Cover src={m.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
          </div>
        </Float>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><TypeBadge type={m.format} /><span className="text-[11px] text-muted-foreground">{[m.year, m.status ? m.status.toLowerCase().replace(/_/g, " ") : null].filter(Boolean).join(" · ")}</span></div>
          <p className="mt-1 line-clamp-1 text-sm font-semibold transition-colors group-hover:text-primary sm:text-[15px]">{m.title}</p>
          {m.genres.length > 0 && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.genres.slice(0, 3).join(" · ")}</p>}
          {m.score ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400" initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <span className="flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{(m.score / 10).toFixed(1)}</span>
            </div>
          ) : null}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
      </Link>
    </motion.li>
  );
}

function RowSkel() {
  return <div className="flex items-center gap-3 rounded-2xl border border-border/60 p-3"><div className="h-7 w-9 rounded bg-muted" /><div className="shimmer relative h-[72px] w-12 overflow-hidden rounded-lg bg-muted" /><div className="flex-1 space-y-2"><div className="h-3.5 w-3/5 rounded bg-muted" /><div className="h-3 w-2/5 rounded bg-muted" /></div></div>;
}

export default function Trending() {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("trending");
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("");
  const q = useBrowseInfinite({ sort, format: format || undefined });
  const all = q.data?.pages.flatMap((p) => p.items) ?? [];
  const seen = new Set<number>();
  const items = all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const covers = items.map((m) => m.cover).filter((c): c is string => !!c).slice(3, 9);
  const podium = items.length >= 3 ? items.slice(0, 3) : [];
  const rest = podium.length ? items.slice(3) : items;
  const attribution = q.data?.pages[0]?.attribution;
  const sortLabel = SORTS.find(([v]) => v === sort)?.[1] ?? "Trending";
  return (
    <div className="relative isolate">
      <FloatingCovers covers={covers} className="h-[620px]" />
      <Embers count={14} className="h-[620px]" />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PageHead icon={Flame} kicker="Charts" title="Trending" sub="What readers worldwide are following right now." />
        <div className="mb-5 space-y-2.5">
          <Pills label="Sort" value={sort} options={SORTS} onChange={setSort} />
          <Pills label="Format" value={format} options={FORMATS} onChange={setFormat} />
        </div>
        {q.error && !items.length ? <InlineError error={q.error} onRetry={() => q.refetch()} />
          : !q.isLoading && !items.length ? <EmptyBox>No titles match these filters.</EmptyBox>
          : (
            <>
              {items.length > 0 && <div className="mb-6"><Ticker label={sortLabel} items={items.slice(0, 12).map((m) => ({ id: m.id, title: m.title, cover: m.cover, href: `/title/${m.id}` }))} /></div>}
              <AnimatePresence mode="wait">
                <motion.div key={sort + format} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  {q.isLoading ? (
                    <div className="mx-auto mb-8 grid max-w-xl grid-cols-3 items-end gap-3 sm:gap-6">{[1, 0, 2].map((k) => <div key={k} className={`shimmer relative aspect-[2/3] overflow-hidden rounded-2xl bg-muted ${k === 0 ? "" : "mt-10"}`} />)}</div>
                  ) : podium.length ? <Podium items={podium} /> : null}
                  <ol className="mx-auto grid max-w-4xl gap-2.5 lg:grid-cols-2" aria-label={`${sortLabel} chart`}>
                    {q.isLoading ? Array.from({ length: 8 }).map((_, i) => <li key={i}><RowSkel /></li>)
                      : rest.map((m, i) => <RankRow key={m.id} m={m} rank={i + 1 + podium.length} i={i} />)}
                  </ol>
                </motion.div>
              </AnimatePresence>
              {q.error && items.length > 0 && <div className="mt-4"><InlineError error={q.error} onRetry={() => q.fetchNextPage()} title="Couldn't load more" /></div>}
              {q.hasNextPage && (
                <div className="mt-7 flex justify-center">
                  <Button variant="outline" className="rounded-full px-6 backdrop-blur" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="button-load-more">
                    {q.isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</> : "Load more"}
                  </Button>
                </div>
              )}
              {attribution && <p className="mt-6 text-center text-[11px] text-muted-foreground">Catalogue data: <a href={attribution.url} target="_blank" rel="noreferrer" className="underline">{attribution.name}</a> via {attribution.via}</p>}
            </>
          )}
      </div>
    </div>
  );
}
