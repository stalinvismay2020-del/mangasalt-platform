import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { BookOpen, Flame, Star, Trophy, Sparkles, Heart, Clock, Play, Compass, ShieldCheck, MessagesSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, compact } from "@/lib/app-context";
import { catalog, catalogKeys, type BrowseResult } from "@/lib/catalog";
import { listHosted, listProgress, communityTop, progressHref } from "@/lib/data";
import { pageUrl } from "@/lib/supabase";
import { FloatingCovers, Embers, Ticker, Float, Tilt, Twinkles } from "@/components/motion";
import { Rail, fromCatalog, fromHosted, Cover, InlineError, EmptyBox, type PosterItem } from "@/components/shared";

const rise = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } };

function useBrowse(params: Record<string, string | number>) {
  return useQuery({ queryKey: catalogKeys.browse(params), queryFn: ({ signal }) => catalog<BrowseResult>("/browse", params, signal), staleTime: 10 * 60_000 });
}

type Art = { key: string; href: string; cover: string | null; title: string };
const SATS = [
  { cls: "left-0 top-2 sm:-left-4", r: -10, d: 5.2, delay: 0.2 },
  { cls: "right-0 top-6 sm:-right-4", r: 9, d: 6.1, delay: 0.9 },
  { cls: "bottom-4 left-2 sm:-left-2", r: 8, d: 5.7, delay: 0.5 },
  { cls: "bottom-0 right-2 sm:-right-2", r: -8, d: 6.6, delay: 1.3 },
];

function HeroArt({ lead, leadBadge, sats, loading }: { lead?: Art; leadBadge: string; sats: Art[]; loading: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[360px] sm:h-[430px] sm:max-w-[440px]">
      <motion.div aria-hidden className="ring-conic absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl sm:h-[300px] sm:w-[300px]"
        animate={reduce ? undefined : { rotate: 360, scale: [1, 1.08, 1] }} transition={{ rotate: { duration: 18, repeat: Infinity, ease: "linear" }, scale: { duration: 6, repeat: Infinity, ease: "easeInOut" } }} />
      <motion.div aria-hidden className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-primary/30 sm:h-[390px] sm:w-[390px]"
        animate={reduce ? undefined : { rotate: -360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}>
        <span className="absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
        <span className="absolute -bottom-1 left-1/3 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,.9)]" />
      </motion.div>
      {sats.map((m, i) => {
        const p = SATS[i];
        return (
          <motion.div key={m.key} className={`absolute z-[5] w-[84px] sm:w-[104px] ${p.cls}`} initial={{ opacity: 0, scale: 0.6, rotate: p.r }} animate={{ opacity: 1, scale: 1, rotate: p.r }} transition={{ delay: 0.35 + i * 0.12, type: "spring", stiffness: 120, damping: 14 }}>
            <Float amp={12} dur={p.d} delay={p.delay} rotate={0}>
              <Link href={m.href} aria-label={m.title} className="group block overflow-hidden rounded-xl shadow-[0_18px_40px_-14px_rgba(0,0,0,.7)] ring-1 ring-white/15 transition hover:ring-primary/70" data-testid={`link-hero-sat-${i}`}>
                <Cover src={m.cover} alt="" className="aspect-[2/3] w-full object-cover transition duration-500 group-hover:scale-110" />
              </Link>
            </Float>
          </motion.div>
        );
      })}
      <div className="absolute left-1/2 top-1/2 z-10 w-[170px] -translate-x-1/2 -translate-y-1/2 sm:w-[215px]">
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 110, damping: 16, delay: 0.15 }}>
          <Float amp={14} dur={5}>
            <Tilt max={12}>
              {lead ? (
                <Link href={lead.href} className="relative block overflow-hidden rounded-2xl shadow-[0_30px_90px_-20px_hsl(var(--primary))] ring-1 ring-white/20" data-testid="link-hero-cover">
                  <Cover src={lead.cover} alt={`${lead.title} cover`} className="aspect-[2/3] w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="shine pointer-events-none absolute inset-0" />
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{leadBadge}</span>
                  <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold leading-tight text-white">{lead.title}</span>
                </Link>
              ) : loading ? <div className="shimmer relative aspect-[2/3] overflow-hidden rounded-2xl bg-muted" /> : null}
            </Tilt>
          </Float>
        </motion.div>
        {lead && <Twinkles />}
      </div>
    </div>
  );
}

