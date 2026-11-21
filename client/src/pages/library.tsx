import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Library as LibraryIcon, Play, Trash2, Clock, Bookmark as BookmarkIcon } from "lucide-react";
import { useApp, timeAgo } from "@/lib/app-context";
import { listBookmarks, listProgress, setBookmark, progressHref, type Bookmark } from "@/lib/data";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/supabase";
import { PageHead, Cover, TypeBadge, EmptyBox, InlineError, SignInPrompt } from "@/components/shared";

export default function Library() {
  const { user, ready } = useApp();
  const { toast } = useToast();
  const b = useQuery({ queryKey: ["bookmarks", user?.id], queryFn: () => listBookmarks(user!.id), enabled: !!user });
  const p = useQuery({ queryKey: ["progress", user?.id, "all"], queryFn: () => listProgress(user!.id, 50), enabled: !!user });
  const rm = useMutation({
    mutationFn: (x: Bookmark) => setBookmark(user!.id, false, { series_key: x.series_key, title: x.title ?? "", cover: x.cover, kind: x.kind, href: x.href ?? "" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bookmarks"] }); queryClient.invalidateQueries({ queryKey: ["bookmark"] }); toast({ title: "Removed from library" }); },
    onError: (e) => toast({ title: "Couldn't remove", description: errMsg(e), variant: "destructive" }),
  });

  if (!ready) return null;
  if (!user) return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><PageHead icon={LibraryIcon} kicker="Yours" title="Library" /><SignInPrompt what="save series to your library and continue where you left off" /></div>;

  const progressByKey = new Map((p.data ?? []).map((x) => [x.series_key, x]));
  const continueRows = (p.data ?? []).map((x) => ({ ...x, to: progressHref(x) })).filter((x) => x.to);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHead icon={LibraryIcon} kicker="Yours" title="Library" sub="Saved series and where you left off." action={<Link href="/history" className="text-sm font-medium text-primary hover:underline" data-testid="link-history">Reading history</Link>} />

      <section className="mb-8" aria-labelledby="cont">
        <h2 id="cont" className="font-display mb-3 flex items-center gap-2 text-lg font-semibold"><Clock className="h-4 w-4 text-primary" />Continue reading</h2>
        {p.error ? <InlineError error={p.error} onRetry={() => p.refetch()} title="Couldn't load your progress" />
          : p.isLoading ? <div className="shimmer relative h-20 overflow-hidden rounded-2xl bg-muted" />
          : !continueRows.length ? <EmptyBox>Nothing in progress. Open a chapter and your place is saved automatically.</EmptyBox>
          : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {continueRows.map((x) => (
                <li key={x.series_key}>
                  <Link href={x.to!} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-2.5 hover:border-primary/50" data-testid={`link-resume-${x.series_key}`}>
                    <Cover src={x.cover} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{x.series_title}</p><p className="text-xs text-muted-foreground">{x.chapter_label} · page {x.page + 1}/{x.total_pages} · {timeAgo(x.updated_at)}</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${x.total_pages ? ((x.page + 1) / x.total_pages) * 100 : 0}%` }} /></div></div>
                    <Play className="h-4 w-4 shrink-0 fill-primary text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="saved">
        <h2 id="saved" className="font-display mb-3 flex items-center gap-2 text-lg font-semibold"><BookmarkIcon className="h-4 w-4 text-primary" />Saved <span className="text-sm font-normal text-muted-foreground">{b.data ? b.data.length : ""}</span></h2>
        {b.error ? <InlineError error={b.error} onRetry={() => b.refetch()} title="Couldn't load your library" />
          : b.isLoading ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="shimmer relative aspect-[2/3] overflow-hidden rounded-xl bg-muted" />)}</div>
          : !b.data?.length ? <EmptyBox action={<Link href="/trending" className="text-sm font-medium text-primary">Find something to read</Link>}>Your library is empty. Tap Save on any title to keep it here.</EmptyBox>
          : (
            <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" data-testid="list-bookmarks">
              {b.data.map((x) => {
                const href = x.href || (x.series_key.startsWith("ms-") ? `/series/${x.series_key.slice(3)}` : /^\d+$/.test(x.series_key) ? `/title/${x.series_key}` : "/");
                const pr = progressByKey.get(x.series_key);
                return (
                  <li key={x.id} className="group relative" data-testid={`bookmark-${x.series_key}`}>
                    <Link href={href} className="block">
                      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
                        <Cover src={x.cover} alt={`${x.title ?? ""} cover`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        <div className="absolute left-1.5 top-1.5"><TypeBadge type={x.kind} /></div>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-primary">{x.title}</p>
                      <p className="text-xs text-muted-foreground">{pr?.chapter_label ? `${pr.chapter_label}` : `Saved ${timeAgo(x.created_at)}`}</p>
                    </Link>
                    <button onClick={() => rm.mutate(x)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Remove ${x.title} from library`} data-testid={`button-remove-${x.series_key}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
