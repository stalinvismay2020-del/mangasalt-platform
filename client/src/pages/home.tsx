import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Flame, Star, TrendingUp, Clock, Trophy, Sparkles, Heart, BookOpen, Play, ShieldCheck, Compass, PenTool, Plus, Dices, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, TYPE_LABEL, compact } from "@/lib/app-context";
import { catalog, catalogKeys, type BrowseResult, type CatalogCard, type TitleDetails } from "@/lib/catalog";
import { listHosted, listProgress, communityTop, progressHref, type HostedSeries } from "@/lib/data";
import { pageUrl } from "@/lib/supabase";
import { Rail, fromCatalog, fromHosted, Cover, InlineError, Poster, STATUS_LABEL } from "@/components/shared";

const rise = { hide: { opacity: 0, y: 22, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }, exit: { opacity: 0, y: -10, transition: { duration: 0.2 } } };
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller", "Mecha", "Music"];
const GLOW = "#f97316";

function useBrowse(params: Record<string, string | number>) {
  return useQuery({ queryKey: catalogKeys.browse(params), queryFn: ({ signal }) => catalog<BrowseResult>("/browse", params, signal), staleTime: 10 * 60_000 });
}

/** Picks a random popular title from the catalogue (real data, random page and item). */
function SurpriseButton({ className = "" }: { className?: string }) {
  const [, nav] = useLocation();
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(0);
  const go = async () => {
    setBusy(true); setSpin((s) => s + 1);
    try {
      const page = 1 + Math.floor(Math.random() * 5);
      const r = await catalog<BrowseResult>("/browse", { sort: "popularity", page, limit: 30 });
      const pick = r.items[Math.floor(Math.random() * r.items.length)];
      if (pick) nav(`/title/${pick.id}`);
    } catch { /* stay on page; the button simply stops spinning */ } finally { setBusy(false); }
  };
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={go} disabled={busy} data-testid="button-surprise"
      className={`glass-btn inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition hover:border-primary/60 ${className}`}>
      <motion.span animate={{ rotate: spin * 360 }} transition={{ type: "spring", stiffness: 120, damping: 12 }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Dices className="h-4 w-4 text-primary" />}
      </motion.span>
      Surprise me
    </motion.button>
  );
}

