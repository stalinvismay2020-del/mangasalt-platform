import { safeDecode } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search as SearchIcon, X, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHashQuery, setHashQuery } from "@/lib/hash-query";
import { listHosted } from "@/lib/data";
import { PageHead, PosterGrid, InlineError, EmptyBox, fromHosted } from "@/components/shared";
import { Pills, useBrowseInfinite, CatalogResults } from "@/pages/trending";

const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller", "Mecha", "Music"];
const FORMATS = [["", "All formats"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]] as const;
const STATUSES = [["", "Any status"], ["ongoing", "Releasing"], ["completed", "Completed"], ["hiatus", "Hiatus"]] as const;

export default function Search({ params }: { params?: { genre?: string; type?: string } }) {
  const hq = useHashQuery();
  const [, nav] = useLocation();
  const [text, setText] = useState(hq.get("q") ?? "");
  const q = (hq.get("q") ?? "").trim();
  const genre = params?.genre ? safeDecode(params.genre) : hq.get("genre") ?? "";
  const format = (params?.type ?? hq.get("format") ?? "") as (typeof FORMATS)[number][0];
  const status = (hq.get("status") ?? "") as (typeof STATUSES)[number][0];
  const hostedOnly = hq.get("hosted") === "1";

  // Debounce typing into the URL so results update as you type.
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) setHashQuery({ q: text.trim() || null }); }, 350); return () => clearTimeout(t); }, [text]); // eslint-disable-line
  useEffect(() => { setText(hq.get("q") ?? ""); }, [hq.get("q")]); // eslint-disable-line

  const kind = format || undefined;
  const hosted = useQuery({ queryKey: ["hosted", "search", q, genre, kind], queryFn: () => listHosted({ q: q || undefined, genre: genre || undefined, kind, limit: 24 }) });
  const browse = useBrowseInfinite({ q: q || undefined, genre: genre || undefined, format: format || undefined, status: status || undefined, sort: q ? "relevance" : "popularity" }, !hostedOnly);

  const setFilter = (k: string, v: string) => {
    if (params?.genre || params?.type) { const sp = new URLSearchParams({ ...(q && { q }), ...(genre && { genre }), ...(format && { format }), ...(status && { status }) }); v ? sp.set(k, v) : sp.delete(k); nav(`/search${sp.toString() ? `?${sp}` : ""}`); return; }
    setHashQuery({ [k]: v || null });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHead icon={SearchIcon} kicker="Discover" title={genre ? `${genre}` : format ? `${FORMATS.find((f) => f[0] === format)?.[1]}` : "Search"} sub="Search the worldwide catalogue and series readable on MANGASALT." />
      <form onSubmit={(e) => { e.preventDefault(); setHashQuery({ q: text.trim() || null }); }} className="relative mb-4" role="search">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search titles, e.g. One Piece, Solo Leveling" className="h-12 rounded-full pl-11 pr-11 text-base" aria-label="Search titles" data-testid="input-search" autoFocus={!genre && !format} />
        {text && <button type="button" onClick={() => { setText(""); setHashQuery({ q: null }); }} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full hover:bg-accent" aria-label="Clear search" data-testid="button-clear-search"><X className="h-4 w-4" /></button>}
      </form>
      <div className="mb-6 space-y-2.5">
        <Pills label="Format" value={format} options={FORMATS} onChange={(v) => setFilter("format", v)} />
        <Pills label="Status" value={status} options={STATUSES} onChange={(v) => setFilter("status", v)} />
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Genres">
          {GENRES.map((g) => (
            <button key={g} onClick={() => setFilter("genre", genre === g ? "" : g)} aria-pressed={genre === g} data-testid={`chip-genre-${g}`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${genre === g ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{g}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={hostedOnly} onChange={(e) => setFilter("hosted", e.target.checked ? "1" : "")} className="accent-[hsl(var(--primary))]" data-testid="checkbox-hosted-only" />Only show series readable on MANGASALT
        </label>
      </div>

      {(hosted.data?.length || hostedOnly) ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-4 w-4 text-primary" />Readable on MANGASALT</h2>
          {hosted.error ? <InlineError error={hosted.error} onRetry={() => hosted.refetch()} /> : hosted.data && !hosted.data.length ? <EmptyBox>No hosted series match.</EmptyBox> : <PosterGrid items={hosted.data?.map(fromHosted)} loading={hosted.isLoading} count={6} />}
        </section>
      ) : null}
      {!hostedOnly && (
        <section>
          <h2 className="font-display mb-3 text-lg font-semibold">{q ? <>Catalogue results for “{q}”</> : "Catalogue"}</h2>
          <CatalogResults q={browse} />
        </section>
      )}
    </div>
  );
}
