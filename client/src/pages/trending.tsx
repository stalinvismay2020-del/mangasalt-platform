import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Flame, Crown, Star, TrendingUp, Trophy, Users } from "lucide-react";
import { PageHead, TypeBadge } from "@/components/shared";
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

function Podium({ items, order }: { items: WorldCard[]; order: string }) {
  const [, nav] = useLocation();
  // visual order: 2, 1, 3
  const slots = [items[1], items[0], items[2]].map((s, i) => ({ s, rank: [2, 1, 3][i] })).filter((x) => x.s);
  const h = { 1: "h-28 sm:h-32", 2: "h-20 sm:h-24", 3: "h-14 sm:h-16" } as Record<number, string>;
  return (
    <div className="relative mt-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-56 w-56 rounded-full bg-primary/25 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      {slots.map(({ s, rank }, i) => (
        <motion.button key={s.id} layout onClick={() => nav(`/title/${s.id}`)} data-testid={`podium-${rank}`}
          initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 22, delay: [0.15, 0, 0.3][i] }}
          className="group flex min-w-0 flex-col items-center text-center">
          <div className="relative">
            {rank === 1 && (
              <motion.div className="absolute inset-x-0 -top-7 mx-auto w-6 text-amber-400" animate={{ y: [0, -5, 0], rotate: [-6, 6, -6] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}>
                <Crown className="h-6 w-6 fill-amber-400/30" />
              </motion.div>
            )}
            <motion.img whileHover={{ y: -6, rotate: rank === 2 ? -2 : rank === 3 ? 2 : 0 }} src={s.cover} alt=""
              className={`rounded-xl object-cover shadow-2xl ring-1 ring-white/10 ${rank === 1 ? "w-24 shadow-primary/40 sm:w-32" : "w-[72px] sm:w-24"} aspect-[2/3]`} />
            {rank === 1 && <span className="shimmer pointer-events-none absolute inset-0 overflow-hidden rounded-xl" />}
          </div>
          <p className="mt-2 line-clamp-2 w-full px-1 text-xs font-semibold leading-tight group-hover:text-primary sm:text-sm">{s.title}</p>
          <div className="mt-1"><TypeBadge type={s.type} /></div>
          <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.25 + [0.15, 0, 0.3][i] }}
            className={`mt-2 flex w-full origin-bottom flex-col items-center justify-start rounded-t-xl border border-b-0 pt-2 ${rank === 1 ? "border-primary/50 bg-gradient-to-b from-primary/30 to-primary/5" : "border-border bg-gradient-to-b from-card to-transparent"} ${h[rank]}`}>
            <span className={`font-display text-2xl font-bold sm:text-3xl ${rank === 1 ? "text-primary" : "text-foreground/80"}`}>{rank}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{order === "score" ? ((s.score ?? 0) / 10).toFixed(1) : compact(s.popularity)}</span>
          </motion.div>
        </motion.button>
      ))}
    </div>
  );
}

function WorldRankRow({ s, rank, order, max }: { s: WorldCard; rank: number; order: string; max: number }) {
  const pct = Math.max(6, (scoreOf(order, s) / max) * 100);
  return (
    <motion.li layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ layout: { type: "spring", stiffness: 380, damping: 34 }, default: { type: "spring", stiffness: 300, damping: 28, delay: Math.min(rank, 10) * 0.04 } }}>
      <Link href={`/title/${s.id}`} className="group relative flex min-w-0 items-center gap-3 border-b border-border/70 py-3 transition-transform hover:translate-x-1 sm:gap-4" data-testid={`row-rank-${s.id}`}>
        <span className="rank-numeral font-display w-8 shrink-0 text-center text-3xl font-bold tabular-nums sm:w-10 sm:text-4xl">{rank}</span>
        <img src={s.cover} alt="" className="h-[72px] w-12 shrink-0 rounded-md object-cover ring-1 ring-white/5 transition duration-300 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-primary/30" loading="lazy" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold transition-colors group-hover:text-primary">{s.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <TypeBadge type={s.type} />
            {s.score ? <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{(s.score / 10).toFixed(1)}</span> : null}
            <span className="tabular-nums">{fmt(order, s)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 + Math.min(rank, 10) * 0.05 }} />
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

export default function Trending() {
  const [order, setOrder] = useState<string>("trending");
  const [type, setType] = useState("");
  const q = useQuery<WorldPage>({ queryKey: ["/api/world/search", { sort: order, type, page: "1" }] });
  const data = q.data?.items, isLoading = q.isLoading;
  const max = Math.max(1, ...(data ?? []).map((s) => scoreOf(order, s)));
  const rest = (data ?? []).slice(3);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <PageHead icon={Flame} kicker="Charts" title="Trending" sub="The hottest manga, manhwa and manhua worldwide, ranked live from AniList reader activity." />
        <motion.span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <motion.span className="h-1.5 w-1.5 rounded-full bg-primary" animate={{ opacity: [1, 0.2, 1], scale: [1, 1.6, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />Live
        </motion.span>
      </div>
      <div className="relative flex rounded-full border border-border bg-card/60 p-1" role="tablist">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} role="tab" aria-selected={order === v} onClick={() => setOrder(v)} data-testid={`tab-order-${v}`}
            className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-[13px] font-medium sm:text-sm transition-colors ${order === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {order === v && <motion.span layoutId="trend-pill" className="absolute inset-0 rounded-full bg-primary shadow-lg shadow-primary/30" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon className="relative hidden h-4 w-4 min-[400px]:block" /><span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {TYPES.map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} data-testid={`chip-type-${v || "all"}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${type === v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>

      {isLoading && <div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}
      <LayoutGroup>
        <AnimatePresence>
          {data && data.length > 0 && <Podium key={`${order}-${type}`} items={data} order={order} />}
        </AnimatePresence>
        <ol className="mt-2 border-t border-border">
          <AnimatePresence initial={false}>
            {rest.map((s, k) => <WorldRankRow key={s.id} s={s} rank={k + 4} order={order} max={max} />)}
          </AnimatePresence>
        </ol>
      </LayoutGroup>
      {data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing ranked here yet.</p>}
    </div>
  );
}
