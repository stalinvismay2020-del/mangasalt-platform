import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Loader2, Lock, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp } from "@/lib/app-context";
import type { WorldDetail, WorldChapters } from "@shared/world";

export default function OfficialReader() {
  const { id, key: rawKey } = useParams<{ id: string; key: string }>();
  const key = decodeURIComponent(rawKey);
  const [, nav] = useLocation();
  const { user } = useApp();
  const t = useQuery<WorldDetail>({ queryKey: [`/api/world/title/${id}`] });
  const ch = useQuery<WorldChapters>({ queryKey: [`/api/world/title/${id}/chapters`] });
  const [loaded, setLoaded] = useState(false);
  const [drawer, setDrawer] = useState(false);

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
    apiRequest("POST", `/api/world/title/${id}/read`, { chapter: cur.key }).then(() => invalidatePrefixes("/api/me/world", `/api/world/title/${id}`)).catch(() => {});
  }, [user, cur?.key, id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") nav(`/title/${id}`); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/90 px-3 backdrop-blur">
        <button onClick={() => nav(`/title/${id}`)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to title" data-testid="button-reader-back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" data-testid="text-reader-title">{t.data?.title ?? "Loading…"}</p>
          <p className="truncate text-xs text-white/60">{cur ? `Chapter ${cur.number}${cur.title ? ` · ${cur.title}` : ""}` : ch.isLoading ? "Loading chapter…" : "Chapter unavailable"}</p>
        </div>
        <button onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Chapters" data-testid="button-reader-chapters"><List className="h-5 w-5" /></button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {cur?.src ? (
          <>
            <iframe key={cur.key} src={cur.src} title={`${t.data?.title ?? ""} chapter ${cur.number}`} onLoad={() => setLoaded(true)}
              className="h-full w-full border-0" allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin" data-testid="iframe-official-reader" />
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

      <footer className="z-20 flex h-14 shrink-0 items-center gap-2 border-t border-white/10 bg-black/90 px-3 backdrop-blur">
        <Button variant="ghost" size="sm" disabled={!prev} onClick={() => prev && go(prev.key)} className="gap-1 rounded-full text-white hover:bg-white/10 hover:text-white" data-testid="button-prev-chapter"><ChevronLeft className="h-4 w-4" />Prev</Button>
        <p className="flex-1 truncate text-center text-xs text-white/60">{idx >= 0 ? `${idx + 1} of ${readable.length} in-app chapters` : ""}</p>
        <button onClick={() => nav(`/title/${id}`)} className="hidden h-9 items-center gap-1 rounded-full px-3 text-xs text-white/70 hover:bg-white/10 sm:flex"><MessageCircle className="h-4 w-4" />Discuss</button>
        {next ? (
          <Button size="sm" onClick={() => go(next.key)} className="gap-1 rounded-full" data-testid="button-next-chapter">Next Ch. {next.number}<ChevronRight className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => nav(`/title/${id}`)} className="rounded-full" data-testid="button-finish">Finish</Button>
        )}
      </footer>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="fixed inset-y-0 right-0 z-40 flex w-[86%] max-w-sm flex-col bg-neutral-950" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
              <div className="flex items-center justify-between border-b border-white/10 p-4"><p className="font-semibold">Chapters</p><button onClick={() => setDrawer(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <ul className="flex-1 overflow-y-auto p-2">
                {all.map((c) => (
                  <li key={c.key}>
                    <button disabled={!c.inApp} onClick={() => { go(c.key); setDrawer(false); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${c.key === key ? "bg-primary/20 text-primary" : c.inApp ? "hover:bg-white/5" : "cursor-not-allowed opacity-40"}`} data-testid={`drawer-chapter-${c.key}`}>
                      <span className="w-10 shrink-0 font-bold">{c.number}</span><span className="min-w-0 flex-1 truncate">{c.title || `Chapter ${c.number}`}</span>{!c.inApp && <Lock className="h-3.5 w-3.5" />}
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
