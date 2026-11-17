import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, Loader2, X, SlidersHorizontal, Check } from "lucide-react";
import { PageHead, SeriesPoster } from "@/components/shared";
import { WorldPoster, PosterSkel } from "@/components/world";
import { useApp } from "@/lib/app-context";
import { apiRequest } from "@/lib/queryClient";
import type { WorldPage } from "@shared/world";
import type { SeriesCard } from "@shared/schema";

const selectCls = "h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const TYPES: [string, string][] = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]];

export default function Search() {
  const params = useParams<{ genre?: string; type?: string }>();
  const { setOpenSeries } = useApp();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [type, setType] = useState(params.type ?? "");
  const [genres, setGenres] = useState<string[]>(params.genre ? [decodeURIComponent(params.genre)] : []);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("popular");
  const [showGenres, setShowGenres] = useState(!!params.genre);
  useEffect(() => { if (params.genre) { setGenres([decodeURIComponent(params.genre)]); setShowGenres(true); } }, [params.genre]);
  useEffect(() => { if (params.type) setType(params.type); }, [params.type]);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const allGenres = useQuery<string[]>({ queryKey: ["/api/world/genres"] });
  const effSort = dq && sort === "popular" ? "match" : sort;
  const filters = { q: dq, type, genres: genres.join(","), status, sort: effSort };
  const res = useInfiniteQuery<WorldPage>({
    queryKey: ["/api/world/search", filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams(Object.entries({ ...filters, page: String(pageParam) }).filter(([, v]) => v));
      return (await apiRequest("GET", `/api/world/search?${qs}`)).json();
    },
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
  });
  const local = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: dq, order: "match" }], enabled: dq.length > 1 });
  const items = res.data?.pages.flatMap((p) => p.items) ?? [];
  const total = res.data?.pages[0]?.total ?? 0;

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && res.hasNextPage && !res.isFetchingNextPage) res.fetchNextPage(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [res.hasNextPage, res.isFetchingNextPage, items.length]);

  const toggleGenre = (g: string) => setGenres((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));
  const reset = () => { setQ(""); setType(""); setGenres([]); setStatus(""); setSort("popular"); };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead title="Search" sub="Every manga, manhwa and manhua, with official English chapters you can read in the app where the publisher allows it." />
      <label className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40">
        <SearchIcon className="h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search One Piece, Solo Leveling, Omniscient Reader…"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" data-testid="input-search" />
        {res.isFetching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {q && <button onClick={() => setQ("")} aria-label="Clear" data-testid="button-clear-search"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </label>

      <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TYPES.map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} data-testid={`chip-search-type-${v || "all"}`}
            className={`relative h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${type === v ? "text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            {type === v && <motion.span layoutId="type-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
        <button onClick={() => setShowGenres(!showGenres)} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${genres.length ? "border-primary text-primary" : "border-border bg-card text-muted-foreground"}`} data-testid="button-toggle-genres">
          <SlidersHorizontal className="h-4 w-4" />Genres{genres.length ? ` · ${genres.length}` : ""}
        </button>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls} shrink-0`} data-testid="select-status">
          <option value="">Any status</option><option value="ongoing">Releasing</option><option value="completed">Completed</option><option value="hiatus">On hiatus</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={`${selectCls} shrink-0`} data-testid="select-sort">
          <option value="popular">Most popular</option><option value="trending">Trending</option><option value="score">Top rated</option><option value="new">Newest</option><option value="chapters">Most chapters</option><option value="az">A–Z</option>
        </select>
      </div>

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
        {res.isLoading ? "Searching…" : `${total >= 5000 ? "5,000+" : total.toLocaleString()} title${total === 1 ? "" : "s"}${genres.length ? ` in ${genres.join(" + ")}` : ""}`}
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
