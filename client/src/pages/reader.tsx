import { NotFoundView } from "@/pages/not-found";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Bookmark, List, MessageCircle, X, Check, Settings2, Maximize, Minimize, EyeOff, RotateCw, ZoomIn, ZoomOut, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp } from "@/lib/app-context";
import { asset } from "@/components/shared";
import { Comments } from "@/pages/series";
import type { ChapterData, SeriesDetail } from "@shared/schema";

// ---------- reader preferences (saved on this device) ----------
type Mode = "vertical" | "single" | "double";
type Prefs = { mode: Mode; dir: "ltr" | "rtl"; fit: "width" | "height" | "original"; zoom: number; brightness: number; bg: "black" | "dark" | "sepia" | "white"; autoNext: boolean; gaps: boolean };
const DEFAULT: Prefs = { mode: "vertical", dir: "ltr", fit: "width", zoom: 100, brightness: 100, bg: "black", autoNext: true, gaps: false };
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const BG: Record<Prefs["bg"], string> = { black: "bg-black text-white", dark: "bg-[hsl(230_12%_10%)] text-white", sepia: "bg-[hsl(36_40%_86%)] text-[hsl(30_30%_15%)]", white: "bg-white text-neutral-900" };

/** A page image with a loading shimmer, fade-in and retry on failure. */
function PageImage({ src, alt, eager, className = "", imgRef, index }: { src: string; alt: string; eager?: boolean; className?: string; imgRef?: (el: HTMLDivElement | null) => void; index: number }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const url = attempt ? `${asset(src)}${src.includes("?") ? "&" : "?"}retry=${attempt}` : asset(src);
  useEffect(() => { if (state !== "error" || attempt >= 2) return; const t = setTimeout(() => { setAttempt((a) => a + 1); setState("loading"); }, 1500 * (attempt + 1)); return () => clearTimeout(t); }, [state, attempt]);
  return (
    <div ref={imgRef} data-i={index} className={`relative ${state !== "ok" ? "min-h-[50vh]" : ""} ${className}`}>
      {state === "loading" && <div className="shimmer absolute inset-0 overflow-hidden bg-white/5" aria-hidden><div className="absolute inset-0 grid place-items-center text-xs opacity-50">Page {index + 1}</div></div>}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center" role="alert">
          <div><p className="text-sm opacity-80">Page {index + 1} didn't load.</p>
            <Button size="sm" variant="secondary" className="mt-3 gap-1.5 rounded-full" onClick={(e) => { e.stopPropagation(); setAttempt((a) => a + 1); setState("loading"); }}><RotateCw className="h-3.5 w-3.5" />Retry</Button></div>
        </div>
      ) : (
        <img key={url} src={url} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} onLoad={() => setState("ok")} onError={() => setState("error")}
          className={`mx-auto block select-none transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"} ${className.includes("h-full") ? "h-full w-auto max-w-full object-contain" : "h-auto"}`} style={{ maxWidth: "100%" }} />
      )}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-white/5 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`relative rounded-lg px-2 py-1.5 text-xs font-medium transition ${value === v ? "text-white" : "text-white/60 hover:text-white"}`}>
            {value === v && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-lg bg-primary" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Reader({ params }: { params: { id: string; page?: string } }) {
  const id = Number(params.id);
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = useQuery<ChapterData>({ queryKey: [`/api/chapters/${id}`] });
  const detail = useQuery<SeriesDetail>({ queryKey: [`/api/series/by-slug/${data?.series.slug}`], enabled: !!data });
  const [prefs, setPrefsState] = useState<Prefs>(() => load("ms-reader", DEFAULT));
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((v) => { const n = { ...v, ...p }; save("ms-reader", n); return n; });
  const [chrome, setChrome] = useState(true);
  const [page, setPage] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bm, setBm] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [swipeDir, setSwipeDir] = useState(1);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastY = useRef(0);
  const ready = useRef(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  const total = data?.chapter.pages.length ?? 0;
  const paged = prefs.mode !== "vertical";
  const step = prefs.mode === "double" ? 2 : 1;
  const rtl = prefs.dir === "rtl";

  useEffect(() => { setBm(data?.bookmark ?? null); }, [data?.bookmark, id]);

  // record the read, then restore the last position (URL page > synced progress > this device)
  useEffect(() => {
    if (!data) return;
    ready.current = false;
    setCountdown(null);
    apiRequest("POST", `/api/chapters/${id}/read`).then(() => invalidatePrefixes("/api/me/library", "/api/home", "/api/series/by-slug", "/api/shelves/membership"));
    const local = load<{ p: number | null }>(`ms-pos-${id}`, { p: null }).p;
    const go = (start: number) => {
      const p = Math.max(0, Math.min(start, data.chapter.pages.length - 1));
      setPage(p);
      if (prefs.mode === "vertical") { if (p > 0) setTimeout(() => refs.current[p]?.scrollIntoView({ block: "start" }), 250); else window.scrollTo({ top: 0 }); }
      setTimeout(() => (ready.current = true), 600);
      if (p > 0 && !params.page) toast({ title: `Resumed at page ${p + 1}`, description: "Picked up where you left off." });
    };
    if (params.page) return go(Number(params.page));
    if (!user) return go(local ?? 0);
    apiRequest("GET", `/api/chapters/${id}/progress`).then((r) => r.json()).then((r) => go(r.page ?? local ?? 0)).catch(() => go(local ?? 0));
  }, [data?.chapter.id]);

  // save position (debounced) on this device and to the account
  useEffect(() => {
    if (!data || !ready.current) return;
    save(`ms-pos-${id}`, { p: page });
    if (!user) return;
    const t = setTimeout(() => apiRequest("PUT", `/api/chapters/${id}/progress`, { page }).catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [page, id, user?.id]);

  // vertical: hide chrome on scroll down, show on scroll up
  useEffect(() => {
    if (paged) return;
    const onScroll = () => { const y = window.scrollY; if (Math.abs(y - lastY.current) > 24) { setChrome(y < lastY.current || y < 80); lastY.current = y; } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [paged]);

  // vertical: track the visible page and start auto-next at the end
  useEffect(() => {
    if (!data || paged) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.i)); }), { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((r) => r && io.observe(r));
    const end = new IntersectionObserver(([e]) => { if (e.isIntersecting && prefs.autoNext && data.next && ready.current) setCountdown((c) => c ?? 5); }, { threshold: 0.6 });
    if (endRef.current) end.observe(endRef.current);
    return () => { io.disconnect(); end.disconnect(); };
  }, [data?.chapter.id, paged, prefs.autoNext]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { if (data?.next) navigate(`/read/${data.next.id}`); return; }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // paged navigation; "page === total" is the end card
  const turn = useCallback((delta: number) => {
    if (!data) return;
    setSwipeDir(delta);
    setPage((p) => {
      const n = p + delta * step;
      if (n < 0) { if (data.prev) navigate(`/read/${data.prev.id}`); return p; }
      if (n >= total) { if (p >= total && data.next && prefs.autoNext) navigate(`/read/${data.next.id}`); return total; }
      return n;
    });
  }, [data, step, total, prefs.autoNext]);
  const forward = () => turn(1), back = () => turn(-1);
  const leftTap = () => (rtl ? forward() : back()), rightTap = () => (rtl ? back() : forward());

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if (e.key === "f") toggleFull();
      if (e.key === "h") setChrome((v) => !v);
      if (paged) {
        if (e.key === "ArrowRight") { e.preventDefault(); rightTap(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); leftTap(); }
        if (e.key === " ") { e.preventDefault(); forward(); }
      } else {
        if (e.key === "ArrowRight" && data?.next) navigate(`/read/${data.next.id}`);
        if (e.key === "ArrowLeft" && data?.prev) navigate(`/read/${data.prev.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, paged, rtl, turn]);

  useEffect(() => { const h = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else document.documentElement.requestFullscreen?.().catch(() => toast({ title: "Full screen isn't available here" })); };

  // switching modes keeps your page
  useEffect(() => { if (!data) return; if (!paged) setTimeout(() => refs.current[Math.min(page, total - 1)]?.scrollIntoView({ block: "start" }), 50); else { window.scrollTo({ top: 0 }); if (prefs.mode === "double") setPage((p) => (p >= total ? p : p - (p % 2))); } }, [prefs.mode]);

  const bookmark = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/chapters/${id}/bookmark`, { page: Math.min(page, total - 1) })).json(),
    onSuccess: (d: any) => { setBm(d.bookmark); invalidatePrefixes("/api/series/by-slug"); toast({ title: d.bookmark === null ? "Bookmark removed" : `Bookmarked page ${Math.min(page, total - 1) + 1}` }); },
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-black"><div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading chapter" /></div>;
  if (error || !data) {
    const st = (error as any)?.status;
    if (st === 404) return <div className="min-h-screen bg-background text-foreground"><NotFoundView title="Chapter not found" message={(error as Error).message && !/not found/i.test((error as Error).message) ? (error as Error).message : "This chapter doesn't exist or isn't published yet."} /></div>;
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-muted-foreground" role="alert">
        <p>{st === 451 ? (error as Error).message : st === 404 ? (error as Error).message || "This chapter is not available." : "This chapter couldn't load. Check your connection."}</p>
        <div className="mt-4 flex justify-center gap-2">{st !== 404 && st !== 451 && <Button className="gap-1.5 rounded-full" onClick={() => refetch()}><RotateCw className="h-4 w-4" />Try again</Button>}<Link href="/"><Button variant="outline" className="rounded-full">Go home</Button></Link></div>
      </div>
    );
  }
  const { chapter: c, series: s, prev, next } = data;
  const shown = Math.min(page, total - 1);
  const atEnd = paged && page >= total;
  const light = prefs.bg === "sepia" || prefs.bg === "white";
  const bar = light ? "border-black/10 bg-white/70 text-neutral-900" : "border-white/10 bg-black/55 text-white";
  const iconBtn = `grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${light ? "hover:bg-black/10" : "hover:bg-white/10"}`;
  const maxW = prefs.fit === "original" ? "none" : `${Math.round(768 * (prefs.zoom / 100))}px`;
  const spread = prefs.mode === "double" ? [shown, shown + 1].filter((i) => i < total) : [shown];
  const ordered = rtl ? [...spread].reverse() : spread;

  const EndCard = (
    <div ref={endRef} className={`mx-4 mt-8 rounded-2xl border p-5 text-center ${light ? "border-black/10 bg-black/[0.04]" : "border-white/10 bg-white/[0.04]"}`} onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">End of episode {c.number}</p>
      <p className="font-display mt-1 text-xl font-semibold">{c.title}</p>
      {next ? (
        <>
          <Button size="lg" className="mt-4 w-full gap-2 rounded-full sm:w-auto" onClick={() => navigate(`/read/${next.id}`)} data-testid="button-next-episode">Next: Episode {next.number}<ChevronRight className="h-5 w-5" /></Button>
          {countdown !== null && <p className="mt-3 text-sm opacity-70" aria-live="polite">Opening next episode in {countdown}s · <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setCountdown(null)}>Cancel</button></p>}
        </>
      ) : <p className="mt-3 text-sm opacity-60">You're all caught up. Follow the series to hear about new episodes.</p>}
      {s.rights === "cc-by-4.0" && <p className="mt-4 text-xs opacity-50">{s.title} by {s.creator.displayName}, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY 4.0</a> · <a href="https://www.peppercarrot.com" target="_blank" rel="noreferrer" className="underline">peppercarrot.com</a></p>}
    </div>
  );

  return (
    <div className={`min-h-screen ${BG[prefs.bg]} ${light ? "" : "dark"}`}>
      {!paged && <motion.div className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary" style={{ scaleX: progress }} />}

      {/* Top bar */}
      <AnimatePresence>
        {chrome && (
          <motion.header initial={{ y: -72, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -72, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 36 }} className="fixed inset-x-0 top-0 z-40 px-2 pt-2">
            <div className={`mx-auto flex h-14 max-w-3xl items-center gap-1.5 rounded-2xl border px-2 shadow-2xl backdrop-blur-2xl ${bar}`}>
              <Link href={`/series/${s.slug}`} className={iconBtn} aria-label="Back to series" data-testid="button-reader-back"><ArrowLeft className="h-5 w-5" /></Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" data-testid="text-reader-series">{s.title}</p>
                <p className="truncate text-xs opacity-60" data-testid="text-reader-chapter">Ep. {c.number} · {c.title}</p>
              </div>
              <button onClick={toggleFull} className={`${iconBtn} max-sm:hidden`} aria-label={full ? "Exit full screen" : "Full screen"} data-testid="button-fullscreen">{full ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}</button>
              <button onClick={() => setSettingsOpen(true)} className={iconBtn} aria-label="Reader settings" data-testid="button-reader-settings"><Settings2 className="h-5 w-5" /></button>
              <button onClick={() => setListOpen(true)} className={iconBtn} aria-label="Episode list" data-testid="button-episode-list"><List className="h-5 w-5" /></button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Pages */}
      <main id="main" tabIndex={-1} className="outline-none" style={{ filter: prefs.brightness !== 100 ? `brightness(${prefs.brightness / 100})` : undefined }}>
        {!paged ? (
          <div className="mx-auto pb-6 pt-16" style={{ maxWidth: maxW }} onClick={() => setChrome((v) => !v)}>
            {c.pages.map((src, i) => (
              <PageImage key={src} index={i} src={src} eager={i < 3} alt={`${s.title} episode ${c.number}, page ${i + 1} of ${total}`} imgRef={(el) => (refs.current[i] = el)}
                className={`${prefs.gaps ? "mb-3" : ""} ${prefs.fit === "height" ? "flex h-screen items-center justify-center [&>img]:max-h-screen [&>img]:w-auto" : "[&>img]:w-full"}`} />
            ))}
            {EndCard}
          </div>
        ) : (
          <div className="relative h-[100dvh] overflow-hidden" aria-roledescription="page viewer" aria-label={`Page ${shown + 1} of ${total}`}>
            <AnimatePresence initial={false} custom={swipeDir} mode="popLayout">
              <motion.div key={atEnd ? "end" : `${prefs.mode}-${shown}`} custom={swipeDir}
                variants={{ enter: (d: number) => ({ x: `${(rtl ? -d : d) * 60}%`, opacity: 0 }), center: { x: 0, opacity: 1 }, leave: (d: number) => ({ x: `${(rtl ? d : -d) * 60}%`, opacity: 0 }) }} initial="enter" animate="center" exit="leave"
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                drag={atEnd ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
                onDragEnd={(_, i) => { if (i.offset.x < -60 || i.velocity.x < -400) rightTap(); else if (i.offset.x > 60 || i.velocity.x > 400) leftTap(); }}
                className={`absolute inset-0 flex items-center justify-center ${atEnd ? "overflow-y-auto pt-20" : "px-1 pt-[60px] pb-[76px]"}`}>
                {atEnd ? (
                  <div className="w-full max-w-3xl pb-24">
                    {EndCard}
                    <section className="mx-4 mt-8"><h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Episode {c.number} discussion</h2><Comments seriesId={s.id} chapterId={c.id} /></section>
                  </div>
                ) : (
                  <div className="flex h-full max-h-full items-center justify-center gap-0.5" style={{ transform: prefs.zoom !== 100 ? `scale(${prefs.zoom / 100})` : undefined, transformOrigin: "center" }}>
                    {ordered.map((i) => <PageImage key={c.pages[i]} index={i} src={c.pages[i]} eager alt={`${s.title} episode ${c.number}, page ${i + 1} of ${total}`} className={`h-full ${prefs.mode === "double" ? "max-w-[50vw]" : ""}`} />)}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {/* tap zones: left / centre (controls) / right */}
            {!atEnd && <div className="absolute inset-0 z-10 grid grid-cols-[1fr_1.2fr_1fr]" aria-hidden>
              <button tabIndex={-1} onClick={leftTap} className="cursor-w-resize" />
              <button tabIndex={-1} onClick={() => setChrome((v) => !v)} />
              <button tabIndex={-1} onClick={rightTap} className="cursor-e-resize" />
            </div>}
            {/* preload the next pages */}
            <div className="hidden" aria-hidden>{c.pages.slice(shown + step, shown + step * 3).map((p) => <img key={p} src={asset(p)} alt="" />)}</div>
          </div>
        )}

        {!paged && (
          <section className="mx-auto mt-8 max-w-3xl px-4 pb-24" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Episode {c.number} discussion</h2>
            <Comments seriesId={s.id} chapterId={c.id} />
          </section>
        )}
      </main>

      {/* Bottom bar */}
      <AnimatePresence>
        {chrome && (
          <motion.nav initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(env(safe-area-inset-bottom),8px)]" aria-label="Reader controls">
            <div className={`mx-auto flex h-16 max-w-3xl items-center gap-1.5 rounded-2xl border px-2 shadow-2xl backdrop-blur-2xl ${bar}`}>
              <button className={iconBtn} disabled={!prev} onClick={() => prev && navigate(`/read/${prev.id}`)} aria-label="Previous episode" data-testid="button-prev-episode"><ChevronLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1 px-1 text-center">
                <p className="text-xs tabular-nums opacity-70" data-testid="text-page-indicator">{atEnd ? "End of episode" : `Page ${shown + 1}${spread.length > 1 ? `–${spread[spread.length - 1] + 1}` : ""} / ${total}`}</p>
                {paged ? (
                  <input type="range" min={0} max={Math.max(0, total - 1)} step={step} value={Math.min(page, total - 1)} onChange={(e) => { const v = Number(e.target.value); setSwipeDir(v > page ? 1 : -1); setPage(v); }}
                    aria-label="Go to page" className="mt-1 w-full max-w-[260px] accent-[hsl(var(--primary))]" style={{ direction: rtl ? "rtl" : "ltr" }} />
                ) : (
                  <div className="mx-auto mt-1 h-1 max-w-[220px] overflow-hidden rounded-full bg-current/15" style={{ background: light ? "rgb(0 0 0 / .12)" : "rgb(255 255 255 / .15)" }}><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((shown + 1) / total) * 100}%` }} /></div>
                )}
              </div>
              <button className={`${iconBtn} ${bm === shown ? "text-primary" : ""}`} onClick={() => (user ? bookmark.mutate() : openAuth("login"))} aria-label="Bookmark this page" aria-pressed={bm === shown} data-testid="button-bookmark"><Bookmark className={`h-5 w-5 ${bm === shown ? "fill-current" : ""}`} /></button>
              <button className={iconBtn} onClick={() => setChrome(false)} aria-label="Hide controls (press H)" data-testid="button-hide-controls"><EyeOff className="h-5 w-5" /></button>
              <button className={iconBtn} disabled={!next} onClick={() => next && navigate(`/read/${next.id}`)} aria-label="Next episode" data-testid="button-next-bar"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Settings sheet */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSettingsOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="Reader settings" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[hsl(0_0%_7%)]/95 p-5 text-white backdrop-blur-2xl" data-testid="sheet-reader-settings">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Reader settings</h2><button onClick={() => setSettingsOpen(false)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button></div>
              <div className="space-y-4">
                <Segmented label="Layout" value={prefs.mode} onChange={(mode) => setPrefs({ mode })} options={[["vertical", "Vertical scroll"], ["single", "Single page"], ["double", "Two pages"]]} />
                <Segmented label="Direction" value={prefs.dir} onChange={(dir) => setPrefs({ dir })} options={[["ltr", "Left to right"], ["rtl", "Right to left (manga)"]]} />
                <Segmented label="Fit" value={prefs.fit} onChange={(fit) => setPrefs({ fit })} options={[["width", "Fit width"], ["height", "Fit screen"], ["original", "Original"]]} />
                <Segmented label="Background" value={prefs.bg} onChange={(bg) => setPrefs({ bg })} options={[["black", "Black"], ["dark", "Dark"], ["sepia", "Sepia"], ["white", "White"]]} />
                <div>
                  <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/50"><span>Zoom</span><span className="tabular-nums">{prefs.zoom}%</span></p>
                  <div className="flex items-center gap-2"><button className="rounded-full p-1.5 hover:bg-white/10" aria-label="Zoom out" onClick={() => setPrefs({ zoom: Math.max(50, prefs.zoom - 10) })}><ZoomOut className="h-4 w-4" /></button>
                    <input type="range" min={50} max={200} step={10} value={prefs.zoom} onChange={(e) => setPrefs({ zoom: Number(e.target.value) })} aria-label="Zoom" className="flex-1 accent-[hsl(var(--primary))]" />
                    <button className="rounded-full p-1.5 hover:bg-white/10" aria-label="Zoom in" onClick={() => setPrefs({ zoom: Math.min(200, prefs.zoom + 10) })}><ZoomIn className="h-4 w-4" /></button></div>
                </div>
                <div>
                  <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/50"><span>Brightness</span><span className="tabular-nums">{prefs.brightness}%</span></p>
                  <div className="flex items-center gap-2"><Sun className="h-4 w-4 opacity-50" /><input type="range" min={40} max={120} step={5} value={prefs.brightness} onChange={(e) => setPrefs({ brightness: Number(e.target.value) })} aria-label="Brightness" className="flex-1 accent-[hsl(var(--primary))]" /><Sun className="h-5 w-5" /></div>
                </div>
                {([["autoNext", "Auto-open next episode", "At the end of a chapter"], ["gaps", "Gaps between pages", "Vertical scroll only"]] as const).map(([k, l, h]) => (
                  <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                    <span><span className="block text-sm font-medium">{l}</span><span className="text-xs text-white/50">{h}</span></span>
                    <input type="checkbox" checked={prefs[k]} onChange={(e) => setPrefs({ [k]: e.target.checked } as any)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                  </label>
                ))}
                <p className="text-xs text-white/40">Keys: ← → turn pages · Space next · F full screen · H hide controls. Settings are saved on this device; your page is saved to your account.</p>
                <Button variant="secondary" className="w-full rounded-full" onClick={() => setPrefsState(() => { save("ms-reader", DEFAULT); return DEFAULT; })}>Reset to defaults</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Episode list drawer */}
      <AnimatePresence>
        {listOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)} />
            <motion.aside role="dialog" aria-label="Episodes" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 right-0 z-50 flex w-[86%] max-w-sm flex-col border-l border-white/10 bg-[hsl(0_0%_6%)]/95 text-white backdrop-blur-2xl" data-testid="drawer-episodes">
              <div className="flex items-center justify-between border-b border-white/10 p-4"><p className="font-semibold">Episodes</p><button onClick={() => setListOpen(false)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button></div>
              <ul className="flex-1 overflow-y-auto p-2">
                {detail.data?.chapters.map((ch) => (
                  <li key={ch.id}>
                    <Link href={`/read/${ch.id}`} onClick={() => setListOpen(false)} className={`flex items-center gap-3 rounded-lg p-2 ${ch.id === c.id ? "bg-primary/15" : "hover:bg-white/5"}`} data-testid={`drawer-chapter-${ch.number}`}>
                      {ch.thumb && <img src={asset(ch.thumb)} alt="" loading="lazy" className="h-10 w-14 rounded object-cover" />}
                      <div className="min-w-0 flex-1"><p className={`text-xs font-semibold ${ch.id === c.id ? "text-primary" : "text-white/60"}`}>Episode {ch.number}</p><p className="truncate text-sm">{ch.title}</p></div>
                      {ch.read && <Check className="h-4 w-4 text-emerald-500" aria-label="Read" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* bring controls back when hidden */}
      {!chrome && paged && <span className="sr-only" aria-live="polite">Controls hidden. Tap the middle of the screen or press H to show them.</span>}
    </div>
  );
}
