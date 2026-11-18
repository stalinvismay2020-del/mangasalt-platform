import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, Loader2, X, SlidersHorizontal, Check } from "lucide-react";
import { PageHead, SeriesPoster } from "@/components/shared";
import { SurpriseButton } from "@/components/surprise";
import { WorldPoster, PosterSkel } from "@/components/world";
import { useApp } from "@/lib/app-context";
import { apiRequest } from "@/lib/queryClient";
import type { WorldPage } from "@shared/world";
import type { SeriesCard } from "@shared/schema";

const TYPES: [string, string][] = [["", "All types"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]];
const STATUSES: [string, string][] = [["", "Any status"], ["ongoing", "Releasing"], ["completed", "Completed"], ["hiatus", "On hiatus"], ["upcoming", "Upcoming"], ["cancelled", "Cancelled"]];
const SORTS: [string, string][] = [["best", "Best rated"], ["top", "Top favourites"], ["popular", "Most popular"], ["trending", "Trending now"], ["new", "Newest"], ["chapters", "Most chapters"], ["az", "A–Z"]];
const PERIODS: [string, string][] = [["", "Any time"], ["year", "This year"], ["recent", "Last 5 years"], ["2010s", "2010s"], ["2000s", "2000s"], ["classic", "Before 2000"]];

