import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, MessageSquare, Flag, Trash2, Pencil, Loader2, EyeOff, CornerDownRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useApp, timeAgo, compact } from "@/lib/app-context";
import { queryClient } from "@/lib/queryClient";
import { getThread, postComment, editComment, deleteComment, toggleCommentLike, reportTarget, type Target, type CommentNode } from "@/lib/data";
import { Avatar, EmptyBox, InlineError } from "@/components/shared";
import { errMsg, supabase } from "@/lib/supabase";

const MAX = 2000;

export function Discussion({ target, title = "Discussion", chapterFilter = null, compactHead = false }: { target: Target; title?: string; chapterFilter?: string | null; compactHead?: boolean }) {
  const [sort, setSort] = useState<"new" | "top">("new");
  const [limit, setLimit] = useState(20);
  const key = ["thread", target.seriesId ?? target.mediaId, chapterFilter, sort, limit];
  const q = useQuery({ queryKey: key, queryFn: () => getThread(target, sort, limit, chapterFilter) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["thread", target.seriesId ?? target.mediaId] });
    // keep the series header and discussion feed comment counts in sync
    queryClient.invalidateQueries({ queryKey: ["hosted"] });
    queryClient.invalidateQueries({ queryKey: ["discussion-feed"] });
  };

  return (
    <section aria-labelledby="discussion-title" data-testid="section-discussion">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="discussion-title" className={`font-display font-semibold tracking-tight ${compactHead ? "text-lg" : "text-xl"}`}>
          {title} <span className="ml-1 text-sm font-normal text-muted-foreground" data-testid="text-comment-count">{q.data ? `${q.data.total} comment${q.data.total === 1 ? "" : "s"}` : ""}</span>
        </h2>
        <div className="flex rounded-full border border-border p-0.5 text-xs" role="tablist" aria-label="Sort comments">
          {(["new", "top"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={sort === s} onClick={() => setSort(s)} data-testid={`button-sort-${s}`}
              className={`rounded-full px-3 py-1 font-medium transition ${sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s === "new" ? "Newest" : "Top"}</button>
          ))}
        </div>
      </div>
      <Composer target={target} onDone={refresh} />
      <div className="mt-4">
        {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer relative h-20 overflow-hidden rounded-2xl bg-muted" />)}</div>
          : q.error ? <InlineError error={q.error} onRetry={() => q.refetch()} title="Couldn't load comments" />
          : !q.data?.items.length ? <EmptyBox>No comments yet. Start the conversation.</EmptyBox>
          : (
            <ul className="space-y-3" data-testid="list-comments">
              {q.data.items.map((c) => <CommentItem key={c.id} c={c} target={target} onChange={refresh} />)}
            </ul>
          )}
        {q.data && q.data.top_level > q.data.items.length && (
          <Button variant="ghost" className="mt-3 w-full rounded-full" onClick={() => setLimit((l) => l + 20)} data-testid="button-more-comments">
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : `Load more (${q.data.top_level - q.data.items.length})`}
          </Button>
        )}
      </div>
    </section>
  );
}

function Composer({ target, parentId, onDone, autoFocus, onCancel }: { target: Target; parentId?: number; onDone: () => void; autoFocus?: boolean; onCancel?: () => void }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const m = useMutation({
    mutationFn: () => postComment(user!.id, target, body.trim(), spoiler, parentId),
    onSuccess: () => { setBody(""); setSpoiler(false); onDone(); onCancel?.(); },
    onError: (e) => toast({ title: "Comment not posted", description: errMsg(e), variant: "destructive" }),
  });
  if (!user) return (
    <button onClick={() => openAuth("login")} className="w-full rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4 text-left text-sm text-muted-foreground hover:border-primary/50" data-testid="button-comment-signin">
      Sign in to join the discussion.
    </button>
  );
  if (user.banned) return <EmptyBox>Your account is suspended from posting.</EmptyBox>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (body.trim() && !m.isPending) m.mutate(); }} className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex gap-3">
        <Avatar name={user.name} hue={user.hue} size={32} />
        <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX))} autoFocus={autoFocus} rows={parentId ? 2 : 3}
          placeholder={parentId ? "Write a reply…" : "Share your thoughts. Mark spoilers so others can skip them."} aria-label={parentId ? "Reply" : "Comment"}
          className="min-h-0 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" data-testid={parentId ? "input-reply" : "input-comment"} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-11">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} className="accent-[hsl(var(--primary))]" data-testid="checkbox-spoiler" />Contains spoilers
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">{body.length}/{MAX}</span>
          {onCancel && <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" size="sm" className="rounded-full" disabled={!body.trim() || m.isPending} data-testid={parentId ? "button-post-reply" : "button-post-comment"}>
            {m.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{parentId ? "Reply" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({ c, target, onChange, isReply }: { c: CommentNode; target: Target; onChange: () => void; isReply?: boolean }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [reveal, setReveal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [like, setLike] = useState<{ liked: boolean; count: number } | null>(null);
  const liked = like?.liked ?? c.liked, likes = like?.count ?? c.likes;

  const likeM = useMutation({
    mutationFn: () => toggleCommentLike(c.id),
    onMutate: () => setLike({ liked: !liked, count: likes + (liked ? -1 : 1) }),
    onSuccess: (d) => setLike({ liked: d.liked, count: Number(d.count) }),
    onError: (e) => { setLike(null); toast({ title: "Couldn't update like", description: errMsg(e), variant: "destructive" }); },
  });
  const delM = useMutation({ mutationFn: () => deleteComment(c.id), onSuccess: onChange, onError: (e) => toast({ title: "Couldn't delete", description: errMsg(e), variant: "destructive" }) });
  const editM = useMutation({ mutationFn: () => editComment(c.id, draft.trim(), c.spoiler), onSuccess: () => { setEditing(false); onChange(); }, onError: (e) => toast({ title: "Couldn't save edit", description: errMsg(e), variant: "destructive" }) });
  const hideM = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("comments").update({ is_hidden: !c.is_hidden, hidden_reason: c.is_hidden ? "" : "Hidden by moderator" }).eq("id", c.id); if (error) throw error; },
    onSuccess: onChange, onError: (e) => toast({ title: "Moderation failed", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <li className={`${isReply ? "" : "rounded-2xl border border-border bg-card/40 p-3.5"}`} data-testid={`comment-${c.id}`}>
      <div className="flex gap-3">
        <Link href={`/u/${c.author.id}`} aria-label={`${c.author.name}'s profile`}><Avatar name={c.author.name} hue={c.author.hue} size={isReply ? 26 : 32} /></Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Link href={`/u/${c.author.id}`} className="font-semibold hover:text-primary" data-testid={`text-author-${c.id}`}>{c.author.name}</Link>
            <time className="text-xs text-muted-foreground" dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()}>{timeAgo(c.created_at)}</time>
            {c.edited_at && <span className="text-xs text-muted-foreground">(edited)</span>}
            {c.is_hidden && <span className="flex items-center gap-1 text-xs text-amber-500"><EyeOff className="h-3 w-3" />Hidden{c.hidden_reason ? ` · ${c.hidden_reason}` : ""}</span>}
          </p>
          {editing ? (
            <div className="mt-1.5">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MAX))} rows={3} data-testid={`input-edit-${c.id}`} />
              <div className="mt-2 flex gap-2"><Button size="sm" className="rounded-full" disabled={!draft.trim() || editM.isPending} onClick={() => editM.mutate()} data-testid={`button-save-edit-${c.id}`}>Save</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={() => { setEditing(false); setDraft(c.body); }}>Cancel</Button></div>
            </div>
          ) : c.spoiler && !reveal ? (
            <button onClick={() => setReveal(true)} className="mt-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid={`button-reveal-${c.id}`}>Spoiler hidden — tap to reveal</button>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid={`text-body-${c.id}`}>{c.body}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button onClick={() => (user ? likeM.mutate() : openAuth("login"))} aria-pressed={liked} aria-label={liked ? "Unlike comment" : "Like comment"} data-testid={`button-like-comment-${c.id}`}
              className={`flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-accent ${liked ? "text-primary" : ""}`}>
              <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} /><span className="tabular-nums">{compact(likes)}</span>
            </button>
            {!isReply && <button onClick={() => (user ? setReplying((r) => !r) : openAuth("login"))} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-accent" data-testid={`button-reply-${c.id}`}><MessageSquare className="h-3.5 w-3.5" />Reply</button>}
            {c.mine && !editing && <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-accent" data-testid={`button-edit-${c.id}`}><Pencil className="h-3.5 w-3.5" />Edit</button>}
            {(c.mine || user?.role === "admin") && <button onClick={() => (confirmDel ? delM.mutate() : setConfirmDel(true))} onBlur={() => setConfirmDel(false)} className={`flex items-center gap-1 rounded-full px-2 py-1 hover:bg-accent ${confirmDel ? "bg-destructive/15 text-destructive" : "hover:text-destructive"}`} data-testid={`button-delete-${c.id}`}><Trash2 className="h-3.5 w-3.5" />{delM.isPending ? "Deleting…" : confirmDel ? "Tap again to delete" : "Delete"}</button>}
            {user && !c.mine && <button onClick={() => setReporting(true)} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-accent" data-testid={`button-report-${c.id}`}><Flag className="h-3.5 w-3.5" />Report</button>}
            {user?.role === "admin" && <button onClick={() => hideM.mutate()} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-accent" data-testid={`button-hide-${c.id}`}><ShieldAlert className="h-3.5 w-3.5" />{c.is_hidden ? "Unhide" : "Hide"}</button>}
          </div>
          {replying && <div className="mt-2"><Composer target={target} parentId={c.id} onDone={onChange} autoFocus onCancel={() => setReplying(false)} /></div>}
          {!!c.replies?.length && (
            <ul className="mt-3 space-y-3 border-l border-border pl-3" aria-label="Replies">
              {c.replies.map((r) => <div key={r.id} className="flex gap-1"><CornerDownRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><div className="flex-1"><CommentItem c={r} target={target} onChange={onChange} isReply /></div></div>)}
            </ul>
          )}
        </div>
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} type="comment" id={String(c.id)} />
    </li>
  );
}

const REASONS = [["spam", "Spam"], ["abuse", "Harassment or abuse"], ["sexual", "Sexual content"], ["violence", "Violence or threats"], ["copyright", "Copyright"], ["other", "Something else"]] as const;

export function ReportDialog({ open, onClose, type, id }: { open: boolean; onClose: () => void; type: "comment" | "series" | "chapter" | "user"; id: string }) {
  const { user } = useApp();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: () => reportTarget(user!.id, type, id, reason, details.trim().slice(0, 1000)),
    onSuccess: () => { toast({ title: "Report sent", description: "Thanks. A moderator will review it." }); setDetails(""); onClose(); },
    onError: (e) => toast({ title: "Report not sent", description: errMsg(e), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md sm:rounded-2xl">
        <DialogTitle>Report {type}</DialogTitle>
        <DialogDescription>Reports go to MANGASALT moderators.</DialogDescription>
        <div className="grid gap-2">
          {REASONS.map(([v, l]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${reason === v ? "border-primary bg-primary/10" : "border-border"}`}>
              <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="accent-[hsl(var(--primary))]" />{l}
            </label>
          ))}
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" rows={3} data-testid="input-report-details" />
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="rounded-full" data-testid="button-submit-report">{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send report</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
