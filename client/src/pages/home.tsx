import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Flame, Star, TrendingUp, Clock, Trophy, Sparkles, Heart, BookOpen, Play, ShieldCheck, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, TYPE_LABEL, compact } from "@/lib/app-context";
import { asset } from "@/components/shared";
import { WorldRail, STATUS_LABEL } from "@/components/world";
import type { WorldHome, WorldCard, WorldShelfItem } from "@shared/world";
import type { SeriesCard } from "@shared/schema";

const rise = { hide: { opacity: 0, y: 22, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }, exit: { opacity: 0, y: -10, transition: { duration: 0.2 } } };
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function Hero({ items }: { items?: WorldCard[] }) {
  const [, nav] = useLocation();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const list = [...(items ?? [])].sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  useEffect(() => {
    if (paused || list.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 6000);
    return () => clearInterval(t);
  }, [paused, list.length]);
  const s = list[i];
  if (!s) return <div className="mx-auto mt-4 h-[560px] max-w-6xl px-4"><div className="shimmer relative h-full overflow-hidden rounded-3xl bg-muted" /></div>;
  const glow = s.color ?? "#f97316";
  return (
    <section className="relative isolate overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <AnimatePresence>
        <motion.div key={`bg-${s.id}`} className="absolute inset-0 -z-10" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
          {s.banner && <img src={s.banner} alt="" className="h-full w-full object-cover opacity-25" />}
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(55% 55% at 70% 40%, ${glow}66, transparent 70%)` }} />
        </motion.div>
      </AnimatePresence>
      <div className="grain absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-2 md:pb-16 md:pt-12">
        <div className="relative mx-auto h-[300px] w-[205px] sm:h-[380px] sm:w-[255px] md:order-2 md:h-[450px] md:w-[300px]">
          {list.map((it, idx) => {
            const off = (idx - i + list.length) % list.length;
            if (off > 2) return null;
            return (
              <motion.button key={it.id} onClick={() => (off === 0 ? nav(`/title/${it.id}`) : setI(idx))} aria-label={off === 0 ? `Open ${it.title}` : `Show ${it.title}`} data-testid={`button-hero-${it.id}`}
                className="absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-white/15"
                style={{ boxShadow: off === 0 ? `0 30px 90px -18px ${glow}` : undefined }}
                animate={{ x: off * 28, y: -off * 8, scale: 1 - off * 0.08, opacity: off === 0 ? 1 : 0.4, rotate: off * 5, zIndex: 10 - off, filter: off ? "blur(1.5px)" : "blur(0px)" }}
                whileHover={off === 0 ? { scale: 1.03, rotate: -1 } : undefined}
                transition={{ type: "spring", stiffness: 170, damping: 22 }}>
                <img src={it.cover} alt={`${it.title} cover`} className="h-full w-full object-cover" />
                {off === 0 && <motion.span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent" initial={{ x: "-120%" }} animate={{ x: "120%" }} transition={{ duration: 1.4, delay: 0.3 }} />}
              </motion.button>
            );
          })}
        </div>
        <div className="min-w-0 text-center md:order-1 md:text-left">
          <AnimatePresence mode="wait">
            <motion.div key={s.id} initial="hide" animate="show" exit="exit" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
              <motion.p variants={rise} className="font-display text-6xl font-bold leading-none sm:text-7xl" style={{ color: "transparent", WebkitTextStroke: "2px hsl(var(--primary))" }}>#{i + 1}</motion.p>
              <motion.p variants={rise} className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary md:justify-start"><TrendingUp className="h-3.5 w-3.5" />Trending worldwide · {TYPE_LABEL[s.type]}</motion.p>
              <motion.h1 variants={rise} className="font-display mt-3 text-balance text-[clamp(2.1rem,1.3rem+3.4vw,4rem)] font-bold leading-[0.98] tracking-tight">{s.title}</motion.h1>
              <motion.div variants={rise} className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground md:justify-start">
                {s.score ? <span className="flex items-center gap-1 text-foreground"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{(s.score / 10).toFixed(1)}</span> : null}
                {s.year && <span>{s.year}</span>}<span>{STATUS_LABEL[s.status]}</span><span>{s.genres.slice(0, 3).join(" · ")}</span>
              </motion.div>
              <motion.p variants={rise} className="mx-auto mt-4 line-clamp-3 max-w-lg leading-relaxed text-foreground/80 md:mx-0">{strip(s.blurb)}</motion.p>
              <motion.div variants={rise} className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
                <Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/title/${s.id}`)} data-testid="button-hero-open"><BookOpen className="h-4 w-4" />View chapters</Button>
                <Button size="lg" variant="outline" className="rounded-full" onClick={() => nav("/trending")} data-testid="button-hero-charts">See charts</Button>
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