function ChipRow({ label, id, value, options, onChange }: { label: string; id: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:w-20" id={`lbl-${id}`}>{label}</span>
      <div role="radiogroup" aria-labelledby={`lbl-${id}`} className="no-scrollbar -mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 sm:mr-0 sm:flex-wrap sm:pr-0">
        {options.map(([v, l]) => (
          <button key={v || "any"} role="radio" aria-checked={value === v} onClick={() => onChange(v)} data-testid={`chip-${id}-${v || "any"}`}
            className={`relative h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition sm:text-sm ${value === v ? "text-primary-foreground" : "glass-btn lift text-muted-foreground hover:text-foreground"}`}>
            {value === v && <motion.span layoutId={`pill-${id}`} className="absolute inset-0 rounded-full bg-primary shadow-[0_6px_18px_-6px_hsl(var(--primary))]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Search() {
  const params = useParams<{ genre?: string; type?: string }>();
  const { setOpenSeries } = useApp();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [type, setType] = useState(params.type ?? "");
  const [genres, setGenres] = useState<string[]>(params.genre ? [decodeURIComponent(params.genre)] : []);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("popular");
  const [period, setPeriod] = useState("");
  const [official, setOfficial] = useState("");
  const [showGenres, setShowGenres] = useState(!!params.genre);
  useEffect(() => { if (params.genre) { setGenres([decodeURIComponent(params.genre)]); setShowGenres(true); } }, [params.genre]);
  useEffect(() => { if (params.type) setType(params.type); }, [params.type]);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const allGenres = useQuery<string[]>({ queryKey: ["/api/world/genres"] });
  const effSort = dq && sort === "popular" ? "match" : sort;
  const filters = { q: dq, type, genres: genres.join(","), status, sort: effSort, period, official };
  const res = useInfiniteQuery<WorldPage>({
    queryKey: ["/api/world/search", filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams(Object.entries({ ...filters, page: String(pageParam) }).filter(([, v]) => v));
      return (await apiRequest("GET", `/api/world/search?${qs}`)).json();
    },
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
  });
  const local = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: dq, order: "match", type, genre: genres[0] ?? "", status: ["ongoing", "completed"].includes(status) ? status : "" }], enabled: dq.length > 1 || genres.length > 0 });
  const items = res.data?.pages.flatMap((p) => p.items) ?? [];
  const total = res.data?.pages[0]?.total ?? 0;

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && res.hasNextPage && !res.isFetchingNextPage) res.fetchNextPage(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [res.hasNextPage, res.isFetchingNextPage, items.length]);

  const toggleGenre = (g: string) => setGenres((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));
  const reset = () => { setQ(""); setType(""); setGenres([]); setStatus(""); setSort("popular"); setPeriod(""); setOfficial(""); };
  const active = [type, status, period, official, sort !== "popular" ? sort : ""].filter(Boolean).length + genres.length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3"><PageHead title="Search" sub="Every manga, manhwa and manhua in the catalogue. Chapters are readable here only when MANGASALT hosts an authorised copy." /><SurpriseButton type={type || undefined} className="mt-1 hidden shrink-0 sm:inline-flex" /></div>
      <label className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40">
        <SearchIcon className="h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search One Piece, Solo Leveling, Omniscient Reader…"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" data-testid="input-search" />
        {res.isFetching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {q && <button onClick={() => setQ("")} aria-label="Clear" data-testid="button-clear-search"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </label>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-nav mt-3 space-y-2.5 rounded-2xl p-3 sm:p-4" data-testid="panel-filters">
        <ChipRow label="Type" id="type" value={type} options={TYPES} onChange={setType} />
        <ChipRow label="Status" id="status" value={status} options={STATUSES} onChange={setStatus} />
        <ChipRow label="Sort" id="sort" value={sort} options={SORTS} onChange={setSort} />
        <ChipRow label="Released" id="period" value={period} options={PERIODS} onChange={setPeriod} />
        <ChipRow label="Edition" id="official" value={official} options={[["", "All titles"], ["1", "Official English only"]]} onChange={setOfficial} />
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:w-20">Genres</span>
          <button onClick={() => setShowGenres(!showGenres)} aria-expanded={showGenres} className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium sm:text-sm ${genres.length ? "border border-primary bg-primary/15 text-primary" : "glass-btn lift text-muted-foreground hover:text-foreground"}`} data-testid="button-toggle-genres">
            <SlidersHorizontal className="h-3.5 w-3.5" />{genres.length ? `${genres.length} selected` : "Choose genres"}
          </button>
          {active > 0 && <button onClick={reset} className="ml-auto text-xs font-medium text-primary hover:underline" data-testid="button-clear-filters">Clear all ({active})</button>}
        </div>
        {dq && sort === "popular" && <p className="pl-[76px] text-[11px] text-muted-foreground sm:pl-[92px]">Showing best matches for “{dq}”. Pick a sort to change the order.</p>}
      </motion.div>

      <AnimatePresence initial={false}>
        {showGenres && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap gap-2 pt-3">
              {allGenres.data?.map((g) => {
                const on = genres.includes(g);
                return (
                  <motion.button key={g} whileTap={{ scale: 0.92 }} onClick={() => toggleGenre(g)} data-testid={`chip-genre-${g}`}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                    {on && <Check className="h-3 w-3" />}{g}
                  </motion.button>
                );
              })}
              {genres.length > 0 && <button onClick={() => setGenres([])} className="px-2 text-xs font-medium text-primary">Clear genres</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {local.data && local.data.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-emerald-500">Fully hosted on MANGASALT</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{local.data.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} size="sm" />)}</div>
        </div>
      )}

      <p className="mb-4 mt-6 text-sm text-muted-foreground" data-testid="text-result-count">
        {res.isLoading ? "Searching…" : `${items.length.toLocaleString()}${res.hasNextPage ? "+" : ""} ${official ? "official English " : ""}title${items.length === 1 ? "" : "s"}${genres.length ? ` in ${genres.join(" + ")}` : ""}`}
      </p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6">
        {res.isLoading ? Array.from({ length: 12 }).map((_, k) => <PosterSkel key={k} size="sm" />)
          : items.map((m, k) => <WorldPoster key={`${m.id}-${k}`} m={m} index={k % 18} size="sm" />)}
        {res.isFetchingNextPage && Array.from({ length: 6 }).map((_, k) => <PosterSkel key={`n${k}`} size="sm" />)}
      </div>
      <div ref={sentinel} className="h-4" />
      {res.isError && <p className="py-10 text-center text-sm text-muted-foreground">The catalogue is busy right now. <button className="font-medium text-primary" onClick={() => res.refetch()}>Try again</button></p>}
      {!res.isLoading && !res.isError && items.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No titles match these filters. <button className="font-medium text-primary hover:underline" onClick={reset} data-testid="button-reset-filters">Reset filters</button></div>
      )}
    </div>
  );
}
