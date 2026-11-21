import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalog, type BrowseResult } from "@/lib/catalog";
import { PageHead, PosterGrid, InlineError, EmptyBox, fromCatalog } from "@/components/shared";

const SORTS = [["trending", "Trending now"], ["popularity", "Most popular"], ["score", "Top rated"], ["newest", "Newest"]] as const;
const FORMATS = [["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]] as const;

export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v || "all"} role="tab" aria-selected={value === v} onClick={() => onChange(v)} data-testid={`tab-${label.toLowerCase().replace(/\s/g, "-")}-${v || "all"}`}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${value === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

export function useBrowseInfinite(params: Record<string, string | undefined>, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["catalog", "browse-inf", params],
    queryFn: ({ pageParam, signal }) => catalog<BrowseResult>("/browse", { ...params, page: pageParam, limit: 30 }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function CatalogResults({ q }: { q: ReturnType<typeof useBrowseInfinite> }) {
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const seen = new Set<number>();
  const unique = items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  if (q.error && !items.length) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.isLoading && !unique.length) return <EmptyBox>No titles match these filters.</EmptyBox>;
  const attribution = q.data?.pages[0]?.attribution;
  return (
    <>
      <PosterGrid items={unique.map(fromCatalog)} loading={q.isLoading} count={18} />
      {q.error && items.length > 0 && <div className="mt-4"><InlineError error={q.error} onRetry={() => q.fetchNextPage()} title="Couldn't load more" /></div>}
      {q.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" className="rounded-full px-6" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="button-load-more">
            {q.isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</> : "Load more"}
          </Button>
        </div>
      )}
      {attribution && <p className="mt-6 text-center text-[11px] text-muted-foreground">Catalogue data: <a href={attribution.url} target="_blank" rel="noreferrer" className="underline">{attribution.name}</a> via {attribution.via}</p>}
    </>
  );
}

export default function Trending() {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("trending");
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("");
  const q = useBrowseInfinite({ sort, format: format || undefined });
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHead icon={Flame} kicker="Charts" title="Trending" sub="What readers worldwide are following right now." />
      <div className="mb-5 space-y-2.5">
        <Pills label="Sort" value={sort} options={SORTS} onChange={setSort} />
        <Pills label="Format" value={format} options={FORMATS} onChange={setFormat} />
      </div>
      <CatalogResults q={q} />
    </div>
  );
}
