import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Shield, Loader2, Search, Check, X, EyeOff, Eye, Ban, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useApp, timeAgo, compact } from "@/lib/app-context";
import { supabase, errMsg } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { PageHead, EmptyBox, InlineError, SignInPrompt } from "@/components/shared";
import { Pills } from "@/pages/trending";

function check<T>(r: { data: T; error: any }): T { if (r.error) throw new Error(errMsg(r.error)); return r.data; }
const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}) => check(await supabase.rpc(fn, args)) as T;
const TABS = [["overview", "Overview"], ["reports", "Reports"], ["users", "Users"], ["creators", "Creator requests"], ["takedowns", "Takedowns"], ["series", "Series"]] as const;
type Tab = (typeof TABS)[number][0];

function useAct() {
  const { toast } = useToast();
  return (fn: () => Promise<unknown>, ok: string) => fn().then(() => { toast({ title: ok }); queryClient.invalidateQueries({ queryKey: ["admin"] }); }).catch((e) => toast({ title: "Action failed", description: errMsg(e), variant: "destructive" }));
}

export default function AdminPage() {
  const { user, ready } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  if (!ready) return null;
  if (!user) return <div className="mx-auto max-w-3xl px-4 py-6"><PageHead icon={Shield} kicker="Admin" title="Admin" /><SignInPrompt what="open the admin dashboard" /></div>;
  if (user.role !== "admin") return <div className="mx-auto max-w-3xl px-4 py-6"><PageHead icon={Shield} kicker="Admin" title="Admin" /><EmptyBox>This area is for MANGASALT administrators.</EmptyBox></div>;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHead icon={Shield} kicker="Admin" title="Dashboard" />
      <div className="mb-5"><Pills label="Admin" value={tab} options={TABS} onChange={setTab} /></div>
      {tab === "overview" && <Overview go={setTab} />}
      {tab === "reports" && <Reports />}
      {tab === "users" && <Users />}
      {tab === "creators" && <CreatorRequests />}
      {tab === "takedowns" && <Takedowns />}
      {tab === "series" && <SeriesAdmin />}
    </div>
  );
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const q = useQuery({ queryKey: ["admin", "stats"], queryFn: () => rpc<Record<string, number>>("admin_stats") });
  if (q.error) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer relative h-20 overflow-hidden rounded-2xl bg-muted" />)}</div>;
  const s = q.data;
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  const cards: [string, string, string?, Tab?][] = [
    ["Users", compact(s.users), `${s.users_7d} new this week · ${s.users_unconfirmed} unconfirmed`, "users"],
    ["Open reports", String(s.reports_open), `${s.comments_hidden} comments hidden`, "reports"],
    ["Creator requests", String(s.creator_requests), `${s.creators} creators · ${s.admins} admins`, "creators"],
    ["Takedown requests", String(s.takedowns_open), "open", "takedowns"],
    ["Hosted series", String(s.series), `${s.series_published} published · ${s.series_drafts} drafts · ${s.series_taken_down} taken down`, "series"],
    ["Chapters", compact(s.chapters), `${s.chapters_published} published`],
    ["Chapter views", compact(s.views), `${compact(s.views_7d)} this week`],
    ["Engagement", `${compact(s.comments)} comments`, `${compact(s.likes)} likes · ${compact(s.bookmarks)} saves`],
    ["Storage", mb(s.storage_bytes), `${compact(s.storage_objects)} files`],
    ["Database", mb(s.db_bytes), `${s.banned} banned users`],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="admin-stats">
      {cards.map(([l, v, sub, t]) => {
        const body = <><p className="text-xs text-muted-foreground">{l}</p><p className="font-display mt-1 text-2xl font-semibold tabular-nums">{v}</p>{sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}</>;
        return t ? <button key={l} onClick={() => go(t)} className="rounded-2xl border border-border bg-card/50 p-3 text-left hover:border-primary/50">{body}</button> : <div key={l} className="rounded-2xl border border-border bg-card/50 p-3">{body}</div>;
      })}
    </div>
  );
}

