import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Bookmark, List, MessageCircle, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp } from "@/lib/app-context";
import { asset } from "@/components/shared";
import { Comments } from "@/pages/series";
import NotFound, { LoadError, isNotFound } from "@/pages/not-found";
import type { ChapterData, SeriesDetail } from "@shared/schema";

export default function Reader({ params }: { params: { id: string; page?: string } }) {
  const id = Number(params.id);
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = useQuery<ChapterData>({ queryKey: [`/api/chapters/${id}`] });
  const detail = useQuery<SeriesDetail>({ queryKey: [`/api/series/by-slug/${data?.series.slug}`], enabled: !!data });
  const [chrome, setChrome] = useState(true);
  const [page, setPage] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [bm, setBm] = useState<number | null>(null);
  const refs = useRef<(HTMLImageElement | null)[]>([]);
  const lastY = useRef(0);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  useEffect(() => { setBm(data?.bookmark ?? null); }, [data?.bookmark, id]);

  // record reading, jump to bookmarked page
  useEffect(() => {
    if (!data) return;
    apiRequest("POST", `/api/chapters/${id}/read`).then(() => invalidatePrefixes("/api/me/library", "/api/home", "/api/series/by-slug"));
    const start = params.page ? Number(params.page) : 0;
    setPage(start);
    if (start > 0) setTimeout(() => refs.current[start]?.scrollIntoView({ block: "start" }), 300);
    else window.scrollTo({ top: 0 });
  }, [data?.chapter.id]);

  // hide chrome on scroll down, show on scroll up
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY.current) > 24) { setChrome(y < lastY.current || y < 80); lastY.current = y; }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // track the visible page
  useEffect(() => {
    if (!data) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.i)); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, [data?.chapter.id]);

  // keyboard: arrows switch chapters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight" && data?.next) navigate(`/read/${data.next.id}`);
      if (e.key === "ArrowLeft" && data?.prev) navigate(`/read/${data.prev.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data]);

  const bookmark = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/chapters/${id}/bookmark`, { page })).json(),
    onSuccess: (d: any) => {
      setBm(d.bookmark);
      invalidatePrefixes("/api/series/by-slug");
      toast({ title: d.bookmark === null ? "Bookmark removed" : `Bookmarked page ${page + 1}` });
    },
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (error) return isNotFound(error) ? <NotFound what="chapter" /> : <LoadError message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data) return null;
  const { chapter: c, series: s, prev, next } = data;
  const total = c.pages.length;

  return (
    <div className="min-h-screen bg-[hsl(0_0%_3%)] text-white">
      <motion.div className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary" style={{ scaleX: progress }} />

      {/* Top bar */}
      <AnimatePresence>
        {chrome && (
          <motion.header initial={{ y: -64 }} animate={{ y: 0 }} exit={{ y: -64 }} transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
              <Link href={`/series/${s.slug}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Back to series" data-testid="button-reader-back"><ArrowLeft className="h-5 w-5" /></Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" data-testid="text-reader-series">{s.title}</p>
                <p className="truncate text-xs text-white/60" data-testid="text-reader-chapter">Ep. {c.number} · {c.title}</p>
              </div>
              <button onClick={() => setListOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="Episode list" data-testid="button-episode-list"><List className="h-5 w-5" /></button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Pages */}
      <main className="mx-auto max-w-3xl pb-6 pt-14" onClick={() => setChrome((v) => !v)}>
        {c.pages.map((src, i) => (
          <img key={src} ref={(el) => (refs.current[i] = el)} data-i={i} src={asset(src)} alt={`${s.title} episode ${c.number}, page ${i + 1} of ${total}`}
            loading={i < 2 ? "eager" : "lazy"} decoding="async" className="block h-auto w-full select-none" draggable={false} data-testid={`img-page-${i}`} />
        ))}

        {/* End card */}
        <div className="mx-4 mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">End of episode {c.number}</p>
          <p className="font-display mt-1 text-xl font-semibold">{c.title}</p>
          {next ? (
            <Button size="lg" className="mt-4 w-full gap-2 rounded-full sm:w-auto" onClick={() => navigate(`/read/${next.id}`)} data-testid="button-next-episode">
              Next: Episode {next.number}<ChevronRight className="h-5 w-5" />
            </Button>
          ) : <p className="mt-3 text-sm text-white/60">You are all caught up. Follow the series to hear about new episodes.</p>}
          {s.rights === "cc-by-4.0" && (
            <p className="mt-4 text-xs text-white/50">{s.title} by {s.creator.displayName}, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY 4.0</a> · <a href="https://www.peppercarrot.com" target="_blank" rel="noreferrer" className="underline">peppercarrot.com</a></p>
          )}
        </div>

        <section className="mx-4 mt-8" onClick={(e) => e.stopPropagation()}>
          <h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Episode {c.number} discussion</h2>
          <div className="dark"><Comments seriesId={s.id} chapterId={c.id} /></div>
        </section>
      </main>

      {/* Bottom bar */}
      <AnimatePresence>
        {chrome && (
          <motion.nav initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-3">
              <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white" disabled={!prev} onClick={() => prev && navigate(`/read/${prev.id}`)} aria-label="Previous episode" data-testid="button-prev-episode"><ChevronLeft className="h-5 w-5" /></Button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-xs tabular-nums text-white/70" data-testid="text-page-indicator">Page {Math.min(page + 1, total)} / {total}</p>
                <div className="mx-auto mt-1 h-1 max-w-[220px] overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((page + 1) / total) * 100}%` }} /></div>
              </div>
              <Button variant="ghost" size="icon" className={`rounded-full hover:bg-white/10 ${bm === page ? "text-primary hover:text-primary" : "text-white hover:text-white"}`}
                onClick={() => (user ? bookmark.mutate() : openAuth("login"))} aria-label="Bookmark this page" data-testid="button-bookmark">
                <Bookmark className={`h-5 w-5 ${bm === page ? "fill-current" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white" disabled={!next} onClick={() => next && navigate(`/read/${next.id}`)} aria-label="Next episode" data-testid="button-next-bar"><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Episode list drawer */}
      <AnimatePresence>
        {listOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)} />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 right-0 z-50 flex w-[86%] max-w-sm flex-col border-l border-white/10 bg-[hsl(0_0%_6%)]" data-testid="drawer-episodes">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <p className="font-semibold">Episodes</p>
                <button onClick={() => setListOpen(false)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
              <ul className="flex-1 overflow-y-auto p-2">
                {detail.data?.chapters.map((ch) => (
                  <li key={ch.id}>
                    <Link href={`/read/${ch.id}`} onClick={() => setListOpen(false)}
                      className={`flex items-center gap-3 rounded-lg p-2 ${ch.id === c.id ? "bg-primary/15" : "hover:bg-white/5"}`} data-testid={`drawer-chapter-${ch.number}`}>
                      {ch.thumb && <img src={asset(ch.thumb)} alt="" loading="lazy" className="h-10 w-14 rounded object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${ch.id === c.id ? "text-primary" : "text-white/60"}`}>Episode {ch.number}</p>
                        <p className="truncate text-sm">{ch.title}</p>
                      </div>
                      {ch.read && <Check className="h-4 w-4 text-emerald-500" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
