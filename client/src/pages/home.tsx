import { useEffect, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BookOpen, Flame, Heart, Trophy, Clock, Users, MessageCircle, EyeOff, ChevronLeft, ChevronRight, Sparkles, PenTool, ShieldCheck, Upload, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useApp, TYPE_LABEL, TYPE_ORIGIN, compact, timeAgo } from "@/lib/app-context";
import { Header, SeriesPoster, PosterSkeleton, LikeButton, TypeBadge, Avatar, FollowButton, QuickView, SearchOverlay, AuthDialog, ToastBridge, asset } from "@/components/shared";
import type { HomeData, SeriesCard, DiscussionItem } from "@shared/schema";

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

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

// ---------------- Hero ----------------
function Hero({ items, onOpen }: { items: SeriesCard[]; onOpen: (s: SeriesCard) => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 120]);
  const fade = useTransform(scrollY, [0, 500], [1, 0.3]);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 6500);
    return () => clearInterval(t);
  }, [paused, items.length]);
  const s = items[i];
  if (!s) return <div className="h-[88vh] min-h-[560px] bg-muted" />;
  return (
    <section className="relative isolate h-[88vh] min-h-[600px] overflow-hidden bg-black text-white" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <AnimatePresence mode="sync">
        <motion.div key={s.id} className="absolute inset-0 -z-10" style={{ y }} initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 1 }, scale: { duration: 7, ease: "linear" } }}>
          <img src={asset(s.cover)} alt="" className="h-full w-full object-cover object-[center_25%] blur-[2px] brightness-[.55]" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/70 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-background to-transparent" />
      <div className="grain absolute inset-0 -z-10" />

      <motion.div style={{ opacity: fade }} className="mx-auto flex h-full max-w-7xl items-center gap-10 px-4 pb-16 pt-24 sm:px-6">
        <div className="max-w-xl flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={s.id} initial="hide" animate="show" exit="exit" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
              <motion.div variants={rise} className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-1 text-xs font-bold uppercase tracking-wider"><Trophy className="h-3.5 w-3.5" /> #{i + 1} Most liked</span>
                <TypeBadge type={s.type} className="!bg-white/15 !text-white" />
                <span className="text-xs text-white/70">{TYPE_ORIGIN[s.type]} · {s.genres.join(" · ")}</span>
              </motion.div>
              <motion.h1 variants={rise} className="font-display text-[clamp(2.5rem,1.4rem+4.5vw,5rem)] font-bold leading-[0.95] tracking-tight text-balance">{s.title}</motion.h1>
              <motion.p variants={rise} className="mt-5 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg">{s.synopsis}</motion.p>
              <motion.div variants={rise} className="mt-5 flex items-center gap-4 text-sm text-white/70">
                <span className="flex items-center gap-1.5"><Avatar user={s.creator} size={22} />{s.creator.displayName}</span>
                <span className="flex items-center gap-1"><Heart className="h-4 w-4 fill-primary text-primary" />{compact(s.likes)}</span>
                <span>{s.chapterCount} chapters</span>
              </motion.div>
              <motion.div variants={rise} className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="gap-2 rounded-full px-6 text-base" onClick={() => onOpen(s)} data-testid="button-hero-read"><BookOpen className="h-5 w-5" /> Start reading</Button>
                <div className="[&_button]:border-white/25 [&_button]:bg-white/5 [&_button]:text-white [&_button]:backdrop-blur"><LikeButton s={s} /></div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Poster stack */}
        <div className="relative hidden h-[460px] w-[340px] shrink-0 md:block">
          {items.map((it, idx) => {
            const off = (idx - i + items.length) % items.length;
            if (off > 2) return null;
            return (
              <motion.button key={it.id} onClick={() => (off === 0 ? onOpen(it) : setI(idx))} data-testid={`button-hero-poster-${it.id}`}
                className="absolute right-0 top-0 h-[460px] w-[306px] overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15"
                animate={{ x: -off * 34, y: off * 18, scale: 1 - off * 0.08, opacity: 1 - off * 0.3, rotate: off * -3, zIndex: 10 - off }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }} aria-label={`Show ${it.title}`}>
                <img src={asset(it.cover)} alt={`${it.title} cover`} className="h-full w-full object-cover" />
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <div className="absolute inset-x-0 bottom-10 mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div className="flex flex-1 gap-2">
          {items.map((it, idx) => (
            <button key={it.id} onClick={() => setI(idx)} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20 sm:max-w-24" aria-label={`Slide ${idx + 1}`} data-testid={`button-hero-dot-${idx}`}>
              {idx === i && <motion.span key={`${i}-${paused}`} className="block h-full bg-white" initial={{ width: paused ? "100%" : 0 }} animate={{ width: "100%" }} transition={{ duration: paused ? 0 : 6.5, ease: "linear" }} />}
              {idx < i && <span className="block h-full w-full bg-white/60" />}
            </button>
          ))}
        </div>
        <button onClick={() => setI((i - 1 + items.length) % items.length)} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Previous" data-testid="button-hero-prev"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setI((i + 1) % items.length)} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Next" data-testid="button-hero-next"><ChevronRight className="h-4 w-4" /></button>
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

// ---------------- Top liked leaderboard ----------------
function Charts({ items, onOpen }: { items: SeriesCard[]; onOpen: (s: SeriesCard) => void }) {
  const max = Math.max(1, ...items.map((s) => s.likes));
  return (
    <section id="charts" className="scroll-mt-24">
      <SectionHead icon={Trophy} kicker="The salt charts" title="Top liked — more likes, higher rank" />
      <ol className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {items.map((s, idx) => (
            <motion.li key={s.id} layout transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl p-2 sm:gap-4 sm:p-2.5 transition hover:bg-card" onClick={() => onOpen(s)} data-testid={`row-chart-${s.id}`}>
              <span className={`rank-numeral font-display w-8 shrink-0 text-center text-4xl sm:w-12 sm:text-5xl font-bold tabular-nums ${idx < 3 ? "top" : ""}`}>{idx + 1}</span>
              <img src={asset(s.cover)} alt="" className="h-20 w-14 shrink-0 rounded-md object-cover ring-1 ring-white/5" loading="lazy" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h3 className="truncate font-semibold group-hover:text-primary">{s.title}</h3><TypeBadge type={s.type} className="max-sm:hidden" /></div>
                <p className="truncate text-xs text-muted-foreground">{s.creator.displayName} · {s.genres[0]}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" initial={{ width: 0 }} whileInView={{ width: `${(s.likes / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}><LikeButton s={s} /></div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
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
  const { user, openAuth } = useApp();
  const [open, setOpen] = useState<SeriesCard | null>(null);
  const { data, isLoading } = useQuery<HomeData>({ queryKey: ["/api/home", { u: String(user?.id ?? "") }] });
  useEffect(() => { document.title = "MANGASALT — Read Manga, Manhwa & Manhua in English"; }, []);

  return (
    <div className="min-h-screen">
      <ToastBridge />
      <Header onNav={scrollTo} />
      <Hero items={data?.featured ?? []} onOpen={setOpen} />
      <main className="relative z-10 mx-auto -mt-6 max-w-7xl space-y-20 px-4 pb-24 sm:px-6">
        {data && <Stats stats={data.stats} />}
        {user && data && (
          <Rail id="recent" icon={Clock} kicker={`Welcome back, ${user.displayName}`} title="Recently viewed" items={data.recent} onOpen={setOpen}
            empty={<p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">Open any series and it will show up here.</p>} />
        )}
        <TrendingSection onOpen={setOpen} />
        {isLoading || !data ? <div className="h-96 rounded-2xl bg-muted shimmer relative overflow-hidden" /> : (
          <>
            <Charts items={data.topLiked} onOpen={setOpen} />
            <LatestList items={data.latest} onOpen={setOpen} />
            <CreatorLibrary data={data} />
            <Community items={data.discussions} onOpenSeries={setOpen} series={[...data.topLiked, ...data.latest]} />
          </>
        )}
        {!user && (
          <section className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <div className="grain absolute inset-0" />
            <h2 className="relative font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your shelf is waiting.</h2>
            <p className="relative mx-auto mt-3 max-w-md text-primary-foreground/85">Like series to push them up the charts, follow creators, and pick up where you left off.</p>
            <Button size="lg" variant="secondary" className="relative mt-6 rounded-full px-8" onClick={() => openAuth("signup")} data-testid="button-cta-signup">Create free account</Button>
          </section>
        )}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div><span className="font-display text-lg font-bold text-foreground">MANGA<span className="text-primary">SALT</span></span><p className="mt-1">Manga · Manhwa · Manhua — in English.</p></div>
          <p className="flex max-w-md items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Every series on MANGASALT is original or published by its rights holder. Report infringing content and we take it down.</p>
        </div>
      </footer>
      <QuickView s={open} onClose={() => setOpen(null)} />
      <SearchOverlay onOpen={setOpen} />
      <AuthDialog />
    </div>
  );
}