function Hero({ items, error, onRetry }: { items?: CatalogCard[]; error?: unknown; onRetry: () => void }) {
  const [, nav] = useLocation();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const list = (items ?? []).filter((m) => m.cover).slice(0, 8);
  useEffect(() => {
    if (paused || list.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 6000);
    return () => clearInterval(t);
  }, [paused, list.length]);
  const s = list[i];
  const details = useQuery({ queryKey: catalogKeys.title(s?.id ?? 0), queryFn: ({ signal }) => catalog<TitleDetails>(`/title/${s!.id}`, {}, signal), enabled: !!s, staleTime: 30 * 60_000, retry: 0 });
  if (error && !s) return <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6"><InlineError error={error} onRetry={onRetry} title="Couldn't load trending titles" /></div>;
  if (!s) return <div className="mx-auto mt-4 h-[560px] max-w-6xl px-4"><div className="shimmer relative h-full overflow-hidden rounded-3xl bg-muted" /></div>;
  const d = details.data?.id === s.id ? details.data : undefined;
  const banner = d?.banner;
  const blurb = d?.description ? strip(d.description) : "";
  return (
    <section className="relative isolate overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <AnimatePresence>
        <motion.div key={`bg-${s.id}-${banner ? 1 : 0}`} className="absolute inset-0 -z-10" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
          <img src={banner || s.cover!} alt="" className={`h-full w-full object-cover ${banner ? "opacity-25" : "scale-110 opacity-20 blur-2xl"}`} />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(55% 55% at 70% 40%, ${GLOW}66, transparent 70%)` }} />
        </motion.div>
      </AnimatePresence>
      <div className="grain absolute inset-0 -z-10" />
      <HeroAmbience color={GLOW} />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-2 md:pb-16 md:pt-12">
        <motion.div className="relative mx-auto h-[300px] w-[205px] sm:h-[380px] sm:w-[255px] md:order-2 md:h-[450px] md:w-[300px]"
          animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
          {list.map((it, idx) => {
            const off = (idx - i + list.length) % list.length;
            if (off > 2) return null;
            return (
              <motion.button key={it.id} onClick={() => (off === 0 ? nav(`/title/${it.id}`) : setI(idx))} aria-label={off === 0 ? `Open ${it.title}` : `Show ${it.title}`} data-testid={`button-hero-${it.id}`}
                className="absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-white/15"
                style={{ boxShadow: off === 0 ? `0 30px 90px -18px ${GLOW}` : undefined }}
                animate={{ x: off * 28, y: -off * 8, scale: 1 - off * 0.08, opacity: off === 0 ? 1 : 0.4, rotate: off * 5, zIndex: 10 - off, filter: off ? "blur(1.5px)" : "blur(0px)" }}
                whileHover={off === 0 ? { scale: 1.03, rotate: -1 } : undefined}
                transition={{ type: "spring", stiffness: 170, damping: 22 }}>
                <img src={it.cover!} alt={`${it.title} cover`} className="h-full w-full object-cover" />
                {off === 0 && <motion.span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent" initial={{ x: "-120%" }} animate={{ x: "120%" }} transition={{ duration: 1.4, delay: 0.3 }} />}
              </motion.button>
            );
          })}
        </motion.div>
        <div className="min-w-0 text-center md:order-1 md:text-left">
          <AnimatePresence mode="wait">
            <motion.div key={s.id} initial="hide" animate="show" exit="exit" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
              <motion.p variants={rise} className="font-display text-6xl font-bold leading-none sm:text-7xl" style={{ color: "transparent", WebkitTextStroke: "2px hsl(var(--primary))" }}>#{i + 1}</motion.p>
              <motion.p variants={rise} className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary md:justify-start"><TrendingUp className="h-3.5 w-3.5" />Trending worldwide{s.format ? ` · ${TYPE_LABEL[s.format]}` : ""}</motion.p>
              <motion.h1 variants={rise} className="font-display mt-3 text-balance text-[clamp(2.1rem,1.3rem+3.4vw,4rem)] font-bold leading-[0.98] tracking-tight">{s.title}</motion.h1>
              <motion.div variants={rise} className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground md:justify-start">
                {s.score ? <span className="flex items-center gap-1 text-foreground"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{(s.score / 10).toFixed(1)}</span> : null}
                {s.year && <span>{s.year}</span>}{s.status && <span>{STATUS_LABEL[s.status] ?? s.status}</span>}<span>{s.genres.slice(0, 3).join(" · ")}</span>
              </motion.div>
              <motion.p variants={rise} className="mx-auto mt-4 line-clamp-3 min-h-[4.5rem] max-w-lg leading-relaxed text-foreground/80 md:mx-0">{blurb}</motion.p>
              <motion.div variants={rise} className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
                <Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/title/${s.id}`)} data-testid="button-hero-open"><BookOpen className="h-4 w-4" />View chapters</Button>
                <SurpriseButton />
              </motion.div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-8 flex justify-center gap-1.5 md:justify-start">
            {list.map((it, k) => (
              <button key={it.id} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={`relative h-1.5 overflow-hidden rounded-full transition-all ${k === i ? "w-10 bg-primary/30" : "w-3 bg-foreground/20"}`}>
                {k === i && !paused && <motion.span key={i} className="absolute inset-y-0 left-0 bg-primary" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 6, ease: "linear" }} />}
                {k === i && paused && <span className="absolute inset-0 bg-primary" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Soft drifting light behind the hero. */
function HeroAmbience({ color }: { color: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const dots = [12, 28, 46, 64, 82, 92];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute -left-20 top-10 h-64 w-64 rounded-full blur-3xl" style={{ background: color, opacity: 0.18 }}
        animate={{ x: [0, 40, 0], y: [0, 20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-primary blur-3xl" style={{ opacity: 0.12 }}
        animate={{ x: [0, -30, 0], y: [0, -24, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
      {dots.map((l, k) => (
        <motion.span key={k} className="absolute bottom-6 h-1 w-1 rounded-full bg-primary/70" style={{ left: `${l}%` }}
          animate={{ y: [0, -260], opacity: [0, 0.6, 0] }} transition={{ duration: 8 + k, repeat: Infinity, delay: k * 1.3, ease: "easeOut" }} />
      ))}
    </div>
  );
}

/** Fades sections in as they scroll into view. */
function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function ContinueReading() {
  const { user } = useApp();
  const q = useQuery({ queryKey: ["progress", user?.id], queryFn: () => listProgress(user!.id, 12), enabled: !!user });
  if (!user) return null;
  const rows = (q.data ?? []).map((p) => ({ ...p, to: progressHref(p) })).filter((p) => p.to);
  if (q.error) return <InlineError error={q.error} onRetry={() => q.refetch()} title="Couldn't load your reading progress" />;
  if (!rows.length) return null;
  return (
    <Reveal>
      <section>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Clock className="h-3.5 w-3.5" />Pick up where you left off</p>
        <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Continue reading</h2>
        <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          {rows.map((p, k) => (
            <motion.div key={p.series_key} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.05 }} className="shrink-0 snap-start">
              <Link href={p.to!} className="group flex w-64 items-center gap-3 rounded-2xl border border-border bg-card p-2.5 transition hover:-translate-y-0.5 hover:border-primary/50" data-testid={`link-continue-${p.series_key}`}>
                <Cover src={p.cover} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold">{p.series_title}</p><p className="mt-1 text-xs text-muted-foreground">{p.chapter_label} · page {p.page + 1} of {p.total_pages}</p></div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-110"><Play className="h-4 w-4 fill-current" /></span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

function FreeOnSalt({ s }: { s?: HostedSeries }) {
  if (!s) return null;
  const isOpen = /cc|creative/i.test(s.rights);
  return (
    <motion.section initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-card">
      {(s.banner_path || s.cover_path) && <img src={pageUrl(s.banner_path || s.cover_path) ?? undefined} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/40" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-8">
        <Cover src={pageUrl(s.cover_path)} alt={`${s.title} cover`} className="mx-auto w-32 rounded-xl shadow-2xl sm:mx-0 sm:w-36" />
        <div className="min-w-0 text-center sm:text-left">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-500 sm:justify-start"><ShieldCheck className="h-3.5 w-3.5" />Every chapter free · hosted on MANGASALT</p>
          <h2 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">{s.title}</h2>
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted-foreground">{s.synopsis}</p>
          <p className="mt-1 text-xs text-muted-foreground">by {s.author}{isOpen && s.rights ? ` · ${s.rights.toUpperCase().replace(/-/g, " ")}` : ""}</p>
          <Link href={`/series/${s.slug}`}><Button className="mt-4 gap-2 rounded-full" data-testid="button-free-hosted"><Play className="h-4 w-4 fill-current" />Read all {s.chapters} episode{s.chapters === 1 ? "" : "s"}</Button></Link>
        </div>
      </div>
    </motion.section>
  );
}

function CreatorOriginals({ items, exclude }: { items: HostedSeries[]; exclude?: string }) {
  const list = items.filter((s) => s.id !== exclude);
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><PenTool className="h-3.5 w-3.5" />Creator originals</p>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Published on MANGASALT</h2>
        </div>
        <Link href="/studio" className="text-sm font-medium text-primary" data-testid="link-home-studio">Publish yours</Link>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6">
        <Link href="/studio" className="group flex aspect-[2/3] w-32 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-center transition hover:border-primary sm:w-40">
          <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity }} className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary shadow-[0_0_30px_hsl(var(--primary)/0.35)]"><Plus className="h-5 w-5" /></motion.span>
          <span className="text-sm font-semibold">Publish your manga</span><span className="text-[11px] text-muted-foreground">Free for every creator</span>
        </Link>
        {list.map((s, k) => <div key={s.id} className="w-32 shrink-0 snap-start sm:w-40"><Poster m={fromHosted(s)} index={k} /></div>)}
      </div>
    </section>
  );
}

function GenreCloud() {
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Compass className="h-3.5 w-3.5" />Explore</p>
      <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Browse by genre</h2>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g, k) => (
          <motion.div key={g} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.02 }}>
            <Link href={`/search/genre/${encodeURIComponent(g)}`} className="block rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-primary-foreground" data-testid={`chip-genre-${g}`}>{g}</Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function MostLiked() {
  const q = useQuery({ queryKey: ["community-top"], queryFn: () => communityTop(12) });
  if (!q.data?.length) return null;
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Heart className="h-3.5 w-3.5" />Community</p>
      <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Most liked on MANGASALT</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {q.data.slice(0, 6).map((m, k) => (
          <Link key={m.media_id} href={`/title/${m.media_id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 transition hover:border-primary/50">
            <span className="font-display w-7 text-center text-xl font-bold text-primary">{k + 1}</span>
            <Cover src={m.cover} alt="" className="h-14 w-10 rounded object-cover" />
            <span className="line-clamp-1 flex-1 text-sm font-semibold">{m.title}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5 fill-primary text-primary" />{compact(m.likes)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const trending = useBrowse({ sort: "trending", limit: 24 });
  const manhwa = useBrowse({ sort: "popularity", format: "manhwa", limit: 24 });
  const manga = useBrowse({ sort: "popularity", format: "manga", limit: 24 });
  const manhua = useBrowse({ sort: "popularity", format: "manhua", limit: 24 });
  const top = useBrowse({ sort: "score", limit: 24 });
  const hosted = useQuery({ queryKey: ["hosted", "home"], queryFn: () => listHosted({ sort: "popular", limit: 12 }) });
  const lead = hosted.data?.[0];
  const rail = (q: ReturnType<typeof useBrowse>) => ({ items: q.data?.items.map(fromCatalog), loading: q.isLoading, error: q.error, onRetry: () => q.refetch() });
  return (
    <div>
      <Hero items={trending.data?.items} error={trending.error} onRetry={() => trending.refetch()} />
      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-16 sm:px-6">
        <ContinueReading />
        <Reveal><Rail kicker="Right now" icon={Flame} title="Trending worldwide" ranked {...rail(trending)} action={<Link href="/trending" className="text-sm font-medium text-primary" data-testid="link-all-trending">Charts</Link>} /></Reveal>
        <Reveal><Rail kicker="Korea" icon={Sparkles} title="Popular manhwa" {...rail(manhwa)} action={<Link href="/search/type/manhwa" className="text-sm font-medium text-primary">All</Link>} /></Reveal>
        {hosted.error ? <InlineError error={hosted.error} onRetry={() => hosted.refetch()} title="Couldn't load series hosted on MANGASALT" /> : <Reveal><FreeOnSalt s={lead} /></Reveal>}
        {hosted.data && <Reveal><CreatorOriginals items={hosted.data} exclude={lead?.id} /></Reveal>}
        <Reveal><Rail kicker="Japan" icon={BookOpen} title="Popular manga" {...rail(manga)} action={<Link href="/search/type/manga" className="text-sm font-medium text-primary">All</Link>} /></Reveal>
        <Reveal><Rail kicker="China" icon={Sparkles} title="Popular manhua" {...rail(manhua)} action={<Link href="/search/type/manhua" className="text-sm font-medium text-primary">All</Link>} /></Reveal>
        <Reveal><Rail kicker="All time" icon={Trophy} title="Top rated" {...rail(top)} /></Reveal>
        <Reveal><GenreCloud /></Reveal>
        <MostLiked />
      </div>
    </div>
  );
}
