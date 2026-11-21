import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Star, BookOpen, Info, ExternalLink, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalog, catalogKeys, CatalogError, type TitleDetails, type ChapterIndex } from "@/lib/catalog";
import { hostedForAnilist } from "@/lib/data";
import { compact } from "@/lib/app-context";
import { formatNumber } from "@/lib/chapter-search";
import { Cover, TypeBadge, InlineError, STATUS_LABEL } from "@/components/shared";
import { ChapterList, type ListChapter } from "@/components/chapter-list";
import { SaveButton, LikeButton } from "@/components/social";
import { Discussion } from "@/components/discussion";
import NotFound from "@/pages/not-found";

const strip = (s: string | null) => (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();

export default function TitlePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [, nav] = useLocation();
  const [more, setMore] = useState(false);
  const valid = Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
  const t = useQuery({ queryKey: catalogKeys.title(id), queryFn: ({ signal }) => catalog<TitleDetails>(`/title/${id}`, {}, signal), enabled: valid, staleTime: 30 * 60_000, retry: (n, e) => !(e instanceof CatalogError && e.status === 404) && n < 2 });
  const ch = useQuery({ queryKey: catalogKeys.chapters(id), queryFn: ({ signal }) => catalog<ChapterIndex>(`/title/${id}/chapters`, { order: "asc" }, signal), enabled: valid && !!t.data, staleTime: 15 * 60_000, retry: (n, e) => !(e instanceof CatalogError && e.status === 404) && n < 1 });
  const hosted = useQuery({ queryKey: ["hosted-for", id], queryFn: () => hostedForAnilist([id]), enabled: valid });
  const link = hosted.data?.[id];

  if (!valid || (t.error instanceof CatalogError && t.error.status === 404)) return <NotFound what="title" />;
  if (t.error) return <div className="mx-auto max-w-3xl px-4 py-10"><InlineError error={t.error} onRetry={() => t.refetch()} /></div>;
  if (!t.data) return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy>
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start"><div className="shimmer relative aspect-[2/3] w-44 overflow-hidden rounded-2xl bg-muted" /><div className="w-full flex-1 space-y-3"><div className="h-9 w-2/3 rounded bg-muted" /><div className="h-4 w-1/3 rounded bg-muted" /><div className="h-24 rounded bg-muted" /></div></div>
    </div>
  );
  const d = t.data;
  const desc = strip(d.description);
  const chapters: ListChapter[] = (ch.data?.chapters ?? []).map((c) => ({
    key: c.key, number: c.number, title: c.title, label: c.label, publishedAt: c.publishedAt, pages: c.pages,
    readable: false, unavailableReason: "Not licensed on MANGASALT",
  }));
  const chErr404 = ch.error instanceof CatalogError && ch.error.status === 404;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        {d.banner ? <img src={d.banner} alt="" className="h-full w-full object-cover opacity-25" /> : d.cover ? <img src={d.cover} alt="" className="h-full w-full scale-110 object-cover opacity-15 blur-2xl" /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
        <button onClick={() => (history.length > 1 ? history.back() : nav("/"))} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back"><ArrowLeft className="h-4 w-4" />Back</button>
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-8">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-44 shrink-0 sm:w-52">
            <Cover src={d.cover} alt={`${d.title} cover`} className="aspect-[2/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 flex-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start"><TypeBadge type={d.format} />{d.status && <span className="text-xs font-medium text-muted-foreground">{STATUS_LABEL[d.status] ?? d.status}</span>}{d.year && <span className="text-xs text-muted-foreground">{d.year}</span>}</div>
            <h1 className="font-display mt-2 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl" data-testid="text-title">{d.title}</h1>
            {d.titles.native && d.titles.native !== d.title && <p className="mt-1 text-sm text-muted-foreground">{d.titles.native}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:justify-start">
              {d.score ? <span className="flex items-center gap-1 text-foreground"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{(d.score / 10).toFixed(1)}</span> : null}
              {d.popularity ? <span className="flex items-center gap-1"><Users className="h-4 w-4" />{compact(d.popularity)} followers</span> : null}
              {(d.authors.length > 0 || d.artists.length > 0) && <span>{[...new Set([...d.authors, ...d.artists])].slice(0, 3).join(", ")}</span>}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {link && <Button className="glow-primary gap-2 rounded-full" onClick={() => nav(`/series/${link.slug}`)} data-testid="button-read-hosted"><BookOpen className="h-4 w-4" />Read on MANGASALT · {link.chapters} ch.</Button>}
              <SaveButton meta={{ series_key: String(d.id), title: d.title, cover: d.cover, kind: d.format, href: `/title/${d.id}` }} />
              <LikeButton mediaId={d.id} title={d.title} cover={d.cover} kind={d.format} />
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5 md:justify-start">
              {d.genres.map((g) => <Link key={g} href={`/search/genre/${encodeURIComponent(g)}`} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium transition hover:bg-primary hover:text-primary-foreground" data-testid={`link-genre-${g}`}>{g}</Link>)}
            </div>
            {desc && (
              <div className="mt-5 text-left">
                <p className={`whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground ${more ? "" : "line-clamp-4"}`} data-testid="text-synopsis">{desc}</p>
                {desc.length > 260 && <button onClick={() => setMore(!more)} className="mt-1 text-sm font-medium text-primary" data-testid="button-synopsis-more">{more ? "Show less" : "Read more"}</button>}
              </div>
            )}
            {d.tracking.length > 0 && (
              <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:justify-start">Info:{d.tracking.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline">{l.site}<ExternalLink className="h-3 w-3" /></a>)}</p>
            )}
          </motion.div>
        </div>

        <section id="chapters" className="mt-10 scroll-mt-20" aria-labelledby="ch-title">
          <h2 id="ch-title" className="font-display mb-2 text-xl font-semibold sm:text-2xl">Chapters</h2>
          <div className="mb-4 flex gap-3 rounded-2xl border border-border bg-card/60 p-4 text-sm" data-testid="notice-availability">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              {link ? <>This title is hosted on MANGASALT. <Link href={`/series/${link.slug}`} className="font-medium text-primary hover:underline">Open the readable edition</Link>. The list below is the external chapter index.</>
                : <>MANGASALT doesn't hold a licence to show pages for this title, so chapters are listed for reference only and can't be opened. Save it to your library to hear when a licensed edition is hosted.</>}
              {ch.data?.matchTitle && ch.data.matchTitle.toLowerCase() !== d.title.toLowerCase() && <> Index matched as “{ch.data.matchTitle}”.</>}
            </p>
          </div>
          {ch.isLoading || (!ch.data && !ch.error) ? <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="shimmer relative h-14 overflow-hidden rounded-xl bg-muted" />)}</div>
            : chErr404 ? <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground" data-testid="text-no-chapters">The Dawghwa chapter index has no entry for this title.</div>
            : ch.error ? <InlineError error={ch.error} onRetry={() => ch.refetch()} title="Couldn't load the chapter list" />
            : <>
                {ch.data?.latestChapter ? <p className="mb-2 px-1 text-xs text-muted-foreground">Latest known chapter: {formatNumber(ch.data.latestChapter)}{ch.data.total < ch.data.latestChapter ? ` · ${ch.data.total} indexed` : ""}</p> : null}
                <ChapterList chapters={chapters} latestKnown={ch.data?.latestChapter ?? null} emptyText="The chapter index for this title is empty." />
              </>}
        </section>

        <div className="mt-12"><Discussion target={{ mediaId: d.id, title: d.title, cover: d.cover }} /></div>
      </div>
    </div>
  );
}
