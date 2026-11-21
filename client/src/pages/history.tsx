import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { History as HistoryIcon, Trash2, Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, timeAgo } from "@/lib/app-context";
import { listReads, listProgress, deleteRead, clearHistory, isLegacyProgress } from "@/lib/data";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/supabase";
import { PageHead, Cover, EmptyBox, InlineError, SignInPrompt } from "@/components/shared";

const PAGE = 60;

export default function HistoryPage() {
  const { user, ready } = useApp();
  const { toast } = useToast();
  const [limit, setLimit] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);
  const reads = useQuery({ queryKey: ["history", user?.id, limit], queryFn: () => listReads(user!.id, limit), enabled: !!user });
  const legacy = useQuery({ queryKey: ["progress", user?.id, "legacy"], queryFn: async () => (await listProgress(user!.id, 100)).filter(isLegacyProgress), enabled: !!user });
  const del = useMutation({
    mutationFn: (r: { series_key: string; chapter_key: string }) => deleteRead(user!.id, r.series_key, r.chapter_key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
    onError: (e) => toast({ title: "Couldn't remove entry", description: errMsg(e), variant: "destructive" }),
  });
  const clear = useMutation({
    mutationFn: () => clearHistory(user!.id),
    onSuccess: () => { setConfirmClear(false); queryClient.invalidateQueries(); toast({ title: "History cleared" }); },
    onError: (e) => toast({ title: "Couldn't clear history", description: errMsg(e), variant: "destructive" }),
  });

  if (!ready) return null;
  if (!user) return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><PageHead icon={HistoryIcon} kicker="Yours" title="Reading history" /><SignInPrompt what="keep a history of the chapters you read" /></div>;
  const rows = reads.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHead icon={HistoryIcon} kicker="Yours" title="Reading history" sub="Every chapter you've opened, newest first."
        action={rows.length > 0 ? (
          <Button variant={confirmClear ? "destructive" : "outline"} size="sm" className="rounded-full" onClick={() => (confirmClear ? clear.mutate() : setConfirmClear(true))} onBlur={() => setConfirmClear(false)} disabled={clear.isPending} data-testid="button-clear-history">
            {clear.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}{confirmClear ? "Tap again to clear all" : "Clear history"}
          </Button>
        ) : undefined} />
      {reads.error ? <InlineError error={reads.error} onRetry={() => reads.refetch()} title="Couldn't load your history" />
        : reads.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer relative h-16 overflow-hidden rounded-xl bg-muted" />)}</div>
        : !rows.length ? <EmptyBox>No chapters read yet.</EmptyBox>
        : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/50" data-testid="list-history">
            {rows.map((r) => (
              <li key={`${r.series_key}/${r.chapter_key}`} className="flex items-center gap-3 px-3 py-2.5" data-testid={`history-${r.series_key}-${r.chapter_key}`}>
                <Link href={r.href ?? "/"} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">
                  <Cover src={r.cover} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.series_title}</p><p className="text-xs text-muted-foreground">{r.chapter_label} · page {r.page + 1}/{r.total_pages} · {timeAgo(r.read_at)}</p></div>
                </Link>
                <button onClick={() => del.mutate(r)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive" aria-label={`Remove ${r.chapter_label} from history`} data-testid={`button-remove-history-${r.series_key}-${r.chapter_key}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      {rows.length >= limit && <Button variant="ghost" className="mt-3 w-full rounded-full" onClick={() => setLimit((l) => l + PAGE)} data-testid="button-more-history">{reads.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}</Button>}

      {!!legacy.data?.length && (
        <section className="mt-10" aria-labelledby="legacy">
          <h2 id="legacy" className="font-display mb-1 flex items-center gap-2 text-lg font-semibold"><Archive className="h-4 w-4 text-muted-foreground" />Earlier reading</h2>
          <p className="mb-3 text-xs text-muted-foreground">These were read through external reading services that MANGASALT no longer links to. The record is kept; the chapters can't be opened here.</p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-dashed border-border" data-testid="list-legacy">
            {legacy.data.map((p) => {
              const anilist = /^\d+$/.test(p.series_key) ? p.series_key : null;
              const inner = (<><Cover src={p.cover} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover opacity-70" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.series_title ?? "Untitled"}</p><p className="text-xs text-muted-foreground">{p.chapter_label ?? "Chapter"} · no longer available · {timeAgo(p.updated_at)}</p></div></>);
              return <li key={`${p.series_key}/${p.chapter_key}`} className="px-3 py-2">{anilist ? <Link href={`/title/${anilist}`} className="flex items-center gap-3 hover:text-primary">{inner}</Link> : <div className="flex items-center gap-3">{inner}</div>}</li>;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
