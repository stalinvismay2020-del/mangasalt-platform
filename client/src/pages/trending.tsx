import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Flame, Crown, Star, TrendingUp, Trophy, Users, ArrowUpRight, Sparkles } from "lucide-react";
import { TypeBadge } from "@/components/shared";
import { useIsMobile } from "@/hooks/use-mobile";
import { compact } from "@/lib/app-context";
import type { WorldCard, WorldPage } from "@shared/world";

const TABS = [
  ["trending", "Trending", TrendingUp],
  ["popular", "Popular", Users],
  ["score", "Top rated", Trophy],
] as const;
const TYPES = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]] as const;
const scoreOf = (order: string, s: WorldCard) => (order === "score" ? (s.score ?? 0) : s.popularity);
const fmt = (order: string, s: WorldCard) => (order === "score" ? `${((s.score ?? 0) / 10).toFixed(1)} score` : `${compact(s.popularity)} readers`);

/** Covers floating behind the page, plus embers rising. Stronger and closer on phones. */
function FloatingBackdrop({ items }: { items: WorldCard[] }) {
  const reduce = useReducedMotion();
  const mobile = useIsMobile();
  const spots = mobile
    ? [
        { l: "-10%", t: "3%", w: 120, r: -16, d: 6 }, { l: "74%", t: "1%", w: 110, r: 14, d: 7 }, { l: "80%", t: "22%", w: 96, r: -10, d: 6.5 },
        { l: "-12%", t: "30%", w: 104, r: 12, d: 7.5 }, { l: "78%", t: "46%", w: 112, r: -14, d: 6.8 }, { l: "-8%", t: "58%", w: 96, r: 9, d: 7.2 },
        { l: "76%", t: "70%", w: 104, r: 11, d: 6.2 }, { l: "-10%", t: "84%", w: 110, r: -12, d: 7.8 },
      ]
    : [
        { l: "-6%", t: "4%", w: 150, r: -14, d: 9 }, { l: "78%", t: "2%", w: 130, r: 12, d: 11 }, { l: "86%", t: "38%", w: 110, r: -8, d: 10 },
        { l: "-4%", t: "46%", w: 120, r: 10, d: 12 }, { l: "70%", t: "70%", w: 140, r: -12, d: 13 }, { l: "6%", t: "78%", w: 100, r: 8, d: 9.5 },
      ];
  const amp = mobile ? { y: 48, x: 22, r: 12 } : { y: 26, x: 10, r: 6 };
  const op = mobile ? 0.3 : 0.16;
  const embers = useMemo(() => Array.from({ length: mobile ? 30 : 18 }, (_, i) => ({ x: (i * 53) % 100, s: (mobile ? 3 : 2) + (i % 4), d: (mobile ? 4.5 : 6) + (i % 5) * 1.2, delay: (i * 0.5) % 6 })), [mobile]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {items.slice(3, 3 + spots.length).map((m, i) => {
        const p = spots[i];
        return (
          <motion.img key={m.id} src={m.cover} alt="" className="absolute rounded-2xl object-cover saturate-150 shadow-2xl"
            style={{ left: p.l, top: p.t, width: p.w, aspectRatio: "2/3", filter: mobile ? "blur(1px)" : "blur(2px)" }}
            initial={{ opacity: 0, rotate: p.r, scale: 0.8 }}
            animate={reduce ? { opacity: op } : { opacity: op, scale: [1, 1.06, 1], y: [0, -amp.y, 0, amp.y * 0.4, 0], x: [0, amp.x, 0, -amp.x * 0.6, 0], rotate: [p.r, p.r + amp.r, p.r, p.r - amp.r * 0.5, p.r] }}
            transition={{ duration: p.d, repeat: Infinity, ease: "easeInOut", delay: i * 0.35 }} />
        );
      })}
      {!reduce && embers.map((e, i) => (
        <motion.span key={i} className="absolute bottom-0 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
          style={{ left: `${e.x}%`, width: e.s, height: e.s }}
          animate={{ y: [0, mobile ? -1400 : -900], opacity: [0, 1, 0], x: [0, i % 2 ? 40 : -40, i % 2 ? -10 : 10] }}
          transition={{ duration: e.d, repeat: Infinity, delay: e.delay, ease: "easeOut" }} />
      ))}
      <div className={`absolute inset-0 bg-gradient-to-b from-transparent ${mobile ? "via-background/20" : "via-background/40"} to-background`} />
    </div>
  );
}

