import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Loader2, Lock, X, Eye, EyeOff, Clock, Coins, MessageCircle } from "lucide-react";
import { Comments } from "@/pages/series";
import NotFound, { LoadError, isNotFound } from "@/pages/not-found";
import { safeDecode } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp } from "@/lib/app-context";
import type { WorldDetail, WorldChapters } from "@shared/world";

/** Stable positive 31-bit id for a publisher chapter key, so comments can be filed per chapter. */
export const chapterNum = (k: string) => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(31, h) + k.charCodeAt(i)) | 0; return (h & 0x7fffffff) || 1; };

// Hosts that serve the app inside a strict sandbox (no same-origin) pass that sandbox to embedded readers, which then can't start.
const SANDBOXED = typeof window !== "undefined" && window.origin === "null"; // opaque origin = sandbox without same-origin

export default function OfficialReader() {
  const { id, key: rawKey } = useParams<{ id: string; key: string }>();
  const key = safeDecode(rawKey);
  const [, nav] = useLocation();
  const { user } = useApp();
  const t = useQuery<WorldDetail>({ queryKey: [`/api/world/title/${id}`] });
  const ch = useQuery<WorldChapters>({ queryKey: [`/api/world/title/${id}/chapters`] });
  const [loaded, setLoaded] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [talk, setTalk] = useState(false);

  const all = ch.data?.chapters ?? [];
  const readable = all.filter((c) => c.inApp);
  const idx = readable.findIndex((c) => c.key === key);
  const cur = readable[idx];
  const prev = idx > 0 ? readable[idx - 1] : undefined;
  const next = idx >= 0 ? readable[idx + 1] : undefined;
  const go = (k: string) => nav(`/mp/${id}/${encodeURIComponent(k)}`, { replace: true });

  useEffect(() => { setLoaded(false); }, [key]);
  useEffect(() => {
    if (!user || !cur) return;
    apiRequest("POST", `/api/world/title/${id}/read`, { chapter: cur.key }).then(() => invalidatePrefixes("/api/me/world", "/api/me/stats", `/api/world/title/${id}`)).catch(() => {});
  }, [user, cur?.key, id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") nav(`/title/${id}`); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  const [ui, setUi] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && next) go(next.key);
      if (e.key === "ArrowLeft" && prev) go(prev.key);
      if (e.key.toLowerCase() === "h") setUi((v) => !v);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [next?.key, prev?.key]);
  const access = cur?.access === "wait" ? "Wait-free on " + (cur.publisher ?? "publisher") : cur?.access === "coins" ? "Unlock with " + (cur.publisher ?? "publisher") + " coins" : cur ? "Free · " + (cur.publisher ?? "Official") : "";

  if (t.error) return isNotFound(t.error) ? <NotFound what="title" /> : <LoadError message={(t.error as Error).message} onRetry={() => { t.refetch(); ch.refetch(); }} />;

  return (
    <div className="fixed inset-0 bg-black text-white">
      <div className="absolute inset-0">
        {cur?.src && SANDBOXED ? (
          <div className="grid h-full place-items-center p-6 text-center" data-testid="notice-sandboxed">
            <div className="max-w-sm"><Lock className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">This preview link can't load the publisher's reader</p>
              <p className="mt-2 text-sm text-white/60">The official reader for Chapter {cur.number} opens inside MANGASALT when the app runs on its own domain. This private preview host blocks it for security.</p>
              <Button className="mt-4 rounded-full" onClick={() => nav(`/title/${id}`)}>Back to chapters</Button></div>
          </div>
        ) : cur?.src ? (
          <>
            <iframe key={cur.key} src={cur.src} title={`${t.data?.title ?? ""} chapter ${cur.number}`} onLoad={() => setLoaded(true)}
              className="h-full w-full border-0 pb-[72px] pt-[60px]" allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin" data-testid="iframe-official-reader" />
            <AnimatePresence>
              {!loaded && (
                <motion.div exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-black">
                  <div className="flex flex-col items-center gap-3 text-white/70"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm">Opening official chapter</p></div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : !ch.isLoading && (
          <div className="grid h-full place-items-center p-6 text-center">
            <div><Lock className="mx-auto h-8 w-8 text-white/50" /><p className="mt-3 font-semibold">This chapter can't be read in the app</p>
              <Button className="mt-4 rounded-full" onClick={() => nav(`/title/${id}`)}>Back to chapters</Button></div>
          </div>
        )}
      </div>

      {/* floating transparent controls */}
      <AnimatePresence>
        {ui && (
          <motion.header key="h" initial={{ y: -70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -70, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-x-0 top-0 z-20 flex h-[60px] items-center gap-2 bg-gradient-to-b from-black/70 to-black/10 px-3">
            <button onClick={() => nav(`/title/${id}`)} className="glass-btn grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/20 active:scale-90" aria-label="Back to title" data-testid="button-reader-back"><ArrowLeft className="h-5 w-5" /></button>
            <div className="glass-btn min-w-0 flex-1 rounded-full px-4 py-1.5">
              <p className="truncate text-[13px] font-semibold leading-tight" data-testid="text-reader-title">{t.data?.title ?? "Loading…"}</p>
              <p className="truncate text-[11px] leading-tight text-white/65">{cur ? `Ch. ${cur.number}${cur.title ? ` · ${cur.title}` : ""} · ${access}` : ch.isLoading ? "Loading chapter…" : "Chapter unavailable"}</p>
            </div>
            {cur && <button onClick={() => setTalk(true)} className="glass-btn grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/20 active:scale-90" aria-label="Chapter comments" data-testid="button-reader-comments"><MessageCircle className="h-5 w-5" /></button>}
            <button onClick={() => setDrawer(true)} className="glass-btn grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/20 active:scale-90" aria-label="Chapters" data-testid="button-reader-chapters"><List className="h-5 w-5" /></button>
          </motion.header>
        )}
      </AnimatePresence>

      <motion.footer animate={{ y: ui ? 0 : 56 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="glass-btn flex w-full max-w-md items-center gap-1.5 rounded-full p-1.5 shadow-2xl">
          <button disabled={!prev} onClick={() => prev && go(prev.key)} className="flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition hover:bg-white/15 active:scale-95 disabled:opacity-30" data-testid="button-prev-chapter"><ChevronLeft className="h-4 w-4" />Prev</button>
          <button onClick={() => setUi((v) => !v)} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-xs text-white/70 transition hover:bg-white/10" data-testid="button-toggle-ui">
            {ui ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{idx >= 0 ? `${idx + 1} / ${readable.length}` : ""}
          </button>
          {next ? (
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => go(next.key)} className="flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/40" data-testid="button-next-chapter">Next {next.number}<ChevronRight className="h-4 w-4" /></motion.button>
          ) : (
            <button onClick={() => nav(`/title/${id}`)} className="flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-semibold" data-testid="button-finish">Finish</button>
          )}
        </div>
      </motion.footer>

      <AnimatePresence>
        {talk && cur && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTalk(false)} />
            <motion.aside className="dark fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-neutral-950/90 text-foreground backdrop-blur-2xl" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} data-testid="panel-chapter-comments">
              <div className="flex items-center justify-between border-b border-white/10 p-4"><p className="font-semibold">Chapter {cur.number} comments</p><button onClick={() => setTalk(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <div className="flex-1 overflow-y-auto px-4 pb-6"><Comments seriesId={-Number(id)} chapterId={chapterNum(cur.key)} base={`/api/world/title/${id}/comments`} /></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="fixed inset-y-0 right-0 z-40 flex w-[86%] max-w-sm flex-col border-l border-white/10 bg-neutral-950/80 backdrop-blur-2xl" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
              <div className="flex items-center justify-between border-b border-white/10 p-4"><p className="font-semibold">Chapters</p><button onClick={() => setDrawer(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <ul className="flex-1 overflow-y-auto p-2">
                {all.map((c) => (
                  <li key={c.key}>
                    <button disabled={!c.inApp} onClick={() => { go(c.key); setDrawer(false); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${c.key === key ? "bg-primary/20 text-primary" : c.inApp ? "hover:bg-white/5" : "cursor-not-allowed opacity-40"}`} data-testid={`drawer-chapter-${c.key}`}>
                      <span className="w-10 shrink-0 font-bold">{c.number}</span><span className="min-w-0 flex-1 truncate">{c.title || `Chapter ${c.number}`}</span>{!c.inApp ? <Lock className="h-3.5 w-3.5" /> : c.access === "wait" ? <Clock className="h-3.5 w-3.5 text-sky-300" /> : c.access === "coins" ? <Coins className="h-3.5 w-3.5 text-amber-300" /> : <span className="text-[10px] font-bold uppercase text-emerald-400">Free</span>}
                    </button>
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
