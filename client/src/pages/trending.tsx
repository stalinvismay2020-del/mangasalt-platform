import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Flame, Crown, Heart, Eye, TrendingUp } from "lucide-react";
import { PageHead, RankRow, asset, TypeBadge } from "@/components/shared";
import { useApp, compact } from "@/lib/app-context";
import type { SeriesCard } from "@shared/schema";

const TABS = [
  ["likes", "Most liked", Heart],
  ["week", "This week", TrendingUp],
  ["views", "All-time", Eye],
] as const;
const TYPES = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"], ["comic", "Comic"]] as const;
const scoreOf = (order: string, s: SeriesCard) => (order === "week" ? s.recentLikes : order === "views" ? s.views : s.likes);
const unitOf = (order: string) => (order === "week" ? "likes this week" : order === "views" ? "views" : "likes");

function Podium({ items, order }: { items: SeriesCard[]; order: string }) {
  const { setOpenSeries } = useApp();
  // visual order: 2, 1, 3
  const slots = [items[1], items[0], items[2]].map((s, i) => ({ s, rank: [2, 1, 3][i] })).filter((x) => x.s);
  const h = { 1: "h-28 sm:h-32", 2: "h-20 sm:h-24", 3: "h-14 sm:h-16" } as Record<number, string>;
  return (
    <div className="relative mt-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-56 w-56 rounded-full bg-primary/25 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      {slots.map(({ s, rank }, i) => (
        <motion.button key={s.id} layout onClick={() => setOpenSeries(s)} data-testid={`podium-${rank}`}
          initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 22, delay: [0.15, 0, 0.3][i] }}
          className="group flex min-w-0 flex-col items-center text-center">
          <div className="relative">
            {rank === 1 && (
              <motion.div className="absolute inset-x-0 -top-7 mx-auto w-6 text-amber-400" animate={{ y: [0, -5, 0], rotate: [-6, 6, -6] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}>
                <Crown className="h-6 w-6 fill-amber-400/30" />
              </motion.div>
            )}
            <motion.img whileHover={{ y: -6, rotate: rank === 2 ? -2 : rank === 3 ? 2 : 0 }} src={asset(s.cover)} alt=""
              className={`rounded-xl object-cover shadow-2xl ring-1 ring-white/10 ${rank === 1 ? "w-24 shadow-primary/40 sm:w-32" : "w-[72px] sm:w-24"} aspect-[2/3]`} />
            {rank === 1 && <span className="shimmer pointer-events-none absolute inset-0 overflow-hidden rounded-xl" />}
          </div>
          <p className="mt-2 line-clamp-2 w-full px-1 text-xs font-semibold leading-tight group-hover:text-primary sm:text-sm">{s.title}</p>
          <div className="mt-1"><TypeBadge type={s.type} /></div>
          <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.25 + [0.15, 0, 0.3][i] }}
            className={`mt-2 flex w-full origin-bottom flex-col items-center justify-start rounded-t-xl border border-b-0 pt-2 ${rank === 1 ? "border-primary/50 bg-gradient-to-b from-primary/30 to-primary/5" : "border-border bg-gradient-to-b from-card to-transparent"} ${h[rank]}`}>
            <span className={`font-display text-2xl font-bold sm:text-3xl ${rank === 1 ? "text-primary" : "text-foreground/80"}`}>{rank}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{compact(scoreOf(order, s))}</span>
          </motion.div>
        </motion.button>
      ))}
    </div>
  );
}

export default function Trending() {
  const [order, setOrder] = useState<string>("likes");
  const [type, setType] = useState("");
  const { data, isLoading } = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { order, type }] });
  const max = Math.max(1, ...(data ?? []).map((s) => scoreOf(order, s)));
  const rest = (data ?? []).slice(3);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <PageHead icon={Flame} kicker="Charts" title="Trending" sub="Only titles you can read on MANGASALT. Rankings update live as readers like." />
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
        <AnimatePresence mode="popLayout">
          {data && data.length > 0 && <Podium key={`${order}-${type}`} items={data} order={order} />}
        </AnimatePresence>
        <ol className="mt-2 border-t border-border">
          <AnimatePresence mode="popLayout" initial={false}>
            {rest.map((s, k) => <RankRow key={s.id} s={s} rank={k + 4} score={scoreOf(order, s)} max={max} unit={unitOf(order)} />)}
          </AnimatePresence>
        </ol>
      </LayoutGroup>
      {data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing ranked here yet.</p>}
    </div>
  );
}