/** Endless ticker of what's hot right now. */
function Ticker({ items }: { items: WorldCard[] }) {
  const list = [...items.slice(0, 10), ...items.slice(0, 10)];
  return (
    <div className="relative -mx-4 overflow-hidden border-y border-border/60 bg-card/40 py-2 backdrop-blur sm:mx-0 sm:rounded-full sm:border">
      <motion.div className="flex w-max gap-6 px-4" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        {list.map((m, i) => (
          <Link key={`${m.id}-${i}`} href={`/title/${m.id}`} className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="font-display text-primary">#{(i % 10) + 1}</span><img src={m.cover} alt="" className="h-5 w-4 rounded-sm object-cover" />{m.title}<ArrowUpRight className="h-3 w-3 text-emerald-500" />
          </Link>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

function Podium({ items, order }: { items: WorldCard[]; order: string }) {
  const [, nav] = useLocation();
  const reduce = useReducedMotion();
  const mobile = useIsMobile();
  const lift = (rank: number) => (mobile ? (rank === 1 ? -22 : -16) : rank === 1 ? -12 : -8);
  const slots = [items[1], items[0], items[2]].map((s, i) => ({ s, rank: [2, 1, 3][i] })).filter((x) => x.s);
  const h = { 1: "h-28 sm:h-32", 2: "h-20 sm:h-24", 3: "h-14 sm:h-16" } as Record<number, string>;
  return (
    <div className="relative mt-16 grid grid-cols-3 items-end gap-2 sm:mt-12 sm:gap-5">
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 -z-10 mx-auto h-64 w-64 rounded-full blur-3xl"
        style={{ background: items[0]?.color ?? "hsl(var(--primary))" }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.5, 0.25] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      {slots.map(({ s, rank }, i) => (
        <motion.button key={s.id} onClick={() => nav(`/title/${s.id}`)} data-testid={`podium-${rank}`}
          initial={{ opacity: 0, y: 80, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18, delay: [0.2, 0, 0.35][i] }}
          className="group flex min-w-0 flex-col items-center text-center">
          <motion.div className="relative" animate={reduce ? undefined : { y: [0, lift(rank), 0], scale: mobile ? [1, 1.05, 1] : [1, 1, 1], rotate: rank === 2 ? (mobile ? [-5, 3, -5] : [-2, 1, -2]) : rank === 3 ? (mobile ? [5, -3, 5] : [2, -1, 2]) : mobile ? [-2, 2, -2] : [0, 0, 0] }}
            transition={{ duration: (mobile ? 2.6 : 3.4) + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}>
            {rank === 1 && !reduce && [0, 1, 2, 3, 4].map((k) => (
              <motion.span key={k} className="absolute z-20 text-amber-300" style={{ left: `${[8, 80, 92, -6, 50][k]}%`, top: `${[10, 6, 60, 70, 96][k]}%` }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4], rotate: [0, 90, 180] }} transition={{ duration: 1.8, repeat: Infinity, delay: k * 0.4 }}>
                <Sparkles className="h-3.5 w-3.5" />
              </motion.span>
            ))}
            {rank === 1 && (
              <>
                <motion.div className="absolute -inset-[3px] rounded-[14px]" style={{ background: "conic-gradient(from 0deg, hsl(var(--primary)), #fbbf24, transparent 40%, hsl(var(--primary)))" }}
                  animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} />
                <motion.div className="absolute inset-x-0 -top-8 z-10 mx-auto w-7 text-amber-400" animate={{ y: [0, -6, 0], rotate: [-8, 8, -8] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
                  <Crown className="h-7 w-7 fill-amber-400/40 drop-shadow-[0_0_12px_rgba(251,191,36,.7)]" />
                </motion.div>
              </>
            )}
            <motion.img whileHover={{ scale: 1.06, rotate: rank === 2 ? -3 : rank === 3 ? 3 : 0 }} src={s.cover} alt=""
              className={`relative aspect-[2/3] rounded-xl object-cover shadow-2xl ring-1 ring-white/10 ${rank === 1 ? "w-24 sm:w-36" : "w-[72px] sm:w-28"}`} />
            {rank === 1 && <span className="shimmer pointer-events-none absolute inset-0 overflow-hidden rounded-xl" />}
            <motion.span className="absolute -bottom-3 left-1/2 -z-10 h-3 w-3/4 -translate-x-1/2 rounded-full bg-black/50 blur-md"
              animate={reduce ? undefined : { scaleX: [1, 0.8, 1], opacity: [0.6, 0.35, 0.6] }} transition={{ duration: (mobile ? 2.6 : 3.4) + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }} />
          </motion.div>
          <p className="mt-3 line-clamp-2 w-full px-1 text-xs font-semibold leading-tight group-hover:text-primary sm:text-sm">{s.title}</p>
          <div className="mt-1"><TypeBadge type={s.type} /></div>
          <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.3 + [0.2, 0, 0.35][i] }}
            className={`relative mt-2 flex w-full origin-bottom flex-col items-center justify-start overflow-hidden rounded-t-xl border border-b-0 pt-2 ${rank === 1 ? "border-primary/50 bg-gradient-to-b from-primary/35 to-primary/5" : "border-border bg-gradient-to-b from-card to-transparent"} ${h[rank]}`}>
            {rank === 1 && <motion.span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" animate={{ x: ["-150%", "350%"] }} transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.2 }} />}
            <span className={`font-display relative text-2xl font-bold sm:text-3xl ${rank === 1 ? "text-primary" : "text-foreground/80"}`}>{rank}</span>
            <span className="relative text-[11px] tabular-nums text-muted-foreground">{order === "score" ? ((s.score ?? 0) / 10).toFixed(1) : compact(s.popularity)}</span>
          </motion.div>
        </motion.button>
      ))}
    </div>
  );
}

function RankRow({ s, rank, order, max }: { s: WorldCard; rank: number; order: string; max: number }) {
  const mobile = useIsMobile();
  const reduce = useReducedMotion();
  const pct = Math.max(6, (scoreOf(order, s) / max) * 100);
  const hot = rank <= 10;
  return (
    <motion.li initial={{ opacity: 0, x: -30, filter: "blur(4px)" }} whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "-20px" }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: ((rank - 4) % 8) * 0.04 }}>
      <Link href={`/title/${s.id}`} className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl px-2 py-3 transition-all hover:bg-card hover:shadow-xl sm:gap-4" data-testid={`row-rank-${s.id}`}>
        <span className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: `linear-gradient(90deg, ${s.color ?? "hsl(var(--primary))"}22, transparent 60%)` }} />
        <span className="rank-numeral font-display w-8 shrink-0 text-center text-3xl font-bold tabular-nums transition-transform duration-300 group-hover:scale-110 sm:w-10 sm:text-4xl">{rank}</span>
        <motion.img whileHover={{ rotate: -4, scale: 1.12 }} src={s.cover} alt="" className="h-[72px] w-12 shrink-0 rounded-md object-cover shadow-lg ring-1 ring-white/5" loading="lazy"
          animate={reduce ? undefined : { y: [0, mobile ? -7 : -3, 0], rotate: [0, rank % 2 ? (mobile ? 4 : 1.5) : (mobile ? -4 : -1.5), 0] }}
          transition={{ duration: (mobile ? 2.4 : 3.2) + (rank % 4) * 0.3, repeat: Infinity, ease: "easeInOut", delay: (rank % 6) * 0.25 }} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold transition-colors group-hover:text-primary">{s.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <TypeBadge type={s.type} />
            {s.score ? <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{(s.score / 10).toFixed(1)}</span> : null}
            <span className="tabular-nums">{fmt(order, s)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <motion.div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-primary/60 to-primary" initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}>
              <motion.span className="absolute inset-y-0 w-8 bg-white/40 blur-sm" animate={{ x: ["-2rem", "20rem"] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2 + (rank % 3) }} />
            </motion.div>
          </div>
        </div>
        {hot && (
          <motion.span className="shrink-0 text-primary" animate={{ scale: [1, 1.18, 0.95, 1.1, 1], rotate: [0, -6, 4, -2, 0], opacity: [0.8, 1, 0.85, 1, 0.8] }} transition={{ duration: 1.6, repeat: Infinity, delay: rank * 0.12 }}>
            <Flame className="h-5 w-5 fill-primary/30" />
          </motion.span>
        )}
      </Link>
    </motion.li>
  );
}

