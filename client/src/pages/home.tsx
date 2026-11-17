import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BookOpen, Flame, Heart, Trophy, Clock, Users, MessageCircle, Star, EyeOff, ChevronLeft, ChevronRight, Sparkles, PenTool, ShieldCheck, Upload, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useApp, TYPE_LABEL, TYPE_ORIGIN, compact, timeAgo } from "@/lib/app-context";
import { SeriesPoster, PosterSkeleton, LikeButton, SaveButton, TypeBadge, Avatar, FollowButton, RankRow, EmptyBox, asset } from "@/components/shared";
import { Link } from "wouter";
import type { HomeData, SeriesCard, DiscussionItem } from "@shared/schema";


function SectionHead({ icon: Icon, kicker, title, action }: { icon: any; kicker: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Icon className="h-3.5 w-3.5" />{kicker}</p>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ---------------- Hero (centered #1 cover) ----------------
const GLOW: Record<string, string> = {
  "level-zero-hunter": "265 70% 45%", "jade-ascension": "150 55% 38%", "saltblade-ronin": "354 70% 45%", "tidewitch-ledger": "185 60% 40%",
  "crimson-peony-court": "0 75% 42%", "abyssal-gate-academy": "275 60% 45%", "neon-koi-requiem": "320 70% 50%", "paper-lantern-cafe": "35 85% 50%",
};
function Hero({ items, onOpen }: { items: SeriesCard[]; onOpen: (s: SeriesCard) => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 6500);
    return () => clearInterval(t);
  }, [paused, items.length]);
  const s = items[i];
  if (!s) return <div className="mx-auto mt-6 h-[520px] max-w-6xl rounded-3xl bg-muted shimmer relative overflow-hidden" />;
  const glow = GLOW[s.slug] ?? "354 70% 45%";
  return (
    <section className="relative isolate overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <motion.div key={`g-${s.id}`} className="absolute inset-0 -z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}
        style={{ background: `radial-gradient(60% 55% at 50% 32%, hsl(${glow} / 0.55), transparent 70%)` }} />
      <div className="grain absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pb-16 md:pt-10">
        {/* cover */}
        <div className="relative mx-auto h-[300px] w-[210px] sm:h-[380px] sm:w-[260px] md:order-2 md:h-[460px] md:w-[310px]">
          {items.map((it, idx) => {
            const off = (idx - i + items.length) % items.length;
            if (off > 2) return null;
            return (
              <motion.button key={it.id} onClick={() => (off === 0 ? onOpen(it) : setI(idx))} data-testid={`button-hero-poster-${it.id}`} aria-label={off === 0 ? `Open ${it.title}` : `Show ${it.title}`}
                className="absolute inset-0 overflow-hidden rounded-xl ring-1 ring-white/15"
                style={{ boxShadow: off === 0 ? `0 30px 80px -20px hsl(${glow} / .8)` : undefined }}
                animate={{ x: off * 26, y: -off * 6, scale: 1 - off * 0.07, opacity: off === 0 ? 1 : 0.35, rotate: off * 4, zIndex: 10 - off, filter: off ? "blur(1px)" : "blur(0px)" }}
                transition={{ type: "spring", stiffness: 170, damping: 22 }}>
                <img src={asset(it.cover)} alt={`${it.title} cover`} className="h-full w-full object-cover" />
              </motion.button>
            );
          })}
        </div>
        {/* text */}
        <div className="min-w-0 md:order-1">
          <AnimatePresence mode="wait">
            <motion.div key={s.id} initial="hide" animate="show" exit="exit" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
              <motion.p variants={rise} className="rank-numeral top font-display text-6xl font-bold leading-none sm:text-7xl" style={{ color: "transparent", WebkitTextStroke: "2px hsl(var(--primary))" }}>#{i + 1}</motion.p>
              <motion.p variants={rise} className="mt-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><TrendingUp className="h-3.5 w-3.5" />Top {i + 1} trending · Read on MANGASALT</motion.p>
              <motion.div variants={rise} className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-primary/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">{TYPE_LABEL[s.type]}</span>
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" />Official EN</span>
              </motion.div>
              <motion.h1 variants={rise} className="mt-3 font-display text-[clamp(2.2rem,1.4rem+3.5vw,4.2rem)] font-bold leading-[0.98] tracking-tight text-balance">{s.title}</motion.h1>
              <motion.p variants={rise} className="mt-2 text-sm text-muted-foreground">by {s.creator.displayName}</motion.p>
              <motion.div variants={rise} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 text-foreground"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>
                <span>{s.year}</span><span className="capitalize">{s.status === "ongoing" ? "Releasing" : s.status}</span>
                <span>{s.genres.join(" · ")}</span>
              </motion.div>
              <motion.p variants={rise} className="mt-4 max-w-lg leading-relaxed text-foreground/80">{s.synopsis}</motion.p>
              <motion.div variants={rise} className="mt-6 flex flex-wrap items-center gap-2.5">
                <Button size="lg" className="gap-2 rounded-full px-6" onClick={() => onOpen(s)} data-testid="button-hero-read"><BookOpen className="h-5 w-5" />Read now</Button>
                <SaveButton s={s} />
                <LikeButton s={s} />
              </motion.div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-8 flex items-center gap-2">
            {items.map((it, idx) => (
              <button key={it.id} onClick={() => setI(idx)} className="h-1 w-10 overflow-hidden rounded-full bg-foreground/15" aria-label={`Slide ${idx + 1}`} data-testid={`button-hero-dot-${idx}`}>
                {idx === i && <motion.span key={`${i}-${paused}`} className="block h-full bg-primary" initial={{ width: paused ? "100%" : 0 }} animate={{ width: "100%" }} transition={{ duration: paused ? 0 : 6.5, ease: "linear" }} />}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setI((i - 1 + items.length) % items.length)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Previous" data-testid="button-hero-prev"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setI((i + 1) % items.length)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Next" data-testid="button-hero-next"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
const rise = { hide: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }, exit: { opacity: 0, y: -10, transition: { duration: 0.25 } } };

// ---------------- Trending by category ----------------
function TrendingSection({ onOpen }: { onOpen: (s: SeriesCard) => void }) {
  const [type, setType] = useState("");
  const { data, isLoading } = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { type, order: "trending" }] });
  const tabs = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]];
  return (
    <section id="trending" className="scroll-mt-24">
      <SectionHead icon={Flame} kicker="Trending this week" title="What everyone is reading"
        action={
          <div className="flex max-w-full overflow-x-auto no-scrollbar rounded-full border border-border bg-card p-1" role="tablist">
            {tabs.map(([v, l]) => (
              <button key={v} role="tab" aria-selected={type === v} onClick={() => setType(v)} data-testid={`tab-type-${v || "all"}`}
                className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${type === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {type === v && <motion.span layoutId="type-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{l}</span>
              </button>
            ))}
          </div>
        } />
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {isLoading ? Array.from({ length: 6 }).map((_, k) => <PosterSkeleton key={k} />) :
          data?.slice(0, 12).map((s, k) => <SeriesPoster key={`${type}-${s.id}`} s={s} index={k} onOpen={onOpen} />)}
      </div>
      {data?.length === 0 && <p className="py-10 text-center text-muted-foreground">No {TYPE_LABEL[type]} series yet. Creators, this is your chance.</p>}
    </section>
  );
}

// ---------------- Trending preview (top 3) ----------------
function TrendingPreview({ items }: { items: SeriesCard[] }) {
  return (
    <section id="charts">
      <SectionHead icon={Flame} kicker="Charts" title="Trending" action={<Link href="/trending" className="text-sm font-medium text-primary hover:underline" data-testid="link-see-trending">See all charts</Link>} />
      <p className="-mt-3 mb-3 text-sm text-muted-foreground">Original titles you can read on MANGASALT. Ranked by reader likes, live.</p>
      <ol className="grid grid-cols-1 gap-x-8 md:grid-cols-2">{items.slice(0, 6).map((s, k) => <RankRow key={s.id} s={s} rank={k + 1} />)}</ol>
    </section>
  );
}

// ---------------- Rail (recent / latest) ----------------
function Rail({ id, icon, kicker, title, items, onOpen, empty }: { id: string; icon: any; kicker: string; title: string; items: SeriesCard[]; onOpen: (s: SeriesCard) => void; empty?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionHead icon={icon} kicker={kicker} title={title} />
      {items.length === 0 ? empty : (
        <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          {items.map((s, k) => <div key={s.id} className="w-36 shrink-0 snap-start sm:w-44"><SeriesPoster s={s} index={k} onOpen={onOpen} size="sm" /></div>)}
        </div>
      )}
    </section>
  );
}

function LatestList({ items, onOpen }: { items: SeriesCard[]; onOpen: (s: SeriesCard) => void }) {
  return (
    <section id="latest" className="scroll-mt-24">
      <SectionHead icon={Clock} kicker="Fresh off the press" title="Latest chapter updates" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 9).map((s, k) => (
          <motion.button key={s.id} onClick={() => onOpen(s)} data-testid={`card-latest-${s.id}`}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.04 }}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/40">
            <img src={asset(s.cover)} alt="" className="h-16 w-12 rounded object-cover" loading="lazy" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate font-semibold group-hover:text-primary">{s.title}</span></div>
              <p className="mt-0.5 text-sm text-foreground/80">Chapter {s.latestChapter}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(s.latestChapterAt)} · {TYPE_LABEL[s.type]}</p>
            </div>
            {Date.now() - s.latestChapterAt < 3 * 864e5 && <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-primary">New</span>}
          </motion.button>
        ))}
      </div>
    </section>
  );
}