type ReportRow = { id: number; target_type: string; target_id: string; reason: string; details: string; status: string; created_at: string; reporter: string; comment: null | { body: string; author: string; is_hidden: boolean; series_id: string | null; media_id: number | null } };
function Reports() {
  const { user } = useApp();
  const act = useAct();
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const q = useQuery({ queryKey: ["admin", "reports", status], queryFn: () => rpc<ReportRow[]>("admin_reports", { p_status: status, p_limit: 100 }) });
  const resolve = (id: number, st: "resolved" | "dismissed") => act(async () => check(await supabase.from("reports").update({ status: st, resolved_by: user!.id, resolved_at: new Date().toISOString() }).eq("id", id)), st === "resolved" ? "Report resolved" : "Report dismissed");
  const hide = (cid: string, hidden: boolean) => act(async () => check(await supabase.from("comments").update({ is_hidden: hidden, hidden_reason: hidden ? "Removed by moderator" : "" }).eq("id", Number(cid))), hidden ? "Comment hidden" : "Comment restored");
  return (
    <div>
      <div className="mb-3"><Pills label="Report status" value={status} options={[["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]] as const} onChange={setStatus} /></div>
      {q.error ? <InlineError error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" /> : !q.data?.length ? <EmptyBox>No {status === "all" ? "" : status} reports.</EmptyBox> : (
        <ul className="space-y-2" data-testid="list-reports">
          {q.data.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card/50 p-3">
              <p className="text-sm"><span className="font-semibold capitalize">{r.reason}</span> · {r.target_type} #{r.target_id} · by {r.reporter} · {timeAgo(r.created_at)} · <span className="capitalize text-muted-foreground">{r.status}</span></p>
              {r.details && <p className="mt-1 text-sm text-muted-foreground">“{r.details}”</p>}
              {r.comment && (
                <div className="mt-2 rounded-xl bg-muted/60 p-2.5 text-sm">
                  <p className="text-xs text-muted-foreground">{r.comment.author}{r.comment.is_hidden ? " · hidden" : ""} · <Link href={r.comment.media_id ? `/title/${r.comment.media_id}` : "/"} className="text-primary hover:underline">open thread</Link></p>
                  <p className="mt-1 whitespace-pre-wrap">{r.comment.body}</p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.target_type === "comment" && r.comment && <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => hide(r.target_id, !r.comment!.is_hidden)} data-testid={`button-toggle-hide-${r.id}`}>{r.comment.is_hidden ? <><Eye className="h-3.5 w-3.5" />Restore comment</> : <><EyeOff className="h-3.5 w-3.5" />Hide comment</>}</Button>}
                {r.status === "open" && <><Button size="sm" className="gap-1.5 rounded-full" onClick={() => resolve(r.id, "resolved")} data-testid={`button-resolve-${r.id}`}><Check className="h-3.5 w-3.5" />Resolve</Button><Button size="sm" variant="ghost" className="gap-1.5 rounded-full" onClick={() => resolve(r.id, "dismissed")} data-testid={`button-dismiss-${r.id}`}><X className="h-3.5 w-3.5" />Dismiss</Button></>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type UserRow = { id: string; email: string; display_name: string; role: string | null; banned: boolean; ban_reason: string; created_at: string; last_sign_in_at: string | null; confirmed: boolean; series_count: number };
function Users() {
  const { user } = useApp();
  const act = useAct();
  const [text, setText] = useState("");
  const [qs, setQs] = useState("");
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["admin", "users", qs, offset], queryFn: () => rpc<UserRow[]>("admin_list_users", { p_q: qs || null, p_limit: 50, p_offset: offset }) });
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setQs(text.trim()); }} className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search email or name" className="rounded-full pl-9" data-testid="input-admin-user-search" />
      </form>
      {q.error ? <InlineError error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <div className="shimmer relative h-40 overflow-hidden rounded-2xl bg-muted" /> : !q.data?.length ? <EmptyBox>No users found.</EmptyBox> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border" data-testid="list-admin-users">
          {q.data.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/u/${u.id}`} className="font-semibold hover:text-primary">{u.display_name}</Link>
                <p className="truncate text-xs text-muted-foreground">{u.email} · joined {timeAgo(u.created_at)}{u.confirmed ? "" : " · unconfirmed"}{u.series_count ? ` · ${u.series_count} series` : ""}{u.banned ? ` · banned${u.ban_reason ? `: ${u.ban_reason}` : ""}` : ""}</p>
              </div>
              <select value={u.role ?? "reader"} disabled={u.id === user!.id} onChange={(e) => act(() => rpc("admin_set_role", { p_user: u.id, p_role: e.target.value }), "Role updated")} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label={`Role for ${u.display_name}`} data-testid={`select-role-${u.id}`}>
                <option value="reader">Reader</option><option value="creator">Creator</option><option value="admin">Admin</option>
              </select>
              {u.id !== user!.id && (u.banned
                ? <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full" onClick={() => act(() => rpc("admin_set_ban", { p_user: u.id, p_banned: false, p_reason: "" }), "User unbanned")} data-testid={`button-unban-${u.id}`}><Undo2 className="h-3.5 w-3.5" />Unban</Button>
                : <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full text-destructive hover:text-destructive" onClick={() => act(() => rpc("admin_set_ban", { p_user: u.id, p_banned: true, p_reason: "Community guidelines" }), "User banned")} data-testid={`button-ban-${u.id}`}><Ban className="h-3.5 w-3.5" />Ban</Button>)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-between">
        <Button variant="ghost" size="sm" className="rounded-full" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))}>Previous</Button>
        <Button variant="ghost" size="sm" className="rounded-full" disabled={(q.data?.length ?? 0) < 50} onClick={() => setOffset((o) => o + 50)}>Next</Button>
      </div>
    </div>
  );
}

function CreatorRequests() {
  const act = useAct();
  const q = useQuery({
    queryKey: ["admin", "creator-requests"],
    queryFn: async () => {
      const rows = check(await supabase.from("creator_requests").select("*").order("created_at", { ascending: false }).limit(100)) as any[];
      const ids = rows.map((r) => r.user_id);
      const names = ids.length ? (check(await supabase.from("profiles").select("visitor_id,display_name").in("visitor_id", ids)) as any[]) : [];
      const m = new Map(names.map((n) => [n.visitor_id, n.display_name]));
      return rows.map((r) => ({ ...r, name: m.get(r.user_id) ?? "Reader" }));
    },
  });
  if (q.error) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" />;
  if (!q.data?.length) return <EmptyBox>No creator requests.</EmptyBox>;
  return (
    <ul className="space-y-2" data-testid="list-creator-requests">
      {q.data.map((r) => (
        <li key={r.user_id} className="rounded-2xl border border-border bg-card/50 p-3 text-sm">
          <p><Link href={`/u/${r.user_id}`} className="font-semibold hover:text-primary">{r.name}</Link> · {timeAgo(r.created_at)} · <span className="capitalize text-muted-foreground">{r.status}</span></p>
          {r.message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.message}</p>}
          {r.status === "pending" && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="gap-1.5 rounded-full" onClick={() => act(() => rpc("admin_set_role", { p_user: r.user_id, p_role: "creator" }), "Creator approved")} data-testid={`button-approve-${r.user_id}`}><Check className="h-3.5 w-3.5" />Approve</Button>
              <Button size="sm" variant="ghost" className="gap-1.5 rounded-full" onClick={() => act(async () => check(await supabase.from("creator_requests").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("user_id", r.user_id)), "Request rejected")} data-testid={`button-reject-${r.user_id}`}><X className="h-3.5 w-3.5" />Reject</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Takedowns() {
  const act = useAct();
  const q = useQuery({ queryKey: ["admin", "takedowns"], queryFn: async () => check(await supabase.from("takedown_requests").select("*").order("created_at", { ascending: false }).limit(100)) as any[] });
  if (q.error) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" />;
  if (!q.data?.length) return <EmptyBox>No takedown requests.</EmptyBox>;
  const set = (id: number, status: string) => act(async () => check(await supabase.from("takedown_requests").update({ status, resolved_at: new Date().toISOString() }).eq("id", id)), `Marked ${status}`);
  return (
    <ul className="space-y-2" data-testid="list-takedowns">
      {q.data.map((t) => (
        <li key={t.id} className="rounded-2xl border border-border bg-card/50 p-3 text-sm">
          <p><span className="font-semibold">{t.name}</span> · <a href={`mailto:${t.email}`} className="text-primary">{t.email}</a> · {timeAgo(t.created_at)} · <span className="capitalize text-muted-foreground">{t.status}</span></p>
          <p className="mt-1 break-words"><span className="text-muted-foreground">Content:</span> {t.target}</p>
          {t.details && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{t.details}</p>}
          {t.status === "open" && <div className="mt-2 flex gap-2"><Button size="sm" className="rounded-full" onClick={() => set(t.id, "resolved")}>Resolve</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={() => set(t.id, "dismissed")}>Dismiss</Button></div>}
        </li>
      ))}
    </ul>
  );
}

function SeriesAdmin() {
  const act = useAct();
  const [reason, setReason] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["admin", "series"], queryFn: async () => check(await supabase.from("hosted_series").select("id,slug,title,published,taken_down,takedown_reason,rights,rights_verified,owner_visitor,updated_at").order("updated_at", { ascending: false }).limit(200)) as any[] });
  if (q.error) return <InlineError error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" />;
  if (!q.data?.length) return <EmptyBox>No hosted series.</EmptyBox>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border" data-testid="list-admin-series">
      {q.data.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <Link href={`/studio/series/${s.id}`} className="font-semibold hover:text-primary">{s.title}</Link>
            <p className="text-xs text-muted-foreground">{s.rights}{s.rights_verified ? " · rights verified" : " · rights not verified"} · {s.taken_down ? `taken down${s.takedown_reason ? `: ${s.takedown_reason}` : ""}` : s.published ? "published" : "draft"} · {timeAgo(s.updated_at)}</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => act(async () => check(await supabase.from("hosted_series").update({ rights_verified: !s.rights_verified }).eq("id", s.id)), "Rights status updated")} data-testid={`button-verify-${s.slug}`}>{s.rights_verified ? "Unverify rights" : "Verify rights"}</Button>
          {s.taken_down
            ? <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => act(async () => check(await supabase.from("hosted_series").update({ taken_down: false, takedown_reason: "" }).eq("id", s.id)), "Series restored")} data-testid={`button-restore-${s.slug}`}>Restore</Button>
            : <>
                <Input value={reason[s.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [s.id]: e.target.value }))} placeholder="Reason" className="h-8 w-32 text-xs" />
                <Button size="sm" variant="ghost" className="h-8 rounded-full text-destructive hover:text-destructive" onClick={() => act(async () => check(await supabase.from("hosted_series").update({ taken_down: true, takedown_reason: (reason[s.id] ?? "").trim() || "Copyright claim" }).eq("id", s.id)), "Series taken down")} data-testid={`button-takedown-${s.slug}`}>Take down</Button>
              </>}
        </li>
      ))}
    </ul>
  );
}
