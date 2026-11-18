import { NotFoundView } from "@/pages/not-found";
import { creditFor } from "@shared/credits";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Eye, Heart, Star, ShieldCheck, ArrowDownUp, Bookmark, Flag, Reply, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useApp, compact, timeAgo, rightsLabel, TYPE_ORIGIN } from "@/lib/app-context";
import { asset, Avatar, TypeBadge, LikeButton, SaveButton, FollowButton } from "@/components/shared";
import type { SeriesDetail, CommentItem } from "@shared/schema";
import { ChapterBrowser } from "@/components/chapters";
import { FavouriteButton, AddToShelf, ChapterCounter, ReportButton, RegionBanner } from "@/components/platform";

export default function SeriesPage({ params }: { params: { slug: string } }) {
  const { data, isLoading, error, refetch } = useQuery<SeriesDetail>({ queryKey: [`/api/series/by-slug/${params.slug}`] });
  const [tab, setTab] = useState<"chapters" | "comments">("chapters");
  const [more, setMore] = useState(false);
  const [, navigate] = useLocation();

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 pt-6"><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error && (error as any).status !== 404 && (error as any).status !== 451) return <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground" role="alert"><p>This series couldn't load. Check your connection and try again.</p><button onClick={() => refetch()} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Try again</button></div>;
  if (error || !data) return <NotFoundView embedded title={(error as any)?.status === 451 ? "Not available in your region" : "Series not found"} message={(error as any)?.status === 451 ? (error as Error).message : "This series doesn't exist or was removed. Try searching for it."} />;
  const { series: s, chapters, resume, bookmarks } = data;
  const readable = chapters.filter((c) => c.pageCount > 0);
  const first = readable[0];
  const target = resume ?? (first ? { id: first.id, number: first.number } : null);
  const readCount = chapters.filter((c) => c.read).length;

  return (
    <div className="pb-10">
      {/* Backdrop */}
      <div className="relative overflow-hidden">
        <img src={asset(s.cover)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-4 sm:px-6 sm:pt-8">
          <button onClick={() => history.length > 1 ? history.back() : navigate("/")} className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur hover:text-foreground" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <motion.img layoutId={`cover-${s.id}`} src={asset(s.cover)} alt={`${s.title} cover`} className="mx-auto w-44 shrink-0 rounded-xl shadow-2xl shadow-black/60 ring-1 ring-white/10 sm:mx-0 sm:w-56" />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <TypeBadge type={s.type} />
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.readable ? "text-emerald-500" : "text-muted-foreground"}`}><ShieldCheck className="h-3.5 w-3.5" />{rightsLabel(s)}</span>
                <ReportButton targetType="series" targetId={s.id} />
                {s.rights === "original" && <Link href="/legal/copyright" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" data-testid="link-report-copyright"><Flag className="h-3 w-3" />Report copyright</Link>}
              </div>
              <h1 className="font-display mt-2 text-3xl font-bold leading-tight sm:text-5xl" data-testid="text-series-title">{s.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">by <span className="font-medium text-foreground">{s.creator.displayName}</span> · {TYPE_ORIGIN[s.type]} · <span className="capitalize">{s.status}</span> · {s.year}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm sm:justify-start">
                {s.rating > 0 && <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>}
                <span className="flex items-center gap-1 text-muted-foreground"><Heart className="h-4 w-4" />{compact(s.likes)}</span>
                <span className="flex items-center gap-1 text-muted-foreground"><Eye className="h-4 w-4" />{compact(s.views)}</span>
                <span className="flex items-center gap-1 text-muted-foreground"><BookOpen className="h-4 w-4" />{s.chapterCount} {(() => { const w = chapters.length && chapters.every((c: any) => c.kind === "volume") ? "volume" : s.type === "manga" ? "chapter" : "episode"; return s.chapterCount === 1 ? w : `${w}s`; })()}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {target ? (
                  <Button size="lg" className="gap-2 rounded-full px-6 shadow-lg shadow-primary/30" onClick={() => navigate(`/read/${target.id}`)} data-testid="button-start-reading">
                    <BookOpen className="h-5 w-5" />{resume ? `Continue Ep. ${resume.number}` : "Start reading"}
                  </Button>
                ) : (
                  <Button size="lg" disabled className="rounded-full px-6">Pages coming soon</Button>
                )}
                <LikeButton s={s} />
                <SaveButton s={s} />
                <FollowButton type="series" id={s.id} following={s.followedByMe} size="default" />
                <FavouriteButton itemKey={`local:${s.id}`} />
                <AddToShelf itemKey={`local:${s.id}`} />
              </div>
              <div className="mt-3 flex justify-center sm:justify-start"><ChapterCounter itemKey={`local:${s.id}`} /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <RegionBanner region={(data as any).region} />
        {(s as any).approval && (s as any).approval !== "approved" && <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">Only you and moderators can see this series. Status: {(s as any).approval}.</p>}
        <p className={`mt-2 text-[15px] leading-relaxed text-foreground/80 ${more ? "" : "line-clamp-3"}`}>{s.synopsis}</p>
        <button onClick={() => setMore(!more)} className="mt-1 text-sm font-medium text-primary" data-testid="button-synopsis-more">{more ? "Show less" : "Read more"}</button>
        <div className="mt-3 flex flex-wrap gap-1.5">{s.genres.map((g) => <Link key={g} href="/search" className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">{g}</Link>)}</div>

        {creditFor(s.slug) && (() => { const c = creditFor(s.slug)!; return (
          <p className="mt-4 rounded-xl border border-border bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-credit">
            <span className="font-medium text-foreground">{c.work}</span> by <span className="font-medium text-foreground">{c.author}</span>, shared under the{" "}
            <a className="text-primary underline-offset-2 hover:underline" href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a>, from{" "}
            <a className="text-primary underline-offset-2 hover:underline" href={c.sourceUrl} target="_blank" rel="noreferrer">{c.source}</a>.{c.note ? ` ${c.note}` : ""} Every page is hosted on MANGASALT and free to read.
          </p>); })()}

        {bookmarks.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Bookmark className="h-4 w-4 text-primary" />Your bookmarks</h2>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {bookmarks.map((b) => (
                <Link key={b.chapterId} href={`/read/${b.chapterId}/${b.page}`} className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium" data-testid={`link-bookmark-${b.chapterId}`}>
                  Ep. {b.number} · page {b.page + 1}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="sticky top-14 z-20 -mx-4 mt-6 flex border-b border-border bg-background/90 px-4 backdrop-blur sm:-mx-6 sm:px-6" role="tablist">
          {([["chapters", `Episodes · ${chapters.length}`], ["comments", "Comments"]] as const).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} data-testid={`tab-${v}`}
              className={`relative px-4 py-3 text-sm font-medium ${tab === v ? "text-foreground" : "text-muted-foreground"}`}>
              {l}
              {tab === v && <motion.span layoutId="series-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "chapters" ? (
            <motion.div key="ch" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {readCount > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Your progress</span><span>{readCount} / {chapters.length}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(readCount / chapters.length) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} /></div>
                </div>
              )}
              <ChapterBrowser endpoint={`/api/series/by-slug/${s.slug}/chapters`} embedded />
            </motion.div>
          ) : (
            <motion.div key="cm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Comments seriesId={s.id} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------- Comments ----------
export function Comments({ seriesId, chapterId, base }: { seriesId: number; chapterId?: number; base?: string }) {
  const B = base ?? `/api/series/${seriesId}/comments`;
  const key = [B, chapterId ? { chapter: chapterId } : {}];
  const { data, isLoading } = useQuery<CommentItem[]>({ queryKey: key });
  const total = (data ?? []).reduce((n, c) => n + 1 + c.replies.length, 0);
  return (
    <div className="mt-4">
      <Composer seriesId={seriesId} chapterId={chapterId} base={B} />
      <p className="mt-5 text-sm text-muted-foreground" data-testid="text-comment-count">{total} {total === 1 ? "comment" : "comments"}</p>
      {isLoading && <div className="mt-3 h-20 animate-pulse rounded-xl bg-muted" />}
      <ul className="mt-2 divide-y divide-border/60">
        {data?.map((c) => <CommentRow key={c.id} c={c} seriesId={seriesId} chapterId={chapterId} base={B} />)}
      </ul>
      {data?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the discussion.</p>}
    </div>
  );
}

function invalidateComments(seriesId: number, base?: string) {
  const B = base ?? `/api/series/${seriesId}/comments`;
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(B) });
  queryClient.invalidateQueries({ queryKey: ["/api/home"] });
}

function Composer({ seriesId, chapterId, parentId, onDone, autoFocus, base }: { seriesId: number; chapterId?: number; parentId?: number; onDone?: () => void; autoFocus?: boolean; base?: string }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", base ?? `/api/series/${seriesId}/comments`, { body, spoiler, parentId, chapterId })).json(),
    onSuccess: () => { setBody(""); setSpoiler(false); invalidateComments(seriesId, base); onDone?.(); },
    onError: (e: Error) => toast({ title: "Could not post", description: e.message }),
  });
  if (!user) return (
    <button onClick={() => openAuth("login")} className="w-full rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:text-foreground" data-testid="button-comment-signin">
      Sign in to join the discussion
    </button>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) m.mutate(); }} className="rounded-xl border border-border bg-card/50 p-3">
      <div className="flex gap-3">
        <Avatar user={user} size={32} />
        <Textarea autoFocus={autoFocus} value={body} onChange={(e) => setBody(e.target.value)} placeholder={parentId ? "Write a reply" : "Share your thoughts"} maxLength={2000}
          className="min-h-[64px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0" data-testid={parentId ? `input-reply-${parentId}` : "input-comment"} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={spoiler} onCheckedChange={setSpoiler} data-testid="switch-spoiler" />Contains spoilers</label>
        <div className="flex gap-2">
          {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
          <Button type="submit" size="sm" className="rounded-full" disabled={!body.trim() || m.isPending} data-testid={parentId ? `button-reply-submit-${parentId}` : "button-comment-submit"}>
            {m.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{parentId ? "Reply" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentRow({ c, seriesId, chapterId, isReply, base }: { c: CommentItem; seriesId: number; chapterId?: number; isReply?: boolean; base?: string }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [reveal, setReveal] = useState(false);
  const [replying, setReplying] = useState(false);
  const [liked, setLiked] = useState({ on: c.likedByMe, n: c.likes });
  const like = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/comments/${c.id}/like`)).json(),
    onMutate: () => setLiked((l) => ({ on: !l.on, n: l.n + (l.on ? -1 : 1) })),
    onSuccess: (d: any) => setLiked({ on: d.liked, n: d.likes }),
    onError: () => setLiked({ on: c.likedByMe, n: c.likes }),
  });
  const report = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/comments/${c.id}/report`, { reason: "Inappropriate content" })).json(),
    onSuccess: () => { toast({ title: "Thanks for reporting", description: "Our moderators will review this comment." }); invalidateComments(seriesId, base); },
  });
  const need = (fn: () => void) => () => (user ? fn() : openAuth("login"));
  const hidden = c.spoiler && !reveal;
  return (
    <li className={isReply ? "pt-3" : "py-4"} data-testid={`comment-${c.id}`}>
      <div className="flex gap-3">
        <Avatar user={c.user} size={isReply ? 28 : 34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><span className="font-semibold">{c.user.displayName}</span>{c.user.isCreator ? <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Creator</span> : null}<span className="ml-2 text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span></p>
          {hidden ? (
            <button onClick={() => setReveal(true)} className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-500" data-testid={`button-reveal-${c.id}`}>
              <EyeOff className="h-3.5 w-3.5" />Spoiler hidden. Tap to reveal.
            </button>
          ) : <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.body}</p>}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <button onClick={need(() => like.mutate())} className={`flex items-center gap-1 ${liked.on ? "text-primary" : "hover:text-foreground"}`} data-testid={`button-like-comment-${c.id}`}>
              <Heart className={`h-3.5 w-3.5 ${liked.on ? "fill-current" : ""}`} />{liked.n}
            </button>
            {!isReply && <button onClick={need(() => setReplying(!replying))} className="flex items-center gap-1 hover:text-foreground" data-testid={`button-reply-${c.id}`}><Reply className="h-3.5 w-3.5" />Reply</button>}
            <button onClick={need(() => report.mutate())} className="flex items-center gap-1 hover:text-foreground" data-testid={`button-report-${c.id}`}><Flag className="h-3.5 w-3.5" />Report</button>
          </div>
          {replying && <div className="mt-3"><Composer seriesId={seriesId} chapterId={chapterId} parentId={c.id} onDone={() => setReplying(false)} autoFocus base={base} /></div>}
          {c.replies.length > 0 && (
            <ul className="mt-1 border-l border-border/70 pl-3">
              {c.replies.map((r) => <CommentRow key={r.id} c={r} seriesId={seriesId} chapterId={chapterId} isReply base={base} />)}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}


