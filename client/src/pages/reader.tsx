import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Settings2, Maximize, Minimize, ZoomIn, ZoomOut, Loader2, RotateCw, Lock, MessageSquare, X, ListOrdered, CloudOff, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useApp, type ReaderPrefs } from "@/lib/app-context";
import { getHosted, getHostedChapters, getProgress, saveProgress, recordView, hostedKey, type HostedChapter } from "@/lib/data";
import { pageUrl, storage, errMsg } from "@/lib/supabase";
import { formatNumber } from "@/lib/chapter-search";
import { queryClient } from "@/lib/queryClient";
import { useHashQuery, setHashQuery } from "@/lib/hash-query";
import { InlineError } from "@/components/shared";
import { Discussion } from "@/components/discussion";
import NotFound from "@/pages/not-found";

function clientId(): string {
  const k = "mangasalt.client";
  try {
    let v = storage.getItem(k);
    if (!v || v.length < 8) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); storage.setItem(k, v); }
    return v;
  } catch { return "anon-" + Math.random().toString(36).slice(2, 14); }
}

type SaveState = "idle" | "saving" | "saved" | "error" | "guest";

export default function Reader({ params }: { params: { slug: string; number: string } }) {
  const { user, prefs, setPrefs, openAuth } = useApp();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const hq = useHashQuery();
  const num = Number(params.number);

  const s = useQuery({ queryKey: ["hosted", params.slug], queryFn: () => getHosted(params.slug) });
  const ch = useQuery({ queryKey: ["hosted-chapters", s.data?.id], queryFn: () => getHostedChapters(s.data!.id), enabled: !!s.data });
  const chapters = ch.data ?? [];
  const idx = chapters.findIndex((c) => c.number === num);
  const chapter: HostedChapter | undefined = chapters[idx];
  const prev = idx > 0 ? chapters[idx - 1] : undefined;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : undefined;
  const pages = useMemo(() => (chapter?.pages ?? []).map((p) => pageUrl(p)!).filter(Boolean), [chapter]);
  const total = pages.length;

  const [page, setPage] = useState(0);          // 0-based; === total means end panel (paged)
  const [chrome, setChrome] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fs, setFs] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [showComments, setShowComments] = useState(false);
  const resumed = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const vertical = prefs.mode === "vertical";

  // ---- initial page: ?p= wins, else saved progress for this chapter ----
  useEffect(() => {
    if (!chapter || resumed.current === chapter.id) return;
    let alive = true;
    (async () => {
      const p = Number(hq.get("p"));
      let start = Number.isFinite(p) && p >= 1 ? Math.min(p - 1, Math.max(0, total - 1)) : 0;
      if (!(p >= 1) && user) {
        try {
          const pr = await getProgress(user.id, hostedKey(params.slug));
          if (pr && pr.chapter_key === String(chapter.number) && pr.page > 0 && pr.page < total) {
            start = pr.page;
            toast({ title: `Resumed at page ${pr.page + 1}`, description: `${pr.chapter_label}` });
          }
        } catch (e) { console.warn("[reader] resume lookup", errMsg(e)); }
      }
      if (!alive) return;
      resumed.current = chapter.id;
      setPage(start);
      if (vertical) requestAnimationFrame(() => setTimeout(() => imgRefs.current[start]?.scrollIntoView({ block: "start" }), 60));
      else window.scrollTo({ top: 0 });
    })();
    return () => { alive = false; };
  }, [chapter?.id, total, user?.id]); // eslint-disable-line

  // ---- record a view once per chapter ----
  useEffect(() => { if (chapter && total) recordView(chapter.id, clientId()); }, [chapter?.id]); // eslint-disable-line

  // ---- vertical: track the current page via IntersectionObserver ----
  useEffect(() => {
    if (!vertical || !total) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      // At the very top the first page counts even if it's shorter than half the screen.
      if (window.scrollY < 24) { setPage(0); return; }
      if (vis[0]) setPage(Number((vis[0].target as HTMLElement).dataset.index));
    }, { rootMargin: "-45% 0px -45% 0px" });
    imgRefs.current.slice(0, total).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [vertical, total, chapter?.id]);

  // ---- auto-save (debounced) ----
  const lastSaved = useRef<string>("");
  const doSave = useCallback(async (pg: number) => {
    if (!s.data || !chapter || !total) return;
    if (!user) { setSave("guest"); return; }
    const p = Math.min(Math.max(pg, 0), total - 1);
    const sig = `${chapter.id}:${p}`;
    if (sig === lastSaved.current) return;
    setSave("saving");
    try {
      await saveProgress(user.id, {
        series_key: hostedKey(s.data.slug), series_title: s.data.title, cover: pageUrl(s.data.cover_path), chapter_key: String(chapter.number),
        chapter_label: `Chapter ${formatNumber(chapter.number)}`, chapter_number: chapter.number, page: p, total_pages: total,
        href: `/read/${s.data.slug}/${chapter.number}?p=${p + 1}`, series_id: s.data.id, chapter_id: chapter.id,
      });
      lastSaved.current = sig; setSave("saved");
      queryClient.invalidateQueries({ queryKey: ["progress"] }); queryClient.invalidateQueries({ queryKey: ["reads"] }); queryClient.invalidateQueries({ queryKey: ["history"] });
    } catch (e) { console.error("[reader] save failed", e); setSave("error"); }
  }, [user, s.data, chapter, total]);
  useEffect(() => {
    if (resumed.current !== chapter?.id) return;
    const t = setTimeout(() => doSave(page), 1200);
    return () => clearTimeout(t);
  }, [page, doSave, chapter?.id]);

  // ---- keep ?p= in sync (replace, no history spam) ----
  useEffect(() => { if (resumed.current === chapter?.id && total) setHashQuery({ p: String(Math.min(page, total - 1) + 1) }); }, [page, total, chapter?.id]);

  // ---- paged navigation ----
  const go = useCallback((delta: number) => {
    if (vertical) return;
    setPage((p) => {
      const n = p + delta;
      if (n < 0) { if (prev) nav(`/read/${params.slug}/${prev.number}?p=${prev.pages.length}`); return p; }
      if (n > total) { if (next) nav(`/read/${params.slug}/${next.number}`); return p; }
      return n;
    });
    setZoom(1);
  }, [vertical, total, prev, next, params.slug, nav]);
  const forward = () => go(prefs.dir === "rtl" ? -1 : 1), backward = () => go(prefs.dir === "rtl" ? 1 : -1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); prefs.dir === "rtl" ? go(-1) : go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prefs.dir === "rtl" ? go(1) : go(-1); }
      else if (e.key === "f") toggleFs();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
      else if (e.key === "-") setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prefs.dir]); // eslint-disable-line

  // preload next pages in paged mode
  useEffect(() => { if (!vertical) pages.slice(page + 1, page + 3).forEach((u) => { const i = new Image(); i.src = u; }); }, [page, vertical, pages]);

  // fullscreen
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const toggleFs = () => {
    if (!document.fullscreenEnabled) { toast({ title: "Fullscreen isn't available here", description: "Your browser or this embedded view blocks fullscreen." }); return; }
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch((e) => toast({ title: "Fullscreen failed", description: errMsg(e), variant: "destructive" }));
  };

  // save on leave / chapter switch (uses refs so the latest page is saved)
  // Refs are written in an effect so cleanup still sees the previous chapter's values.
  const pageRef = useRef(page);
  const latest = useRef<{ save: typeof doSave; page: number; ready: boolean }>({ save: doSave, page, ready: false });
  useEffect(() => { pageRef.current = page; latest.current = { save: doSave, page, ready: resumed.current === chapter?.id }; });
  useEffect(() => () => { const l = latest.current; if (l.ready) void l.save(l.page); }, [chapter?.id]);

  // switching paged → vertical: keep the reader on the same page
  useEffect(() => { if (vertical && resumed.current === chapter?.id) requestAnimationFrame(() => imgRefs.current[Math.min(pageRef.current, total - 1)]?.scrollIntoView({ block: "start" })); }, [vertical]); // eslint-disable-line

  // touch swipe for paged mode
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (s.error || ch.error) return <div className="mx-auto max-w-lg px-4 py-16"><InlineError error={s.error ?? ch.error} onRetry={() => { s.refetch(); ch.refetch(); }} title="Couldn't open this chapter" /></div>;
  if (s.isLoading || (s.data && ch.isLoading)) return <div className="grid min-h-[100dvh] place-items-center bg-black text-white/70" aria-busy><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!s.data) return <NotFound what="series" />;
  if (!Number.isFinite(num) || !chapter) return <NotFound what="chapter" />;

  const seriesHref = `/series/${s.data.slug}`;
  const label = `Chapter ${formatNumber(chapter.number)}`;
  const shown = Math.min(page, Math.max(total - 1, 0));
  const pct = total ? ((shown + 1) / total) * 100 : 0;

  const fitCls = (fit: ReaderPrefs["fit"]) =>
    fit === "height" ? "max-h-[100dvh] w-auto max-w-full" : fit === "original" ? "max-w-none" : "w-full";

  const NextPanel = (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 text-white" data-testid="panel-chapter-end">
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-primary">End of {label}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {prev && <Button variant="secondary" className="rounded-full" onClick={() => nav(`/read/${params.slug}/${prev.number}`)} data-testid="button-end-prev"><ChevronLeft className="mr-1 h-4 w-4" />Chapter {formatNumber(prev.number)}</Button>}
        {next ? <Button className="glow-primary rounded-full" onClick={() => nav(`/read/${params.slug}/${next.number}`)} data-testid="button-end-next">Next: Chapter {formatNumber(next.number)}<ChevronRight className="ml-1 h-4 w-4" /></Button>
          : <Button variant="secondary" className="rounded-full" onClick={() => nav(seriesHref)} data-testid="button-end-series">You're caught up · Back to series</Button>}
      </div>
      <div className="mt-10 rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10 dark">
        <div className="text-foreground"><Discussion target={{ seriesId: s.data.id, chapterKey: String(chapter.number), chapterId: chapter.id }} chapterFilter={String(chapter.number)} title={`${label} comments`} compactHead /></div>
      </div>
    </div>
  );

  return (
    <div className="dark min-h-[100dvh] bg-[#0b0b0d] text-white">
      {/* top bar */}
      <AnimatePresence>
        {chrome && (
          <motion.header initial={{ y: -64 }} animate={{ y: 0 }} exit={{ y: -64 }} transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/75 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4">
              <Link href={seriesHref} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="Back to series" data-testid="button-reader-back"><ArrowLeft className="h-5 w-5" /></Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" data-testid="text-reader-series">{s.data.title}</p>
                <label className="relative flex items-center gap-1 text-xs text-white/60">
                  <ListOrdered className="h-3 w-3" />
                  <select value={chapter.number} onChange={(e) => nav(`/read/${params.slug}/${e.target.value}`)} className="max-w-[60vw] cursor-pointer appearance-none truncate bg-transparent pr-3 font-medium text-white/80 outline-none" aria-label="Choose chapter" data-testid="select-chapter">
                    {chapters.map((c) => <option key={c.id} value={c.number} className="bg-neutral-900">Chapter {formatNumber(c.number)}{c.title ? ` · ${c.title}` : ""}</option>)}
                  </select>
                </label>
              </div>
              <SaveBadge state={save} onSignIn={() => openAuth("login")} onRetry={() => { lastSaved.current = ""; doSave(page); }} />
              <button onClick={() => setShowComments(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Chapter comments" data-testid="button-reader-comments"><MessageSquare className="h-5 w-5" /></button>
              <button onClick={toggleFs} className="hidden h-10 w-10 place-items-center rounded-full hover:bg-white/10 sm:grid" aria-label={fs ? "Exit fullscreen" : "Fullscreen"} data-testid="button-fullscreen">{fs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}</button>
              <ReaderSettings prefs={prefs} setPrefs={setPrefs} zoom={zoom} setZoom={setZoom} fs={fs} toggleFs={toggleFs} />
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* pages */}
      {total === 0 ? (
        <div className="grid min-h-[100dvh] place-items-center px-6 text-center" data-testid="status-chapter-unavailable">
          <div><Lock className="mx-auto h-8 w-8 text-white/50" /><h1 className="font-display mt-3 text-2xl font-semibold">{label} isn't available</h1><p className="mt-2 text-sm text-white/60">No authorised pages have been uploaded for this chapter.</p>
            <Button className="mt-5 rounded-full" onClick={() => nav(seriesHref)}>Back to series</Button></div>
        </div>
      ) : vertical ? (
        <div ref={scroller} className="pb-24 pt-14" onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a,select,input,textarea,[role=dialog]")) setChrome((c) => !c); }}>
          <div className={`mx-auto flex flex-col items-center ${prefs.gap ? "gap-3" : ""}`} style={{ width: prefs.fit === "original" ? undefined : `min(100%, ${48 * zoom}rem)` }}>
            {pages.map((u, i) => (
              <div key={u} ref={(el) => (imgRefs.current[i] = el)} data-index={i} className="w-full scroll-mt-14">
                <PageImage src={u} index={i} total={total} eager={i < 2} className={fitCls(prefs.fit === "height" ? "width" : prefs.fit)} />
              </div>
            ))}
          </div>
          {NextPanel}
        </div>
      ) : (
        <div className="relative flex min-h-[100dvh] select-none items-center justify-center overflow-auto pt-14"
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const t = touch.current; touch.current = null; if (!t || zoom !== 1) return;
            const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? forward() : backward();
          }}>
          {page >= total ? <div className="w-full self-start">{NextPanel}</div> : (
            <>
              {/* Above the tap zones; transparent to taps at 100% zoom (so zones work), capturing when zoomed (so panning works). */}
              <div className={`relative z-20 flex w-full justify-center overflow-auto ${zoom === 1 ? "pointer-events-none" : ""}`} style={{ maxHeight: prefs.fit === "height" ? "calc(100dvh - 3.5rem)" : undefined }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform .2s" }} className={prefs.fit === "width" ? "w-full max-w-3xl" : ""}>
                  <PageImage key={pages[page]} src={pages[page]} index={page} total={total} eager className={prefs.fit === "height" ? "max-h-[calc(100dvh-3.5rem)] w-auto" : fitCls(prefs.fit)} />
                </div>
              </div>
              {/* tap zones: left / centre / right */}
              <button className="absolute inset-y-0 left-0 z-10 w-[30%] cursor-w-resize" aria-label={prefs.dir === "rtl" ? "Next page" : "Previous page"} onClick={() => (prefs.dir === "rtl" ? go(1) : go(-1))} data-testid="zone-left" />
              <button className="absolute inset-y-0 left-[30%] z-10 w-[40%]" aria-label="Toggle controls" onClick={() => setChrome((c) => !c)} data-testid="zone-center" />
              <button className="absolute inset-y-0 right-0 z-10 w-[30%] cursor-e-resize" aria-label={prefs.dir === "rtl" ? "Previous page" : "Next page"} onClick={() => (prefs.dir === "rtl" ? go(-1) : go(1))} data-testid="zone-right" />
            </>
          )}
        </div>
      )}

      {/* bottom bar */}
      <AnimatePresence>
        {chrome && total > 0 && (
          <motion.footer initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/80 backdrop-blur-xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 py-2 sm:px-4">
              <Button size="icon" variant="ghost" className="shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white" disabled={!prev} onClick={() => prev && nav(`/read/${params.slug}/${prev.number}`)} aria-label="Previous chapter" data-testid="button-prev-chapter"><ChevronLeft className="h-5 w-5" /></Button>
              <div className={`flex flex-1 items-center gap-3 ${prefs.dir === "rtl" && !vertical ? "flex-row-reverse" : ""}`}>
                <span className="w-14 shrink-0 text-center text-xs tabular-nums text-white/70" data-testid="text-page-indicator">{shown + 1} / {total}</span>
                <Slider value={[shown + 1]} min={1} max={total} step={1} inverted={prefs.dir === "rtl" && !vertical} aria-label="Page"
                  onValueChange={([v]) => { const p = v - 1; setPage(p); if (vertical) imgRefs.current[p]?.scrollIntoView({ block: "start" }); }} className="flex-1" data-testid="slider-page" />
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/50">{Math.round(pct)}%</span>
              </div>
              <Button size="icon" variant="ghost" className="shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white" disabled={!next} onClick={() => next && nav(`/read/${params.slug}/${next.number}`)} aria-label="Next chapter" data-testid="button-next-chapter"><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
      {/* thin progress line when chrome hidden */}
      {!chrome && total > 0 && <div className="fixed inset-x-0 bottom-0 z-40 h-0.5 bg-white/10"><div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div>}

      {/* comments drawer */}
      <AnimatePresence>
        {showComments && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowComments(false)} role="dialog" aria-modal aria-label="Chapter comments">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={(e) => e.stopPropagation()}
              className="dark max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-4 text-foreground sm:rounded-3xl">
              <div className="mb-2 flex justify-end"><button onClick={() => setShowComments(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close comments" data-testid="button-close-comments"><X className="h-5 w-5" /></button></div>
              <Discussion target={{ seriesId: s.data.id, chapterKey: String(chapter.number), chapterId: chapter.id }} chapterFilter={String(chapter.number)} title={`${label} comments`} compactHead />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SaveBadge({ state, onSignIn, onRetry }: { state: SaveState; onSignIn: () => void; onRetry: () => void }) {
  if (state === "guest") return <button onClick={onSignIn} className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/15 sm:block" data-testid="button-save-signin">Sign in to save progress</button>;
  if (state === "error") return <button onClick={onRetry} className="flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-1 text-[11px] text-red-300" data-testid="button-save-retry"><CloudOff className="h-3 w-3" />Not saved · retry</button>;
  if (state === "saving") return <span className="flex items-center gap-1 text-[11px] text-white/50" aria-live="polite"><Loader2 className="h-3 w-3 animate-spin" />Saving</span>;
  if (state === "saved") return <span className="flex items-center gap-1 text-[11px] text-white/50" aria-live="polite" data-testid="text-saved"><Check className="h-3 w-3" />Saved</span>;
  return null;
}

/** One page image with its own loading indicator and retry. */
function PageImage({ src, index, total, eager, className }: { src: string; index: number; total: number; eager?: boolean; className: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;
  return (
    <div className={`relative mx-auto ${state !== "ok" ? "min-h-[60vh] w-full" : ""}`} data-testid={`page-${index + 1}`}>
      {state === "loading" && <div className="absolute inset-0 grid place-items-center text-white/40" aria-label={`Loading page ${index + 1}`}><div className="flex flex-col items-center gap-2"><Loader2 className="h-6 w-6 animate-spin" /><span className="text-xs">Page {index + 1} of {total}</span></div></div>}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center" role="alert" data-testid={`page-error-${index + 1}`}>
          <div className="pointer-events-auto"><p className="text-sm text-white/70">Page {index + 1} didn't load.</p>
            <Button size="sm" variant="secondary" className="mt-3 gap-1.5 rounded-full" onClick={() => { setState("loading"); setAttempt((a) => a + 1); }} data-testid={`button-retry-page-${index + 1}`}><RotateCw className="h-3.5 w-3.5" />Retry</Button></div>
        </div>
      ) : (
        <img src={url} alt={`Page ${index + 1} of ${total}`} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false}
          onLoad={() => setState("ok")} onError={() => setState("error")}
          className={`mx-auto block select-none ${className} ${state === "ok" ? "opacity-100" : "opacity-0"} transition-opacity duration-300`} />
      )}
    </div>
  );
}

function ReaderSettings({ prefs, setPrefs, zoom, setZoom, fs, toggleFs }: { prefs: ReaderPrefs; setPrefs: (p: Partial<ReaderPrefs>) => void; zoom: number; setZoom: (z: number) => void; fs: boolean; toggleFs: () => void }) {
  const Opt = <K extends keyof ReaderPrefs>({ k, v, children }: { k: K; v: ReaderPrefs[K]; children: React.ReactNode }) => (
    <button onClick={() => setPrefs({ [k]: v } as Partial<ReaderPrefs>)} aria-pressed={prefs[k] === v} data-testid={`opt-${String(k)}-${String(v)}`}
      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${prefs[k] === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{children}</button>
  );
  return (
    <Popover>
      <PopoverTrigger asChild><button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Reader settings" data-testid="button-reader-settings"><Settings2 className="h-5 w-5" /></button></PopoverTrigger>
      <PopoverContent align="end" className="dark w-72 space-y-3 rounded-2xl text-foreground">
        <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Layout</p><div className="flex gap-1.5"><Opt k="mode" v="vertical">Vertical scroll</Opt><Opt k="mode" v="paged">Page by page</Opt></div></div>
        <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Reading direction</p><div className="flex gap-1.5"><Opt k="dir" v="ltr">Left → right</Opt><Opt k="dir" v="rtl">Right → left</Opt></div></div>
        <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Fit</p><div className="flex gap-1.5"><Opt k="fit" v="width">Width</Opt><Opt k="fit" v="height">Height</Opt><Opt k="fit" v="original">Original</Opt></div></div>
        {prefs.mode === "vertical" && <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Page gaps</p><div className="flex gap-1.5"><Opt k="gap" v={false}>Seamless</Opt><Opt k="gap" v={true}>Gaps</Opt></div></div>}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Zoom · {Math.round(zoom * 100)}%</p>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => setZoom(Math.max(0.5, +(zoom - 0.25).toFixed(2)))} aria-label="Zoom out" data-testid="button-zoom-out"><ZoomOut className="h-4 w-4" /></Button>
            <Slider value={[zoom]} min={0.5} max={3} step={0.25} onValueChange={([v]) => setZoom(v)} aria-label="Zoom" className="flex-1" />
            <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => setZoom(Math.min(3, +(zoom + 0.25).toFixed(2)))} aria-label="Zoom in" data-testid="button-zoom-in"><ZoomIn className="h-4 w-4" /></Button>
          </div>
          {zoom !== 1 && <button onClick={() => setZoom(1)} className="mt-1 text-xs text-primary" data-testid="button-zoom-reset">Reset zoom</button>}
        </div>
        <Button variant="outline" className="w-full gap-2 rounded-full sm:hidden" onClick={toggleFs} data-testid="button-fullscreen-mobile">{fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}{fs ? "Exit fullscreen" : "Fullscreen"}</Button>
      </PopoverContent>
    </Popover>
  );
}