export default function Trending() {
  const [order, setOrder] = useState<string>("trending");
  const [type, setType] = useState("");
  const q = useQuery<WorldPage>({ queryKey: ["/api/world/search", { sort: order, type, page: "1" }] });
  const data = q.data?.items;
  const max = Math.max(1, ...(data ?? []).map((s) => scoreOf(order, s)));
  const rest = (data ?? []).slice(3);
  return (
    <div className="relative isolate overflow-x-clip">
      {data && <FloatingBackdrop items={data} />}
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 sm:px-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <motion.span animate={{ rotate: [0, -12, 10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}><Flame className="h-3.5 w-3.5" /></motion.span>Charts
            </motion.p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {"Trending".split("").map((c, i) => (
                <motion.span key={i} className="inline-block" initial={{ opacity: 0, y: 20, rotate: 8 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 18 }}>{c}</motion.span>
              ))}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">The hottest manga, manhwa and manhua worldwide, ranked live from reader activity.</p>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <motion.span className="h-1.5 w-1.5 rounded-full bg-primary" animate={{ opacity: [1, 0.2, 1], scale: [1, 1.8, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />Live
          </span>
        </div>
        {data && <Ticker items={data} />}
        <div className="relative mt-4 flex rounded-full border border-border bg-card/60 p-1 backdrop-blur" role="tablist">
          {TABS.map(([v, l, Icon]) => (
            <button key={v} role="tab" aria-selected={order === v} onClick={() => setOrder(v)} data-testid={`tab-order-${v}`}
              className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-[13px] font-medium transition-colors sm:text-sm ${order === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {order === v && <motion.span layoutId="trend-pill" className="absolute inset-0 rounded-full bg-primary shadow-lg shadow-primary/30" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon className="relative hidden h-4 w-4 min-[400px]:block" /><span className="relative">{l}</span>
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
          {TYPES.map(([v, l]) => (
            <button key={v} onClick={() => setType(v)} data-testid={`chip-type-${v || "all"}`}
              className={`relative shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${type === v ? "border-foreground bg-foreground text-background" : "border-border bg-card/50 text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>

        {q.isLoading && <div className="shimmer relative mt-6 h-72 overflow-hidden rounded-2xl bg-muted" />}
        <AnimatePresence mode="wait">
          {data && data.length > 0 && (
            <motion.div key={`${order}-${type}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.25 }}>
              <Podium items={data} order={order} />
              <ol className="mt-3 space-y-1 border-t border-border pt-2">
                {rest.map((s, k) => <RankRow key={s.id} s={s} rank={k + 4} order={order} max={max} />)}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
        {data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground"><Sparkles className="mx-auto mb-2 h-5 w-5" />Nothing ranked here yet.</p>}
      </div>
    </div>
  );
}