function ContinueReading({ items }: { items: WorldShelfItem[] }) {
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Clock className="h-3.5 w-3.5" />Pick up where you left off</p>
      <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Continue reading</h2>
      <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map((m, k) => (
          <motion.div key={m.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.05 }} className="shrink-0 snap-start">
            <Link href={m.chapter ? `/mp/${m.id}/${encodeURIComponent(m.chapter)}` : `/title/${m.id}`} className="group flex w-64 items-center gap-3 rounded-2xl border border-border bg-card p-2.5 transition hover:-translate-y-0.5 hover:border-primary/50" data-testid={`link-continue-${m.id}`}>
              <img src={m.cover} alt="" className="h-20 w-14 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold">{m.title}</p><p className="mt-1 text-xs text-muted-foreground">{m.chapter ? `Chapter ${m.chapter}` : "Not started"}</p></div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-110"><Play className="h-4 w-4 fill-current" /></span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FreeOnSalt({ items }: { items: SeriesCard[] }) {
  const p = items[0];
  if (!p) return null;
  return (
    <motion.section initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <img src={asset("/comics/pepper/banner.webp")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/40" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-8">
        <img src={asset(p.cover)} alt={`${p.title} cover`} className="mx-auto w-32 rounded-xl shadow-2xl sm:mx-0 sm:w-36" />
        <div className="min-w-0 text-center sm:text-left">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-500 sm:justify-start"><ShieldCheck className="h-3.5 w-3.5" />Every chapter free · hosted on MANGASALT</p>
          <h2 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">{p.title}</h2>
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted-foreground">{p.synopsis}</p>
          <p className="mt-1 text-xs text-muted-foreground">by {p.creator.displayName} · CC BY 4.0</p>
          <Link href={`/series/${p.slug}`}><Button className="mt-4 gap-2 rounded-full" data-testid="button-free-pepper"><Play className="h-4 w-4 fill-current" />Read all {p.chapterCount} episodes</Button></Link>
        </div>
      </div>
    </motion.section>
  );
}

function GenreCloud() {
  const { data } = useQuery<string[]>({ queryKey: ["/api/world/genres"] });
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Compass className="h-3.5 w-3.5" />Explore</p>
      <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Browse by genre</h2>
      <div className="flex flex-wrap gap-2">
        {(data ?? []).map((g, k) => (
          <motion.div key={g} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.02 }}>
            <Link href={`/search/genre/${encodeURIComponent(g)}`} className="block rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-primary-foreground" data-testid={`chip-genre-${g}`}>{g}</Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function MostLiked() {
  const { data } = useQuery<{ id: number; title: string; cover: string; likes: number }[]>({ queryKey: ["/api/world/community"] });
  if (!data?.length) return null;
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Heart className="h-3.5 w-3.5" />Community</p>
      <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">Most liked on MANGASALT</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.slice(0, 6).map((m, k) => (
          <Link key={m.id} href={`/title/${m.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 transition hover:border-primary/50">
            <span className="font-display w-7 text-center text-xl font-bold text-primary">{k + 1}</span>
            <img src={m.cover} alt="" className="h-14 w-10 rounded object-cover" />
            <span className="line-clamp-1 flex-1 text-sm font-semibold">{m.title}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5 fill-primary text-primary" />{compact(m.likes)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { user } = useApp();
  const { data, isLoading } = useQuery<WorldHome>({ queryKey: ["/api/world/home"] });
  const mine = useQuery<{ saved: WorldShelfItem[]; reading: WorldShelfItem[] }>({ queryKey: ["/api/me/world"], enabled: !!user });
  const local = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { order: "trending" }] });
  return (
    <div>
      <Hero items={data?.trending} />
      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-16 sm:px-6">
        {user && mine.data?.reading.length ? <ContinueReading items={mine.data.reading} /> : null}
        <WorldRail kicker="Right now" icon={Flame} title="Trending worldwide" items={data?.trending} loading={isLoading} ranked action={<Link href="/trending" className="text-sm font-medium text-primary">Charts</Link>} />
        <WorldRail kicker="Korea" icon={Sparkles} title="Popular manhwa" items={data?.manhwa} loading={isLoading} action={<Link href="/search/type/manhwa" className="text-sm font-medium text-primary">All</Link>} />
        <FreeOnSalt items={local.data ?? []} />
        <WorldRail kicker="Japan" icon={BookOpen} title="Popular manga" items={data?.manga} loading={isLoading} action={<Link href="/search/type/manga" className="text-sm font-medium text-primary">All</Link>} />
        <WorldRail kicker="China" icon={Sparkles} title="Popular manhua" items={data?.manhua} loading={isLoading} action={<Link href="/search/type/manhua" className="text-sm font-medium text-primary">All</Link>} />
        <WorldRail kicker="All time" icon={Trophy} title="Top rated" items={data?.top} loading={isLoading} />
        <GenreCloud />
        <MostLiked />
      </div>
    </div>
  );
}
