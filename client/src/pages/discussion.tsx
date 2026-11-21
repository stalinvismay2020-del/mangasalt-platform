import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { MessagesSquare, Heart, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timeAgo, compact } from "@/lib/app-context";
import { discussionFeed, type FeedItem } from "@/lib/data";
import { pageUrl } from "@/lib/supabase";
import { Avatar, Cover, EmptyBox, InlineError, PageHead } from "@/components/shared";

const PAGE = 20;

export default function DiscussionPage() {
  const q = useInfiniteQuery({
    queryKey: ["discussion-feed"],
    queryFn: ({ pageParam }) => discussionFeed(PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const items = q.data?.pages.flat() ?? [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHead icon={MessagesSquare} kicker="Community" title="Discussion" sub="The latest conversations across MANGASALT. Open a title to join in." />
      {q.error ? <InlineError error={q.error} onRetry={() => q.refetch()} title="Couldn't load discussions" />
        : q.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" />)}</div>
        : !items.length ? <EmptyBox action={<Link href="/trending" className="text-sm font-medium text-primary">Find a title to talk about</Link>}>No discussions yet. Be the first to comment on a title.</EmptyBox>
        : <ul className="space-y-3" data-testid="list-feed">{items.map((c) => <FeedRow key={c.id} c={c} />)}</ul>}
      {q.hasNextPage && <Button variant="ghost" className="mt-4 w-full rounded-full" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="button-more-feed">{q.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}</Button>}
    </div>
  );
}

function FeedRow({ c }: { c: FeedItem }) {
  const [reveal, setReveal] = useState(false);
  const href = c.slug ? (c.chapter_key ? `/read/${c.slug}/${c.chapter_key}` : `/series/${c.slug}`) : c.media_id ? `/title/${c.media_id}` : "/";
  return (
    <li className="rounded-2xl border border-border bg-card/50 p-3.5" data-testid={`feed-${c.id}`}>
      <div className="flex gap-3">
        <Link href={href} className="shrink-0"><Cover src={c.cover?.startsWith("http") ? c.cover : pageUrl(c.cover)} alt="" className="h-16 w-12 rounded-lg object-cover" /></Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="line-clamp-1 text-sm font-semibold hover:text-primary">{c.title ?? "Untitled"}{c.chapter_key ? <span className="font-normal text-muted-foreground"> · Chapter {c.chapter_key}</span> : null}</Link>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Link href={`/u/${c.author.id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:text-primary"><Avatar name={c.author.name} hue={c.author.hue} size={18} />{c.author.name}</Link><span>{timeAgo(c.created_at)}</span></p>
          {c.spoiler && !reveal ? <button onClick={() => setReveal(true)} className="mt-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">Spoiler hidden — tap to reveal</button>
            : <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-sm">{c.body}</p>}
          <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{compact(c.likes)}</span><span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{compact(c.replies)} repl{c.replies === 1 ? "y" : "ies"}</span><Link href={href} className="ml-auto font-medium text-primary hover:underline">Open thread</Link></p>
        </div>
      </div>
    </li>
  );
}
