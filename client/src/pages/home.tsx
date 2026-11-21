import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { BookOpen, Flame, Star, Trophy, Sparkles, Heart, Clock, Play, Compass, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, compact } from "@/lib/app-context";
import { catalog, catalogKeys, type BrowseResult } from "@/lib/catalog";
import { listHosted, listProgress, communityTop, progressHref } from "@/lib/data";
import { pageUrl } from "@/lib/supabase";
import { Rail, fromCatalog, fromHosted, Cover, InlineError, EmptyBox, type PosterItem } from "@/components/shared";

const rise = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } };

function useBrowse(params: Record<string, string | number>) {
  return useQuery({ queryKey: catalogKeys.browse(params), queryFn: ({ signal }) => catalog<BrowseResult>("/browse", params, signal), staleTime: 10 * 60_000 });
}

function Hero() {
  const [, nav] = useLocation();
  const hosted = useQuery({ queryKey: ["hosted", "home"], queryFn: () => listHosted({ sort: "popular", limit: 12 }) });
  const trending = useBrowse({ sort: "trending", limit: 24 });
  const lead = hosted.data?.[0];
  const stack = (trending.data?.items ?? []).filter((m) => m.cover).slice(0, 3);
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 60% at 75% 30%, hsl(var(--primary) / .22), transparent 70%)" }} />
      <div className="grain absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-6 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:pb-14 md:pt-12">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }} className="min-w-0">
          <motion.p variants={rise} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><ShieldCheck className="h-3.5 w-3.5" />Read legally, read here</motion.p>
          <motion.h1 variants={rise} className="font-display mt-3 text-balance text-[clamp(2.2rem,1.3rem+3.6vw,4.2rem)] font-bold leading-[0.97] tracking-tight">
            Your manga, manhwa and webcomics, <span className="text-primary">all in one reader.</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-4 max-w-xl leading-relaxed text-foreground/75">
            Discover titles from the worldwide catalogue, follow what you love, and read series hosted on MANGASALT by their creators and open-licence publishers. Your library, history and progress sync to your account.
          </motion.p>
          <motion.div variants={rise} className="mt-6 flex flex-wrap gap-2">
            {lead ? (
              <Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/series/${lead.slug}`)} data-testid="button-hero-read"><BookOpen className="h-4 w-4" />Read {lead.title}</Button>
            ) : (
              <Button size="lg" className="gap-2 rounded-full px-6" onClick={() => nav("/trending")} data-testid="button-hero-trending"><Flame className="h-4 w-4" />See what's trending</Button>
            )}
            <Button size="lg" variant="outline" className="gap-2 rounded-full px-6" onClick={() => nav("/search")} data-testid="button-hero-browse"><Compass className="h-4 w-4" />Browse catalogue</Button>
          </motion.div>
        </motion.div>
        <div className="relative mx-auto h-[280px] w-[200px] sm:h-[360px] sm:w-[250px]" aria-hidden={!lead}>
          {lead ? (
            <Link href={`/series/${lead.slug}`} className="absolute inset-0 z-10 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-[0_30px_90px_-20px_hsl(var(--primary))]" data-testid="link-hero-cover">
              <Cover src={pageUrl(lead.cover_path)} alt={`${lead.title} cover`} className="h-full w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Readable on MANGASALT</span>
            </Link>
          ) : hosted.isLoading ? <div className="shimmer absolute inset-0 overflow-hidden rounded-2xl bg-muted" /> : null}
          {stack.map((m, i) => (
            <motion.div key={m.id} className="absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-white/10"
              initial={{ opacity: 0 }} animate={{ opacity: 0.45 - i * 0.1, x: (i + 1) * 26, y: -(i + 1) * 8, rotate: (i + 1) * 5, scale: 1 - (i + 1) * 0.07 }} transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 140, damping: 20 }}
              style={{ zIndex: 5 - i }}>
              <Cover src={m.cover} alt="" className="h-full w-full object-cover" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContinueReading() {
  const { user } = useApp();
  const q = useQuery({ queryKey: ["progress", user?.id], queryFn: () => listProgress(user!.id, 12), enabled: !!user });
  if (!user) return null;
  const rows = (q.data ?? []).map((p) => ({ ...p, to: progressHref(p) })).filter((p) => p.to);
  if (q.isLoading) return <section className="mt-8"><div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" /></section>;
  if (q.error) return <section className="mt-8"><InlineError error={q.error} onRetry={() => q.refetch()} title="Couldn't load your reading progress" /></section>;
  if (!rows.length) return null;
  return (
    <section className="mt-8" aria-labelledby="cont">
      <h2 id="cont" className="font-display mb-3 flex items-center gap-2 text-xl font-semibold tracking-tight"><Clock className="h-5 w-5 text-primary" />Continue reading</h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {rows.map((p) => {
          const pct = p.total_pages ? Math.round(((p.page + 1) / p.total_pages) * 100) : 0;
          return (
            <Link key={p.series_key} href={p.to!} className="group flex w-[270px] shrink-0 gap-3 rounded-2xl border border-border bg-card/60 p-2.5 hover:border-primary/50" data-testid={`link-continue-${p.series_key}`}>
              <Cover src={p.cover} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-semibold group-hover:text-primary">{p.series_title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.chapter_label} · page {p.page + 1} of {p.total_pages}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary"><Play className="h-3 w-3 fill-current" />Resume</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const hosted = useQuery({ queryKey: ["hosted", "home"], queryFn: () => listHosted({ sort: "popular", limit: 12 }) });
  const trending = useBrowse({ sort: "trending", limit: 24 });
  const top = useBrowse({ sort: "score", limit: 24 });
  const manhwa = useBrowse({ sort: "popularity", format: "manhwa", limit: 24 });
  const community = useQuery({ queryKey: ["community-top"], queryFn: () => communityTop(12) });
  const communityItems: PosterItem[] = (community.data ?? []).map((c) => ({ href: `/title/${c.media_id}`, id: `c${c.media_id}`, title: c.title, cover: c.cover || null, type: c.kind || null, sub: `${compact(c.likes)} like${c.likes === 1 ? "" : "s"} on MANGASALT` }));

  return (
    <div>
      <Hero />
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <ContinueReading />
        <Rail kicker="Hosted here" icon={BookOpen} title="Read on MANGASALT" items={hosted.data?.map(fromHosted)} loading={hosted.isLoading} error={hosted.error} onRetry={() => hosted.refetch()}
          action={<Link href="/search?hosted=1" className="mr-1 text-xs font-medium text-primary hover:underline" data-testid="link-all-hosted">See all</Link>} />
        <Rail kicker="This week" icon={Flame} title="Trending worldwide" ranked items={trending.data?.items.slice(0, 10).map(fromCatalog)} loading={trending.isLoading} error={trending.error} onRetry={() => trending.refetch()}
          action={<Link href="/trending" className="mr-1 text-xs font-medium text-primary hover:underline" data-testid="link-all-trending">See all</Link>} />
        {community.data && community.data.length > 0 ? (
          <Rail kicker="Community" icon={Heart} title="Most liked on MANGASALT" items={communityItems} />
        ) : community.error ? <div className="mt-9"><InlineError error={community.error} onRetry={() => community.refetch()} title="Couldn't load community picks" /></div> : null}
        <Rail kicker="All-time" icon={Trophy} title="Highest rated" items={top.data?.items.map(fromCatalog)} loading={top.isLoading} error={top.error} onRetry={() => top.refetch()} />
        <Rail kicker="Long-strip" icon={Sparkles} title="Popular manhwa" items={manhwa.data?.items.map(fromCatalog)} loading={manhwa.isLoading} error={manhwa.error} onRetry={() => manhwa.refetch()} />
        <section className="mt-10 rounded-3xl border border-border bg-card/50 p-5 sm:p-7">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><Star className="h-3.5 w-3.5" />How MANGASALT works</p>
          <div className="mt-3 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            <p><span className="font-semibold text-foreground">Catalogue.</span> Titles, covers and chapter listings come from the Dawghwa catalogue API through MANGASALT's server.</p>
            <p><span className="font-semibold text-foreground">Reading.</span> Pages are only shown where MANGASALT holds the rights: creator uploads and openly licensed works.</p>
            <p><span className="font-semibold text-foreground">Your account.</span> Library, history, likes and comments are stored in your MANGASALT account.</p>
          </div>
          {!hosted.isLoading && !hosted.data?.length && <div className="mt-4"><EmptyBox>No series are hosted yet.</EmptyBox></div>}
        </section>
      </div>
    </div>
  );
}
