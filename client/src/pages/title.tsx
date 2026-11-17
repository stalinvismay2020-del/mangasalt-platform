import { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Star, Lock, Search as SearchIcon, ArrowDownUp, ChevronDown, BookOpen, CheckCircle2, Info, ArrowLeft, Users, Globe2, BadgeCheck, Clock, Coins, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TypeBadge } from "@/components/shared";
import { WorldLike, WorldSave, WorldPoster, STATUS_LABEL } from "@/components/world";
import { Comments } from "@/pages/series";
import { compact } from "@/lib/app-context";
import type { WorldDetail, WorldChapters } from "@shared/world";

const ORIGIN: Record<string, string> = { manga: "Japan", manhwa: "Korea", manhua: "China" };

export default function TitlePage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { data: t, isLoading, isError } = useQuery<WorldDetail>({ queryKey: [`/api/world/title/${id}`] });
  const ch = useQuery<WorldChapters>({ queryKey: [`/api/world/title/${id}/chapters`] });
  const [more, setMore] = useState(false);

  if (isError) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <Globe2 className="mx-auto h-9 w-9 text-primary" />
      <p className="font-display mt-3 text-2xl">Not available in official English</p>
      <p className="mt-2 text-sm text-muted-foreground">MANGASALT only lists titles with an official English release. We checked AniList and MangaDex and couldn't find one for this title.</p>
      <Link href="/search" className="mt-5 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse official titles</Link>
    </div>
  );
  if (isLoading || !t) return <TitleSkeleton />;

  const readable = ch.data?.chapters.filter((c) => c.inApp) ?? [];
  const resume = t.lastChapter ? readable.find((c) => c.key === t.lastChapter) : undefined;
  const start = resume ?? readable[0];
  const accent = t.color ?? "hsl(var(--primary))";

  return (
    <div className="relative overflow-x-clip">
      {/* Backdrop */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[460px] overflow-hidden">
        <motion.img initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          src={t.banner ?? t.cover} alt="" className="h-full w-full object-cover opacity-40 blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(60% 50% at 20% 30%, ${accent}33, transparent)` }} />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 md:pt-8">
        <div className="mb-4 flex items-center justify-between"><button onClick={() => history.length > 1 ? history.back() : nav("/")} className="glass-btn inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-foreground/80 transition hover:text-foreground active:scale-95" data-testid="button-back"><ArrowLeft className="h-4 w-4" />Back</button><ShareButton title={t.title} /></div>
        <div className="grid gap-6 md:grid-cols-[240px_1fr] md:gap-10">
          <motion.div initial={{ opacity: 0, y: 30, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto w-44 md:w-full">
            <div className="absolute -inset-4 -z-10 rounded-3xl opacity-60 blur-2xl" style={{ background: accent }} />
            <img src={t.cover} alt={`${t.title} cover`} className="aspect-[2/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10" data-testid="img-title-cover" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }} className="min-w-0 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <TypeBadge type={t.type} />
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{STATUS_LABEL[t.status] ?? t.status}</span>
              {t.year && <span className="text-xs text-muted-foreground">{t.year} · {ORIGIN[t.type] ?? ""}</span>}
            </div>
            <h1 className="font-display mt-3 text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl" data-testid="text-title">{t.title}</h1>
            {t.altTitle && t.altTitle !== t.title && <p className="mt-1 text-sm text-muted-foreground">{t.altTitle}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm md:justify-start">
              {t.score ? <span className="flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{(t.score / 10).toFixed(1)}</span> : null}
              <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-4 w-4" />{compact(t.popularity)} readers</span>
              {t.chapters ? <span className="text-muted-foreground">{t.chapters} chapters</span> : null}
              {t.volumes ? <span className="text-muted-foreground">{t.volumes} volumes</span> : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {start ? (
                <Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/mp/${t.id}/${encodeURIComponent(start.key)}`)} data-testid="button-start-reading">
                  <Play className="h-4 w-4 fill-current" />{resume ? `Continue Ch. ${resume.number}` : `Read Ch. ${start.number}`}
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="gap-2 rounded-full px-6" disabled={ch.isLoading} onClick={() => document.getElementById("chapters")?.scrollIntoView({ behavior: "smooth" })}>
                  <BookOpen className="h-4 w-4" />{ch.isLoading ? "Checking chapters…" : "Chapters"}
                </Button>
              )}
              <WorldLike id={t.id} liked={t.likedByMe} likes={t.likes} />
              <WorldSave id={t.id} saved={t.savedByMe} />
            </div>

            {t.official.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs md:justify-start" data-testid="row-official">
                <span className="flex items-center gap-1 font-semibold text-emerald-500"><BadgeCheck className="h-4 w-4" />Official English</span>
                {t.official.slice(0, 5).map((p) => <span key={p} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-300">{p}</span>)}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-1.5 md:justify-start">
              {t.genres.map((g) => (
                <Link key={g} href={`/search/genre/${encodeURIComponent(g)}`} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium transition hover:bg-primary hover:text-primary-foreground" data-testid={`link-genre-${g}`}>{g}</Link>
              ))}
            </div>

            <div className="relative mt-5 text-left">
              <p className={`whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground ${more ? "" : "line-clamp-4"}`} data-testid="text-synopsis">{t.description || "No synopsis yet."}</p>
              {t.description.length > 260 && <button onClick={() => setMore(!more)} className="mt-1 text-sm font-medium text-primary">{more ? "Show less" : "Read more"}</button>}
            </div>

            {t.staff.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm md:justify-start">
                {t.staff.slice(0, 4).map((s) => <div key={s.name + s.role}><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.role}</p></div>)}
              </div>
            )}
          </motion.div>
        </div>

        <ChapterList id={t.id} data={ch.data} loading={ch.isLoading} read={t.readChapters} last={t.lastChapter} />

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Discussion</h2>
          <Comments seriesId={-t.id} base={`/api/world/title/${t.id}/comments`} />
        </section>

        {t.recommendations.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display mb-4 text-xl font-semibold sm:text-2xl">If you like {t.title}</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 sm:gap-4">
              {t.recommendations.slice(0, 12).map((r, k) => <WorldPoster key={r.id} m={r} index={k} size="sm" />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ChapterList({ id, data, loading, read, last }: { id: number; data?: WorldChapters; loading: boolean; read: string[]; last: string | null }) {
  const [, nav] = useLocation();
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(false);
  const [all, setAll] = useState(false);
  const [onlyApp, setOnlyApp] = useState(false);
  const list = useMemo(() => {
    let l = data?.chapters ?? [];
    if (onlyApp) l = l.filter((c) => c.inApp);
    if (q.trim()) { const s = q.trim().toLowerCase(); l = l.filter((c) => c.number.includes(s) || (c.title ?? "").toLowerCase().includes(s)); }
    return desc ? [...l].reverse() : l;
  }, [data, q, desc, onlyApp]);
  const shown = all || q ? list : list.slice(0, 30);
  const readSet = new Set(read);

  return (
    <section id="chapters" className="mt-12 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Chapters</h2>
          {data && <p className="mt-1 text-sm text-muted-foreground" data-testid="text-chapter-stats">{data.total} official English chapters · <span className="text-primary">{data.inApp} open in MANGASALT</span>{data.chapters.some((c) => c.access === "wait" || c.access === "coins") ? <> · {data.chapters.filter((c) => c.access === "free").length} free now</> : null}</p>}
        </div>
        {data && data.total > 0 && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chapter no." className="h-9 rounded-full pl-8" data-testid="input-chapter-search" />
            </div>
            <Button variant={onlyApp ? "default" : "outline"} size="sm" className="h-9 rounded-full" onClick={() => setOnlyApp(!onlyApp)} data-testid="button-only-app">Readable</Button>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setDesc(!desc)} aria-label="Reverse order" data-testid="button-chapter-sort"><ArrowDownUp className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {loading && <div className="mt-4 space-y-2">{Array.from({ length: 6 }).map((_, k) => <div key={k} className="shimmer relative h-14 overflow-hidden rounded-xl bg-muted" />)}</div>}

      {data && data.inApp === 0 && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-border bg-card p-4 text-sm" data-testid="notice-no-inapp">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            {data.publishers?.length ? `This title is officially published in English on ${data.publishers.slice(0, 3).join(", ")}. ${data.publishers.length === 1 ? "That publisher doesn't" : "Those publishers don't"} allow their reader inside other apps, so its chapters can't open in MANGASALT yet.` : "We couldn't find official English chapters for this title yet."}
            {" "}Save it and you'll see it here the moment a licensed in-app edition becomes available.
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {shown.map((c, k) => {
              const isRead = readSet.has(c.key), current = last === c.key;
              const inner = (
                <>
                  <span className={`grid h-10 w-12 shrink-0 place-items-center rounded-lg text-sm font-bold ${c.inApp ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{c.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title || `Chapter ${c.number}`}</span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">{c.publisher ?? "Official"}{c.publishedAt ? ` · ${new Date(c.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : ""}
                      {c.inApp && <AccessTag a={c.access} />}</span>
                  </span>
                  {c.inApp ? (current ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Reading</span>
                    : isRead ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary" />)
                    : <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />Not in app</span>}
                </>
              );
              return (
                <motion.li key={c.key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(k, 12) * 0.02 }}>
                  {c.inApp ? (
                    <button onClick={() => nav(`/mp/${id}/${encodeURIComponent(c.key)}`)} className={`flex w-full items-center gap-3 rounded-xl border bg-card p-2 pr-3 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg ${current ? "border-primary/60" : "border-border"} ${isRead ? "opacity-70" : ""}`} data-testid={`button-chapter-${c.key}`}>{inner}</button>
                  ) : (
                    <div className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-dashed border-border/70 p-2 pr-3 opacity-55" aria-disabled data-testid={`row-chapter-locked-${c.key}`}>{inner}</div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {!all && !q && list.length > 30 && (
        <Button variant="outline" className="mt-4 w-full gap-1 rounded-full" onClick={() => setAll(true)} data-testid="button-show-all-chapters">Show all {list.length} chapters<ChevronDown className="h-4 w-4" /></Button>
      )}
      {data && data.total > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No chapter matches “{q}”.</p>}
    </section>
  );
}

function AccessTag({ a }: { a: string | null }) {
  if (a === "wait") return <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300"><Clock className="h-2.5 w-2.5" />Wait-free</span>;
  if (a === "coins") return <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300"><Coins className="h-2.5 w-2.5" />Coins</span>;
  return <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">Free</span>;
}

function ShareButton({ title }: { title: string }) {
  const { toast } = useToast();
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${title} on MANGASALT`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link copied", description: "Share it with a friend." }); }
    } catch {}
  };
  return <Button variant="outline" size="icon" className="glass-btn h-10 w-10 rounded-full" onClick={share} aria-label="Share" data-testid="button-share"><Share2 className="h-4 w-4" /></Button>;
}

function TitleSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 sm:px-6 md:grid-cols-[240px_1fr]">
      <div className="shimmer relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl bg-muted md:w-full" />
      <div className="space-y-4"><div className="h-6 w-24 rounded bg-muted" /><div className="h-12 w-3/4 rounded bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" /><div className="h-24 rounded bg-muted" /></div>
    </div>
  );
}
