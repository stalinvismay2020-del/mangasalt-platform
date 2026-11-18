import { useMemo, useState } from "react";
import { FavouriteButton, AddToShelf, ChapterCounter, ReportButton } from "@/components/platform";
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
import type { WorldDetail } from "@shared/world";
import type { ChapterPage } from "@shared/chapters";
import { chapterLabel } from "@shared/chapters";
import { ChapterBrowser } from "@/components/chapters";
import { NotFoundView } from "@/pages/not-found";

const ORIGIN: Record<string, string> = { manga: "Japan", manhwa: "Korea", manhua: "China" };

export default function TitlePage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { data: t, isLoading, isError, error, refetch } = useQuery<WorldDetail>({ queryKey: [`/api/world/title/${id}`] });
  const chUrl = `/api/world/title/${id}/chapters`;
  const ch = useQuery<ChapterPage>({ queryKey: [chUrl, { status: "available", limit: "100" }], staleTime: 60_000, enabled: !!id });
  const [more, setMore] = useState(false);

  if (isError && ![404, 400].includes((error as any)?.status)) return <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground" role="alert"><p>This title couldn't load. Check your connection and try again.</p><button onClick={() => refetch()} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Try again</button></div>;
  if (isError) return <NotFoundView embedded title="Title not found" message="This title isn't in the catalogue, or it was removed." />;
  if (isLoading || !t) return <TitleSkeleton />;

  const readable = ch.data?.items ?? [];
  const resume = [...readable].reverse().find((c) => c.read || (c.page ?? 0) > 0);
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
                <Button size="lg" className="glow-primary gap-2 rounded-full px-6" onClick={() => nav(`/read/${start.chapterId}`)} data-testid="button-start-reading">
                  <Play className="h-4 w-4 fill-current" />{resume ? `Continue ${chapterLabel(resume)}` : `Read ${chapterLabel(start)}`}
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="gap-2 rounded-full px-6" disabled={ch.isLoading} onClick={() => document.getElementById("chapters")?.scrollIntoView({ behavior: "smooth" })}>
                  <BookOpen className="h-4 w-4" />{ch.isLoading ? "Checking chapters…" : "See chapters"}
                </Button>
              )}
              <WorldLike id={t.id} liked={t.likedByMe} likes={t.likes} />
              <WorldSave id={t.id} saved={t.savedByMe} />
              <FavouriteButton itemKey={`world:${t.id}`} />
              <AddToShelf itemKey={`world:${t.id}`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 md:justify-start"><ChapterCounter itemKey={`world:${t.id}`} /><ReportButton targetType="world" targetId={t.id} /></div>

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

        {!ch.isLoading && !readable.length && (
          <div className="mt-8 flex gap-3 rounded-2xl border border-border bg-card p-4 text-sm" data-testid="notice-not-hosted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">{t.official.length
              ? <>MANGASALT doesn't host this title. It's officially published in English by {t.official.slice(0, 3).join(", ")}{t.readLinks.some((l) => l.url) ? <>: {t.readLinks.filter((l) => l.url).slice(0, 3).map((l, i) => <span key={l.site}>{i ? ", " : ""}<a href={l.url!} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{l.site}</a></span>)}</> : ""}.</>
              : "MANGASALT doesn't host this title yet, and we don't know of an official English edition. Save it to hear when an authorised edition arrives."}</p>
          </div>
        )}
        <ChapterBrowser endpoint={chUrl} worldId={t.id} />

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
