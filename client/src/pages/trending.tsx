import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { PageHead, RankRow } from "@/components/shared";
import type { SeriesCard } from "@shared/schema";

const TABS = [
  ["likes", "Most liked"],
  ["week", "This week"],
  ["views", "All-time"],
] as const;
const TYPES = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]] as const;

export default function Trending() {
  const [order, setOrder] = useState<string>("likes");
  const [type, setType] = useState("");
  const { data, isLoading } = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { order, type }] });
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={Flame} kicker="Charts" title="Trending" sub="Only titles you can read on MANGASALT. “Most liked” ranks them by reader hearts, live." />
      <div className="flex border-b border-border" role="tablist">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={order === v} onClick={() => setOrder(v)} data-testid={`tab-order-${v}`}
            className={`relative px-4 py-2.5 text-sm font-medium transition ${order === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
            {order === v && <motion.span layoutId="trend-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          </button>
        ))}
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {TYPES.map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} data-testid={`chip-type-${v || "all"}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${type === v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      <ol className="mt-2">
        {isLoading && Array.from({ length: 5 }).map((_, k) => <li key={k} className="my-3 h-[72px] rounded-lg bg-muted" />)}
        {data?.map((s, k) => <RankRow key={`${order}-${type}-${s.id}`} s={s} rank={k + 1} />)}
      </ol>
      {data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing ranked here yet.</p>}
    </div>
  );
}