function Hero() {
  const [, nav] = useLocation();
  const hosted = useQuery({ queryKey: ["hosted", "home"], queryFn: () => listHosted({ sort: "popular", limit: 12 }) });
  const trending = useBrowse({ sort: "trending", limit: 24 });
  const lead = hosted.data?.[0];
  const tItems = (trending.data?.items ?? []).filter((m) => m.cover);
  const leadArt: Art | undefined = lead ? { key: lead.id, href: `/series/${lead.slug}`, cover: pageUrl(lead.cover_path), title: lead.title }
    : tItems[0] ? { key: String(tItems[0].id), href: `/title/${tItems[0].id}`, cover: tItems[0].cover, title: tItems[0].title } : undefined;
  const sats: Art[] = tItems.slice(lead ? 0 : 1, (lead ? 0 : 1) + 4).map((m) => ({ key: String(m.id), href: `/title/${m.id}`, cover: m.cover, title: m.title }));
  const bg = tItems.slice(5, 11).map((m) => m.cover!) ;
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 60% at 75% 30%, hsl(var(--primary) / .22), transparent 70%)" }} />
      <FloatingCovers covers={bg} />
      <Embers count={16} />
      <div className="grain absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-4 px-4 pb-6 pt-6 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:gap-8 md:pb-10 md:pt-12">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="min-w-0">
          <motion.p variants={rise} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-primary backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
            <ShieldCheck className="h-3.5 w-3.5" />Read legally, read here
          </motion.p>
          <motion.h1 variants={rise} className="font-display mt-4 text-balance text-[clamp(2.2rem,1.3rem+3.6vw,4.2rem)] font-bold leading-[0.97] tracking-tight">
            Your manga, manhwa and webcomics, <span className="text-shine">all in one reader.</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-4 max-w-xl leading-relaxed text-foreground/75">
            Discover titles from the worldwide catalogue, follow what you love, and read series hosted on MANGASALT by their creators and open-licence publishers. Your library, history and progress sync to your account.
          </motion.p>
          <motion.div variants={rise} className="mt-6 flex flex-wrap gap-2">
            {lead ? (
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}><Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/series/${lead.slug}`)} data-testid="button-hero-read"><BookOpen className="h-4 w-4" />Read {lead.title}</Button></motion.div>
            ) : (
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}><Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav("/trending")} data-testid="button-hero-trending"><Flame className="h-4 w-4" />See what's trending</Button></motion.div>
            )}
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}><Button size="lg" variant="outline" className="gap-2 rounded-full bg-background/40 px-6 backdrop-blur" onClick={() => nav("/search")} data-testid="button-hero-browse"><Compass className="h-4 w-4" />Browse catalogue</Button></motion.div>
          </motion.div>
        </motion.div>
        <HeroArt lead={leadArt} leadBadge={lead ? "Read here" : "#1 trending"} sats={sats} loading={hosted.isLoading || trending.isLoading} />
      </div>
      {tItems.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-6">
          <Ticker items={tItems.slice(0, 12).map((m) => ({ id: m.id, title: m.title, cover: m.cover, href: `/title/${m.id}` }))} />
        </div>
      )}
    </section>
  );
}

function CommunityCta() {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-10 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/60 to-card/40 p-5 backdrop-blur sm:p-7">
      <Embers count={8} />
      <div className="relative flex flex-wrap items-center gap-4">
        <Float amp={6} dur={3.6} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_hsl(var(--primary))]">
          <MessagesSquare className="h-6 w-6" />
        </Float>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Community</p>
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Join the discussion</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Theories, reviews and chapter reactions from MANGASALT readers.</p>
        </div>
        <Link href="/discussion" data-testid="link-home-discussion">
          <motion.span whileHover={{ x: 3 }} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">Open discussions<ArrowRight className="h-4 w-4" /></motion.span>
        </Link>
      </div>
    </motion.section>
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
        <CommunityCta />
        <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6 }} className="mt-6 rounded-3xl border border-border bg-card/50 p-5 backdrop-blur sm:p-7">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><Star className="h-3.5 w-3.5" />How MANGASALT works</p>
          <div className="mt-3 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            <p><span className="font-semibold text-foreground">Catalogue.</span> Titles, covers and chapter listings come from the Dawghwa catalogue API through MANGASALT's server.</p>
            <p><span className="font-semibold text-foreground">Reading.</span> Pages are only shown where MANGASALT holds the rights: creator uploads and openly licensed works.</p>
            <p><span className="font-semibold text-foreground">Your account.</span> Library, history, likes and comments are stored in your MANGASALT account.</p>
          </div>
          {!hosted.isLoading && !hosted.data?.length && <div className="mt-4"><EmptyBox>No series are hosted yet.</EmptyBox></div>}
        </motion.section>
      </div>
    </div>
  );
}
