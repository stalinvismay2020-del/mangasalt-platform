import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, Loader2, X } from "lucide-react";
import { PageHead, SeriesPoster, PosterSkeleton } from "@/components/shared";
import { useApp } from "@/lib/app-context";
import type { SeriesCard } from "@shared/schema";

const selectCls = "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function Search() {
  const { setOpenSeries } = useApp();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [type, setType] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState("match");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  const genres = useQuery<string[]>({ queryKey: ["/api/genres"] });
  const { data, isLoading, isFetching } = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: dq, type, genre, status, order }] });
  const reset = () => { setQ(""); setType(""); setGenre(""); setStatus(""); setOrder("match"); };
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead title="Search" sub="Only titles with official chapters you can read right here on MANGASALT." />
      <label className="flex h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 focus-within:ring-2 focus-within:ring-primary">
        <SearchIcon className="h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, e.g. Level Zero Hunter" autoFocus
          className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" data-testid="input-search" />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {q && <button onClick={() => setQ("")} aria-label="Clear" data-testid="button-clear-search"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]].map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} data-testid={`chip-search-type-${v || "all"}`}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${type === v ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
        <select aria-label="Genre" value={genre} onChange={(e) => setGenre(e.target.value)} className={`${selectCls} ${genre ? "border-primary" : ""}`} data-testid="select-genre">
          <option value="">All genres</option>
          {genres.data?.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} data-testid="select-status">
          <option value="">Any status</option><option value="ongoing">Releasing</option><option value="completed">Completed</option><option value="hiatus">On hiatus</option>
        </select>
        <select aria-label="Sort" value={order} onChange={(e) => setOrder(e.target.value)} className={selectCls} data-testid="select-sort">
          <option value="match">Best match</option><option value="likes">Most liked</option><option value="rating">Top rated</option><option value="latest">Latest update</option><option value="az">A–Z</option>
        </select>
      </div>
      <p className="mb-4 mt-4 text-sm text-muted-foreground" data-testid="text-result-count">{data ? `${data.length} result${data.length === 1 ? "" : "s"}` : "Searching…"}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading ? Array.from({ length: 6 }).map((_, k) => <PosterSkeleton key={k} />) : data?.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} />)}
      </div>
      {data?.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No titles match these filters. <button className="font-medium text-primary hover:underline" onClick={reset} data-testid="button-reset-filters">Reset filters</button></div>
      )}
    </div>
  );
}