// ---------------- Creator library ----------------
function CreatorLibrary({ data }: { data: HomeData }) {
  const { user, openAuth } = useApp();
  return (
    <section id="library" className="scroll-mt-24">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <img src={asset("/covers/hero-banner.webp")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 dark:opacity-25" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/40" />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><PenTool className="h-3.5 w-3.5" />Creator Library</p>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl text-balance">Your story belongs here. Publish it on MANGASALT.</h2>
            <p className="mt-4 max-w-md text-muted-foreground">Upload your own manga, manhwa or manhua chapters. Readers like, follow and discuss — and the most-liked series climb the charts.</p>
            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />Upload chapters page by page</li>
              <li className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Rank on Trending and Top Liked</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />You keep the rights — only original or licensed work</li>
            </ul>
            <Button className="mt-7 rounded-full px-6" onClick={() => (user ? null : openAuth("signup"))} data-testid="button-become-creator">
              <Sparkles className="mr-2 h-4 w-4" />{user ? "Creator Studio opens in the next build" : "Join as a creator"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.creators.map((c, k) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.06 }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 p-3.5 backdrop-blur" data-testid={`card-creator-${c.id}`}>
                <Avatar user={c} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.displayName}</p>
                  <p className="text-xs text-muted-foreground">{c.seriesCount} series · {compact(c.totalLikes)} likes</p><p className="text-xs text-muted-foreground">{compact(c.followers)} followers</p>
                </div>
                <FollowButton type="creator" id={c.id} following={c.followedByMe} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------- Community ----------------
function SpoilerText({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return shown ? <p className="text-[15px] leading-relaxed">{text}</p> : (
    <button onClick={() => setShown(true)} className="group relative w-full text-left" data-testid="button-reveal-spoiler">
      <p className="select-none text-[15px] leading-relaxed blur-sm">{text}</p>
      <span className="absolute inset-0 grid place-items-center"><span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold ring-1 ring-border"><EyeOff className="h-3.5 w-3.5 text-primary" />Spoiler — tap to reveal</span></span>
    </button>
  );
}

function Community({ items, onOpenSeries, series }: { items: DiscussionItem[]; onOpenSeries: (s: SeriesCard) => void; series: SeriesCard[] }) {
  return (
    <section id="community" className="scroll-mt-24">
      <SectionHead icon={MessageCircle} kicker="Community" title="Hot discussions" />
      <div className="columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4">
        {items.map((d, k) => (
          <motion.article key={d.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.05 }}
            className="break-inside-avoid rounded-2xl border border-border bg-card p-5" data-testid={`card-discussion-${d.id}`}>
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar user={d.user} size={30} />
              <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-semibold">{d.user.displayName}</p><p className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</p></div>
            </div>
            {d.spoiler ? <SpoilerText text={d.body} /> : <p className="text-[15px] leading-relaxed">{d.body}</p>}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <button className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { const s = series.find((x) => x.id === d.series.id); s && onOpenSeries(s); }} data-testid={`link-discussion-series-${d.id}`}>
                <img src={asset(d.series.cover)} alt="" className="h-6 w-4 rounded-sm object-cover" /><span className="truncate">{d.series.title}</span>
              </button>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{d.likes}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{d.replies}</span>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Full threads with replies, comment likes, spoiler tags and reporting open on each series page.</p>
    </section>
  );
}

// ---------------- Stats strip ----------------
function Stats({ stats }: { stats: HomeData["stats"] }) {
  const items = [["Original series", stats.series], ["Chapters", stats.chapters], ["Creators", stats.creators], ["Readers", stats.readers]] as const;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
      {items.map(([l, v]) => (
        <div key={l} className="bg-card px-5 py-4"><p className="font-display text-2xl font-semibold tabular-nums" data-testid={`text-stat-${l}`}>{compact(v)}</p><p className="text-xs uppercase tracking-wider text-muted-foreground">{l}</p></div>
      ))}
    </div>
  );
}

// ---------------- Page ----------------
export default function Home() {
  const { user, openAuth, setOpenSeries: setOpen } = useApp();
  const { data, isLoading } = useQuery<HomeData>({ queryKey: ["/api/home", { u: String(user?.id ?? "") }] });
  useEffect(() => { document.title = "MANGASALT — Read Manga, Manhwa & Manhua in English"; }, []);
  return (
    <>
      <Hero items={data?.featured ?? []} onOpen={setOpen} />
      <div className="mx-auto max-w-6xl space-y-16 px-4 pb-10 sm:px-6">
        {user && data && (
          <Rail id="recent" icon={Clock} kicker={`Welcome back, ${user.displayName}`} title="Continue reading" items={data.recent} onOpen={setOpen}
            empty={<EmptyBox>Nothing in progress. Open any official chapter and it will show up here.</EmptyBox>} />
        )}
        {isLoading || !data ? <div className="relative h-96 overflow-hidden rounded-2xl bg-muted shimmer" /> : <TrendingPreview items={data.topLiked} />}
        <TrendingSection onOpen={setOpen} />
        {data && (
          <>
            <LatestList items={data.latest} onOpen={setOpen} />
            <CreatorLibrary data={data} />
            <Community items={data.discussions} onOpenSeries={setOpen} series={[...data.topLiked, ...data.latest]} />
            <Stats stats={data.stats} />
          </>
        )}
        {!user && (
          <section className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <div className="grain absolute inset-0" />
            <h2 className="relative font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your shelf is waiting.</h2>
            <p className="relative mx-auto mt-3 max-w-md text-primary-foreground/85">Like series to push them up the charts, save titles, follow creators, and pick up where you left off.</p>
            <Button size="lg" variant="secondary" className="relative mt-6 rounded-full px-8" onClick={() => openAuth("signup")} data-testid="button-cta-signup">Create free account</Button>
          </section>
        )}
      </div>
    </>
  );
}
