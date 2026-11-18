import { useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Star, Heart, Bookmark, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp, compact } from "@/lib/app-context";
import { TypeBadge } from "@/components/shared";
import type { WorldCard } from "@shared/world";

export const STATUS_LABEL: Record<string, string> = { ongoing: "Releasing", completed: "Completed", hiatus: "On hiatus", upcoming: "Upcoming", cancelled: "Cancelled" };

/** Poster with 3D tilt + glare on hover, and a staggered reveal. */
export function WorldPoster({ m, index = 0, size = "md", rank }: { m: WorldCard; index?: number; size?: "sm" | "md"; rank?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 250, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 250, damping: 20 });
  const glare = useTransform([mx, my] as any, ([x, y]: number[]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.28), transparent 55%)`);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = ref.current!.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height);
  };
  const reset = () => { mx.set(0.5); my.set(0.5); };
  return (
    <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.55, delay: Math.min(index, 10) * 0.045, ease: [0.16, 1, 0.3, 1] }} style={{ perspective: 800 }}>
      <Link href={`/title/${m.id}`} ref={ref} onPointerMove={onMove} onPointerLeave={reset} className="group block" data-testid={`card-world-${m.id}`}>
        <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} whileTap={{ scale: 0.97 }}
          className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg ring-1 ring-white/5 transition-shadow duration-300 group-hover:shadow-2xl"
        >
          <img src={m.cover} alt={`${m.title} cover`} loading="lazy" className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.07]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0" />
          <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glare }} />
          <div className="absolute left-2 top-2"><TypeBadge type={m.type} /></div>
          {rank && <span className="font-display absolute -left-1 bottom-0 text-6xl font-bold leading-none text-white/95 [text-shadow:0_4px_20px_rgba(0,0,0,.7)]">{rank}</span>}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 p-2 text-[11px] font-medium text-white/90">
            {!rank && m.official?.length ? <span className="mr-auto rounded-full bg-emerald-600/85 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur" title={`Official English: ${m.official.slice(0, 3).join(", ")}`} data-testid={`badge-official-${m.id}`}>Official EN</span> : null}
            {m.score ? <span className="flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 backdrop-blur"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{(m.score / 10).toFixed(1)}</span> : null}
          </div>
          <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" style={{ background: m.color ?? undefined }} />
        </motion.div>
        <h3 className={`mt-2 line-clamp-2 font-semibold leading-tight transition-colors group-hover:text-primary ${size === "sm" ? "text-[13px]" : "text-sm"}`}>{m.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.genres.slice(0, 2).join(" · ") || STATUS_LABEL[m.status]}</p>
      </Link>
    </motion.div>
  );
}

export function PosterSkel({ size = "md" }: { size?: "sm" | "md" }) {
  return <div><div className="shimmer relative aspect-[2/3] overflow-hidden rounded-xl bg-muted" /><div className={`mt-2 h-3.5 rounded bg-muted ${size === "sm" ? "w-3/4" : "w-4/5"}`} /></div>;
}

/** Horizontal rail with snap scrolling and arrow buttons on desktop. */
export function WorldRail({ title, kicker, icon: Icon, items, loading, ranked, action }: { title: string; kicker?: string; icon?: any; items?: WorldCard[]; loading?: boolean; ranked?: boolean; action?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">{Icon && <Icon className="h-3.5 w-3.5" />}{kicker}</p>}
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button onClick={() => scroll(-1)} className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-accent md:grid" aria-label="Scroll left"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-accent md:grid" aria-label="Scroll right"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6">
        {loading || !items ? Array.from({ length: 7 }).map((_, k) => <div key={k} className="w-32 shrink-0 sm:w-40"><PosterSkel /></div>)
          : items.map((m, k) => <div key={m.id} className={`rail-item shrink-0 snap-start ${ranked ? "w-36 pl-4 sm:w-44" : "w-32 sm:w-40"}`}><WorldPoster m={m} index={k} rank={ranked ? k + 1 : undefined} /></div>)}
      </div>
    </section>
  );
}

export function WorldLike({ id, liked, likes }: { id: number; liked: boolean; likes: number }) {
  const { user, openAuth } = useApp();
  const [st, setSt] = useState({ on: liked, n: likes });
  useEffect(() => setSt({ on: liked, n: likes }), [liked, likes]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/world/title/${id}/like`)).json(),
    onMutate: () => setSt((s) => ({ on: !s.on, n: s.n + (s.on ? -1 : 1) })),
    onSuccess: (d: any) => { setSt({ on: d.liked, n: d.likes }); invalidatePrefixes("/api/world/community"); },
  });
  return (
    <Button variant={st.on ? "default" : "outline"} className="gap-1.5 rounded-full" onClick={() => (user ? m.mutate() : openAuth("login"))} data-testid="button-world-like">
      <motion.span key={String(st.on)} initial={{ scale: 0.4 }} animate={{ scale: [1.4, 1] }} transition={{ duration: 0.35 }}><Heart className={`h-4 w-4 ${st.on ? "fill-current" : ""}`} /></motion.span>{compact(st.n)}
    </Button>
  );
}

export function WorldSave({ id, saved }: { id: number; saved: boolean }) {
  const { user, openAuth } = useApp();
  const [on, setOn] = useState(saved);
  useEffect(() => setOn(saved), [saved]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/world/title/${id}/save`)).json(),
    onMutate: () => setOn((v) => !v),
    onSuccess: (d: any) => { setOn(d.saved); invalidatePrefixes("/api/me/world"); },
  });
  return (
    <Button variant={on ? "secondary" : "outline"} className="gap-1.5 rounded-full" onClick={() => (user ? m.mutate() : openAuth("login"))} data-testid="button-world-save">
      <Bookmark className={`h-4 w-4 ${on ? "fill-current text-primary" : ""}`} />{on ? "Saved" : "Save"}
    </Button>
  );
}

export { BookOpen };
