// Shared motion pieces: ambient backdrop, floating cover fields, ember particles, ticker.
// Everything animates transform/opacity only, respects prefers-reduced-motion and
// is aria-hidden so it never gets in the way of content or screen readers.
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/** Slow drifting colour orbs behind every page. CSS-only so it costs almost nothing. */
export function AmbientBackdrop() {
  return (
    <div aria-hidden className="ambient pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <span className="orb orb-a" />
      <span className="orb orb-b" />
      <span className="orb orb-c" />
    </div>
  );
}

/** Rising glowing particles. */
export function Embers({ count = 12, className = "" }: { count?: number; className?: string }) {
  const reduce = useReducedMotion();
  const list = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (i * 37 + 11) % 100, s: 2 + (i % 3), d: 8 + (i % 5) * 1.6, delay: (i * 0.7) % 7, drift: i % 2 ? 18 : -18,
  })), [count]);
  if (reduce) return null;
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {list.map((e, i) => (
        <motion.span key={i} className="absolute bottom-0 rounded-full bg-primary shadow-[0_0_14px_hsl(var(--primary))]"
          style={{ left: `${e.x}%`, width: e.s, height: e.s }}
          animate={{ y: [0, -620], x: [0, e.drift], opacity: [0, 0.85, 0] }}
          transition={{ duration: e.d, repeat: Infinity, delay: e.delay, ease: "easeOut" }} />
      ))}
    </div>
  );
}

type Spot = { l: string; t: string; w: number; r: number; d: number; depth: number };
const SPOTS_MOBILE: Spot[] = [
  { l: "-9%", t: "4%", w: 96, r: -14, d: 6.5, depth: 0.6 }, { l: "78%", t: "2%", w: 92, r: 12, d: 7.2, depth: 0.9 },
  { l: "84%", t: "34%", w: 78, r: -9, d: 6.8, depth: 0.5 }, { l: "-11%", t: "46%", w: 84, r: 10, d: 7.6, depth: 0.8 },
  { l: "74%", t: "68%", w: 90, r: -12, d: 6.2, depth: 0.7 }, { l: "-6%", t: "82%", w: 80, r: 8, d: 7.9, depth: 0.55 },
];
const SPOTS_DESKTOP: Spot[] = [
  { l: "-3%", t: "6%", w: 140, r: -14, d: 9, depth: 0.7 }, { l: "82%", t: "3%", w: 128, r: 12, d: 11, depth: 1 },
  { l: "90%", t: "44%", w: 104, r: -8, d: 10, depth: 0.5 }, { l: "-2%", t: "52%", w: 116, r: 10, d: 12, depth: 0.85 },
  { l: "72%", t: "74%", w: 132, r: -12, d: 13, depth: 0.6 }, { l: "10%", t: "84%", w: 96, r: 8, d: 9.5, depth: 0.9 },
];

/** Blurred covers bobbing around the edges of a section, with scroll parallax. */
export function FloatingCovers({ covers, opacity, className = "" }: { covers: string[]; opacity?: number; className?: string }) {
  const mobile = useIsMobile();
  const { scrollY } = useScroll();
  const spots = mobile ? SPOTS_MOBILE : SPOTS_DESKTOP;
  const op = opacity ?? (mobile ? 0.22 : 0.18);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      {covers.slice(0, spots.length).map((src, i) => <FloatingCover key={src + i} src={src} spot={spots[i]} i={i} op={op} scrollY={scrollY} />)}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background" />
    </div>
  );
}
function FloatingCover({ src, spot: p, i, op, scrollY }: { src: string; spot: Spot; i: number; op: number; scrollY: ReturnType<typeof useScroll>["scrollY"] }) {
  const reduce = useReducedMotion();
  const y = useTransform(scrollY, [0, 800], [0, -120 * p.depth]);
  return (
    <motion.div className="absolute" style={{ left: p.l, top: p.t, width: p.w, y: reduce ? 0 : y }}>
      <motion.img src={src} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 saturate-150"
        style={{ filter: `blur(${p.depth < 0.7 ? 2.5 : 1}px)` }}
        initial={{ opacity: 0, scale: 0.7, rotate: p.r }}
        animate={reduce ? { opacity: op, scale: 1 } : { opacity: op, scale: 1, y: [0, -18, 0], x: [0, 7, 0], rotate: [p.r, p.r + 4, p.r] }}
        transition={reduce ? { duration: 0.6 } : { opacity: { duration: 1.2, delay: i * 0.15 }, scale: { duration: 1.2, delay: i * 0.15 }, default: { duration: p.d, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 } }} />
    </motion.div>
  );
}

/** Endless marquee of titles. */
export function Ticker({ items, label = "Trending now" }: { items: { id: number | string; title: string; cover: string | null; href: string }[]; label?: string }) {
  const reduce = useReducedMotion();
  if (!items.length) return null;
  const list = [...items, ...items];
  return (
    <div className="relative -mx-4 overflow-hidden border-y border-border/60 bg-card/40 py-2.5 backdrop-blur-md sm:mx-0 sm:rounded-full sm:border" aria-label={label}>
      <motion.div className="flex w-max gap-7 px-4" animate={reduce ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: Math.max(28, items.length * 4), repeat: Infinity, ease: "linear" }}>
        {list.map((m, i) => (
          <Link key={`${m.id}-${i}`} href={m.href} tabIndex={i >= items.length ? -1 : undefined} aria-hidden={i >= items.length || undefined}
            className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span className="font-display text-primary">#{(i % items.length) + 1}</span>
            {m.cover && <img src={m.cover} alt="" className="h-6 w-[18px] rounded-sm object-cover" loading="lazy" />}
            <span className="max-w-[180px] truncate">{m.title}</span>
            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
          </Link>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

/** Wraps a card so it gently bobs forever; used for hero art and podium covers. */
export function Float({ children, delay = 0, amp = 10, dur = 5, rotate = 0, className = "" }: { children: ReactNode; delay?: number; amp?: number; dur?: number; rotate?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} animate={reduce ? undefined : { y: [0, -amp, 0], rotate: [rotate, rotate + (rotate ? 1.5 : 0), rotate] }}
      transition={{ duration: dur, repeat: Infinity, ease: "easeInOut", delay }}>
      {children}
    </motion.div>
  );
}

/** Pointer-driven 3D tilt container (mouse only; touch devices just float). */
export function Tilt({ children, className = "", max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [max, -max]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-max, max]), { stiffness: 180, damping: 18 });
  return (
    <motion.div className={className} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => { if (e.pointerType !== "mouse") return; const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height); }}
      onPointerLeave={() => { mx.set(0.5); my.set(0.5); }}>
      {children}
    </motion.div>
  );
}

/** Twinkling sparkles placed around a box. */
export function Twinkles({ spots = [[6, 12], [88, 8], [94, 62], [-4, 70], [50, 96]] }: { spots?: number[][] }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <>
      {spots.map(([l, t], k) => (
        <motion.span key={k} aria-hidden className="pointer-events-none absolute z-20 text-amber-300" style={{ left: `${l}%`, top: `${t}%` }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1.1, 0.5], rotate: [0, 45, 90] }} transition={{ duration: 2.8, repeat: Infinity, delay: k * 0.7 }}>
          <Sparkles className="h-3.5 w-3.5 drop-shadow-[0_0_8px_rgba(251,191,36,.8)]" />
        </motion.span>
      ))}
    </>
  );
}
