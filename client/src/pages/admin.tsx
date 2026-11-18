// Admin & moderation dashboard.
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LayoutDashboard, CheckSquare, Users, PenTool, BookOpen, Scale, Flag, ShieldAlert, HardDrive, Activity, DatabaseBackup, ScrollText, Megaphone, Loader2, Check, X, Eye, Download, Trash2, RefreshCw, BadgeCheck, Ban, Search, ShieldCheck, LogOut, Globe2, Layers } from "lucide-react";
import ChaptersTab from "@/pages/admin-chapters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { API_BASE, apiRequest, getAuthToken, invalidatePrefixes } from "@/lib/queryClient";
import { useApp, compact, timeAgo, TYPE_LABEL } from "@/lib/app-context";
import { Avatar, EmptyBox, asset } from "@/components/shared";
import { isAdmin, isStaff, regionLabel, COUNTRIES, parseRegions, type AdminOverview, type HealthReport, type BackupFile, type ModLog } from "@shared/platform";

const TABS = [
  ["overview", "Overview", LayoutDashboard, false], ["approvals", "Approvals", CheckSquare, false], ["users", "Users", Users, false], ["creators", "Creators", PenTool, false],
  ["series", "Series", BookOpen, false], ["chapters", "Chapters", Layers, false], ["copyright", "Copyright", Scale, false], ["reports", "Reports", Flag, false], ["spam", "Spam", ShieldAlert, false],
  ["uploads", "Uploads", HardDrive, true], ["health", "Server health", Activity, true], ["backups", "Backups", DatabaseBackup, true], ["logs", "Moderation logs", ScrollText, false], ["broadcast", "Broadcast", Megaphone, true],
] as const;
type Tab = (typeof TABS)[number][0];

const bytes = (n: number | null | undefined) => { if (n == null) return "–"; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = n; while (v >= 1024 && i < 4) { v /= 1024; i++; } return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`; };
const dur = (ms: number) => { const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const tip = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 } };

function useAct(onDone?: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: any; ok?: string }) => (await apiRequest(method, url, body)).json(),
    onSuccess: (_d, v) => { invalidatePrefixes("/api/admin"); if (v.ok) toast({ title: v.ok }); onDone?.(); },
    onError: (e: Error) => toast({ title: "Action failed", description: e.message }),
  });
}
function Card({ title, children, action, className = "" }: { title?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 ${className}`}>{(title || action) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h2 className="font-semibold">{title}</h2>}{action}</div>}{children}</section>;
}
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return <div className={`rounded-xl border p-3 ${tone === "warn" && Number(value) > 0 ? "border-primary/50 bg-primary/10" : "border-border bg-background/50"}`}><p className="font-display text-2xl font-semibold tabular-nums">{typeof value === "number" ? compact(value) : value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  const c = { ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300", bad: "bg-primary/15 text-primary", muted: "bg-secondary text-muted-foreground" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}
/** Ask for a reason before a destructive action. */
function useReason() {
  const [state, setState] = useState<null | { title: string; label: string; required: boolean; run: (r: string) => void }>(null);
  const [text, setText] = useState("");
  const ask = (title: string, run: (r: string) => void, label = "Reason", required = true) => { setText(""); setState({ title, label, required, run }); };
  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent className="max-w-md">
        <DialogTitle>{state?.title}</DialogTitle>
        <DialogDescription>This is recorded in the moderation log{state?.required ? " and shown to the person affected" : ""}.</DialogDescription>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); state?.run(text); setState(null); }}>
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={state?.label} aria-label={state?.label} maxLength={500} />
          <Button type="submit" className="w-full rounded-full" disabled={!!state?.required && text.trim().length < 3}>Confirm</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
  return { ask, dialog };
}

// ======================= Overview =======================
function Overview({ go }: { go: (t: Tab) => void }) {
  const q = useQuery<AdminOverview>({ queryKey: ["/api/admin/overview"], staleTime: 0, refetchOnMount: "always" });
  const d = q.data;
  if (!d) return <Spinner />;
  const t = d.totals, qu = d.queues;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([["Pending series", qu.pendingSeries, "approvals"], ["Pending chapters", qu.pendingChapters, "approvals"], ["Open reports", qu.openReports, "reports"], ["Copyright complaints", qu.openTakedowns, "copyright"], ["Held as spam", qu.spam, "spam"]] as const).map(([l, v, tab]) => (
          <button key={l} onClick={() => go(tab)} className="text-left"><Stat label={l} value={v} tone="warn" /></button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Users" value={t.users} /><Stat label="New this week" value={t.newUsers7} /><Stat label="Active today" value={t.activeToday} /><Stat label="Active 7 days" value={t.active7} /><Stat label="Active 30 days" value={t.active30} />
        <Stat label="Creators" value={t.creators} /><Stat label="Series" value={t.series} /><Stat label="Live chapters" value={t.chapters} /><Stat label="Comments" value={t.comments} /><Stat label="Reads today" value={t.readsToday} />
      </div>
      <Card title="Activity, last 30 days">
        <div className="h-64" role="img" aria-label="Daily reads, active readers, signups and comments over the last 30 days">
          <ResponsiveContainer><AreaChart data={d.daily.map((x) => ({ ...x, label: x.day.slice(5) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={4} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="reads" name="Reads" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / .2)" strokeWidth={2} />
            <Area dataKey="active" name="Active readers" stroke="hsl(258 70% 58%)" fill="hsl(258 70% 58% / .15)" strokeWidth={2} />
            <Area dataKey="signups" name="Signups" stroke="hsl(158 60% 40%)" fill="transparent" strokeWidth={2} />
            <Area dataKey="comments" name="Comments" stroke="hsl(43 74% 49%)" fill="transparent" strokeWidth={2} />
          </AreaChart></ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Top MANGASALT series (30 days)"><ol className="space-y-1.5">{d.topSeries.map((s, i) => <li key={s.id}><Link href={`/series/${s.slug}`} className="flex items-center gap-2 text-sm hover:text-primary"><span className="w-4 text-muted-foreground">{i + 1}</span><img src={asset(s.cover)} alt="" className="h-9 w-6 rounded object-cover" /><span className="flex-1 truncate">{s.title}</span><span className="tabular-nums text-muted-foreground">{compact(s.reads)} reads · {compact(s.likes)} likes</span></Link></li>)}</ol></Card>
        <Card title="Top official titles (30 days)">{!d.topWorld.length ? <p className="text-sm text-muted-foreground">No reads yet.</p> : <ol className="space-y-1.5">{d.topWorld.map((s, i) => <li key={s.id}><Link href={`/title/${s.id}`} className="flex items-center gap-2 text-sm hover:text-primary"><span className="w-4 text-muted-foreground">{i + 1}</span><img src={asset(s.cover)} alt="" className="h-9 w-6 rounded object-cover" /><span className="flex-1 truncate">{s.title}</span><span className="tabular-nums text-muted-foreground">{compact(s.reads)}</span></Link></li>)}</ol>}</Card>
        <Card title="Reads by type"><div className="h-48"><ResponsiveContainer><BarChart data={d.byType.map((x) => ({ ...x, label: TYPE_LABEL[x.type] ?? x.type }))}><XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} /><YAxis width={32} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} /><Tooltip {...tip} /><Bar dataKey="reads" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card title="Users by country"><ul className="space-y-1 text-sm">{d.byCountry.map((c) => <li key={c.country} className="flex justify-between"><span>{COUNTRIES.find(([k]) => k === c.country)?.[1] ?? c.country}</span><span className="tabular-nums text-muted-foreground">{c.users}</span></li>)}</ul></Card>
      </div>
    </div>
  );
}
function Spinner() { return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>; }

// ======================= Approvals =======================
function Approvals() {
  const q = useQuery<any>({ queryKey: ["/api/admin/approvals"], staleTime: 0, refetchOnMount: "always" });
  const act = useAct();
  const { ask, dialog } = useReason();
  const [preview, setPreview] = useState<null | { title: string; pages: string[] }>(null);
  const review = (kind: "series" | "chapters", id: number, approve: boolean, title: string) =>
    approve ? act.mutate({ method: "POST", url: `/api/admin/${kind}/${id}/review`, body: { decision: "approve" }, ok: `Approved ${title}` })
      : ask(`Reject ${title}`, (note) => act.mutate({ method: "POST", url: `/api/admin/${kind}/${id}/review`, body: { decision: "reject", note }, ok: "Rejected and creator notified" }), "What needs to change?");
  if (!q.data) return <Spinner />;
  const { series, chapters, recent } = q.data;
  return (
    <div className="space-y-4">
      <Card title={`Series waiting for approval · ${series.length}`}>
        {!series.length ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : <ul className="space-y-3">{series.map((s: any) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row">
            <img src={asset(s.cover)} alt="" className="h-36 w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.title} <Pill>{TYPE_LABEL[s.type]}</Pill></p>
              <p className="text-xs text-muted-foreground">by {s.creator.displayName} (@{s.creator.username}){s.creator.verified ? " · verified" : ""} · {timeAgo(s.createdAt)} · {s.chapters} chapter{s.chapters === 1 ? "" : "s"} · {regionLabel(s.regions)}</p>
              <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{s.synopsis}</p>
              <p className="mt-1 text-xs">{s.genres.join(" · ")}</p>
            </div>
            <div className="flex shrink-0 gap-2 sm:flex-col">
              <Link href={`/series/${s.slug}`}><Button size="sm" variant="outline" className="w-full gap-1 rounded-full"><Eye className="h-3.5 w-3.5" />Preview</Button></Link>
              <Button size="sm" className="gap-1 rounded-full" onClick={() => review("series", s.id, true, s.title)} data-testid={`button-approve-series-${s.id}`}><Check className="h-3.5 w-3.5" />Approve</Button>
              <Button size="sm" variant="outline" className="gap-1 rounded-full text-primary" onClick={() => review("series", s.id, false, s.title)}><X className="h-3.5 w-3.5" />Reject</Button>
            </div>
          </li>
        ))}</ul>}
      </Card>
      <Card title={`Chapters waiting for approval · ${chapters.length}`}>
        {!chapters.length ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : <ul className="divide-y divide-border">{chapters.map((c: any) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <img src={asset(c.series.cover)} alt="" className="h-14 w-10 rounded object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.series.title} · Chapter {c.number}: {c.title}</p><p className="text-xs text-muted-foreground">{c.pages.length} pages · {c.creator.displayName} · {timeAgo(c.createdAt)}{c.publishAt > Date.now() ? ` · scheduled ${when(c.publishAt)}` : ""}</p></div>
            <Button size="sm" variant="outline" className="gap-1 rounded-full" onClick={() => setPreview({ title: `${c.series.title} · Chapter ${c.number}`, pages: c.pages })}><Eye className="h-3.5 w-3.5" />Pages</Button>
            <Button size="sm" className="gap-1 rounded-full" onClick={() => review("chapters", c.id, true, `chapter ${c.number}`)} data-testid={`button-approve-chapter-${c.id}`}><Check className="h-3.5 w-3.5" />Approve</Button>
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-primary" onClick={() => review("chapters", c.id, false, `chapter ${c.number}`)}><X className="h-3.5 w-3.5" />Reject</Button>
          </li>
        ))}</ul>}
      </Card>
      {!!recent.length && <Card title="Recent decisions"><ul className="space-y-1 text-sm">{recent.map((r: any) => <li key={r.id} className="flex gap-2"><span className="w-24 shrink-0 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span><span className="flex-1 truncate"><b>{r.display_name ?? "System"}</b> {r.action.replace(".", " ")}: {r.details}</span></li>)}</ul></Card>}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle>{preview?.title}</DialogTitle><DialogDescription>{preview?.pages.length} pages</DialogDescription>
          <div className="space-y-2">{preview?.pages.map((p, i) => <img key={i} src={asset(p)} alt={`Page ${i + 1}`} className="w-full rounded" loading="lazy" />)}</div>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}

// ======================= Users =======================
function UsersTab() {
  const { user } = useApp();
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState("");
  const list = useQuery<any[]>({ queryKey: ["/api/admin/users", { q, role, status }], staleTime: 0 });
  const act = useAct();
  const { ask, dialog } = useReason();
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative flex-1"><span className="sr-only">Search users</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="pl-9" /></label>
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm"><option value="">All roles</option><option value="user">Readers</option><option value="moderator">Moderators</option><option value="admin">Admins</option></select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm"><option value="">Any status</option><option value="banned">Suspended</option><option value="creators">Creators</option></select>
      </div>
      {!list.data ? <Spinner /> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 pr-2 font-medium">User</th><th className="pr-2 font-medium">Role</th><th className="pr-2 font-medium">Joined</th><th className="pr-2 font-medium">Last active</th><th className="pr-2 font-medium">Activity</th><th className="font-medium"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody className="divide-y divide-border">{list.data.map((u) => (
          <tr key={u.id}>
            <td className="py-2 pr-2"><Link href={`/u/${u.username}`} className="flex items-center gap-2 hover:text-primary"><Avatar user={u} size={28} /><span><span className="block font-medium">{u.displayName}</span><span className="text-xs text-muted-foreground">@{u.username}</span></span></Link></td>
            <td className="pr-2">{isAdmin(user) && u.id !== user?.id ? <select aria-label={`Role for ${u.username}`} value={u.role} onChange={(e) => act.mutate({ method: "PATCH", url: `/api/admin/users/${u.id}`, body: { role: e.target.value }, ok: "Role updated" })} className="rounded border border-border bg-background px-1 py-0.5 text-xs"><option value="user">Reader</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select> : <Pill>{u.role}</Pill>} {u.banned && <Pill tone="bad">Suspended</Pill>} {u.isCreator ? <Pill>Creator</Pill> : null}</td>
            <td className="pr-2 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
            <td className="pr-2 text-xs text-muted-foreground">{u.lastActive ? timeAgo(u.lastActive) : "–"}</td>
            <td className="pr-2 text-xs text-muted-foreground">{u.comments} comments{u.reports ? <> · <span className="text-primary">{u.reports} reports</span></> : null}</td>
            <td className="whitespace-nowrap text-right">{u.id !== user?.id && <>
              {u.banned ? <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => act.mutate({ method: "PATCH", url: `/api/admin/users/${u.id}`, body: { banned: false }, ok: "Suspension lifted" })}>Unsuspend</Button>
                : <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full text-primary" onClick={() => ask(`Suspend @${u.username}`, (reason) => act.mutate({ method: "PATCH", url: `/api/admin/users/${u.id}`, body: { banned: true, reason }, ok: "User suspended" }))}><Ban className="h-3.5 w-3.5" />Suspend</Button>}
              <Button size="sm" variant="ghost" className="h-7 rounded-full" aria-label={`Sign out @${u.username} everywhere`} onClick={() => act.mutate({ method: "PATCH", url: `/api/admin/users/${u.id}`, body: { signOut: true }, ok: "Signed out everywhere" })}><LogOut className="h-3.5 w-3.5" /></Button>
            </>}</td>
          </tr>
        ))}</tbody>
      </table></div>}
      {dialog}
    </Card>
  );
}

// ======================= Creators =======================
function CreatorsTab() {
  const list = useQuery<any[]>({ queryKey: ["/api/admin/creators"], staleTime: 0 });
  const act = useAct();
  const { ask, dialog } = useReason();
  if (!list.data) return <Spinner />;
  return (
    <Card title={`Creators · ${list.data.length}`}>
      <ul className="divide-y divide-border">{list.data.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <Avatar user={c} size={36} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">{c.displayName} <span className="text-xs text-muted-foreground">@{c.username}</span>{c.verified ? <Pill tone="ok">Verified</Pill> : <Pill>Needs review</Pill>}{!c.canPublish && <Pill tone="bad">Publishing paused</Pill>}{c.banned && <Pill tone="bad">Suspended</Pill>}</p>
            <p className="text-xs text-muted-foreground">{c.series} series{c.pending ? ` (${c.pending} pending)` : ""} · {c.chapters} chapters · {compact(c.views)} views · {compact(c.likes)} likes · {compact(c.followers)} followers{c.complaints ? ` · ${c.complaints} copyright complaints` : ""}</p>
          </div>
          <Button size="sm" variant={c.verified ? "outline" : "default"} className="gap-1 rounded-full" onClick={() => act.mutate({ method: "PATCH", url: `/api/admin/creators/${c.id}`, body: { verified: !c.verified }, ok: c.verified ? "Verification removed" : "Creator verified" })}><BadgeCheck className="h-3.5 w-3.5" />{c.verified ? "Unverify" : "Verify"}</Button>
          {c.canPublish ? <Button size="sm" variant="outline" className="rounded-full text-primary" onClick={() => ask(`Pause publishing for @${c.username}`, (reason) => act.mutate({ method: "PATCH", url: `/api/admin/creators/${c.id}`, body: { canPublish: false, reason }, ok: "Publishing paused" }))}>Pause publishing</Button>
            : <Button size="sm" variant="outline" className="rounded-full" onClick={() => act.mutate({ method: "PATCH", url: `/api/admin/creators/${c.id}`, body: { canPublish: true }, ok: "Publishing restored" })}>Restore publishing</Button>}
        </li>
      ))}</ul>
      <p className="mt-3 text-xs text-muted-foreground">Verified creators publish without waiting for review. Everyone else's new series and chapters go to Approvals first.</p>
      {dialog}
    </Card>
  );
}

// ======================= Series =======================
function RegionsEditor({ s, onSave }: { s: any; onSave: (r: string) => void }) {
  const p = parseRegions(s.regions);
  const [mode, setMode] = useState(p.mode); const [codes, setCodes] = useState<string[]>(p.codes);
  return (
    <div className="space-y-2">
      <select aria-label="Availability" value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"><option value="all">Worldwide</option><option value="only">Only in…</option><option value="except">Everywhere except…</option></select>
      {mode !== "all" && <div className="grid max-h-52 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 text-xs">{COUNTRIES.map(([k, n]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={codes.includes(k)} onChange={(e) => setCodes(e.target.checked ? [...codes, k] : codes.filter((c) => c !== k))} />{n}</label>)}</div>}
      <Button size="sm" className="w-full rounded-full" onClick={() => onSave(mode === "all" || !codes.length ? "" : `${mode}:${codes.join(",")}`)}>Save regions</Button>
    </div>
  );
}
function SeriesTab() {
  const [q, setQ] = useState("");
  const list = useQuery<any[]>({ queryKey: ["/api/admin/series", { q }], staleTime: 0 });
  const act = useAct();
  const { ask, dialog } = useReason();
  const [regions, setRegions] = useState<any>(null);
  return (
    <Card>
      <label className="relative mb-3 block"><span className="sr-only">Search series</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search series" className="pl-9" /></label>
      {!list.data ? <Spinner /> : <ul className="divide-y divide-border">{list.data.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <img src={asset(s.cover)} alt="" className="h-12 w-8 rounded object-cover" />
          <div className="min-w-0 flex-1"><Link href={`/series/${s.slug}`} className="block truncate font-medium hover:text-primary">{s.title}</Link><p className="text-xs text-muted-foreground">@{s.username} · {compact(s.views)} views · {regionLabel(s.regions)}</p></div>
          <Pill tone={s.approval === "approved" ? "ok" : s.approval === "pending" ? "warn" : "bad"}>{s.approval}</Pill>{s.removed ? <Pill tone="bad">Removed</Pill> : null}
          <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full" onClick={() => setRegions(s)}><Globe2 className="h-3.5 w-3.5" />Regions</Button>
          {s.removed ? <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => act.mutate({ method: "POST", url: `/api/admin/series/${s.id}/visibility`, body: { removed: false }, ok: "Series restored" })}>Restore</Button>
            : <Button size="sm" variant="ghost" className="h-7 rounded-full text-primary" onClick={() => ask(`Take down “${s.title}”`, (reason) => act.mutate({ method: "POST", url: `/api/admin/series/${s.id}/visibility`, body: { removed: true, reason }, ok: "Series taken down" }))}>Take down</Button>}
        </li>
      ))}</ul>}
      <Dialog open={!!regions} onOpenChange={(o) => !o && setRegions(null)}>
        <DialogContent className="max-w-md"><DialogTitle>Regional availability</DialogTitle><DialogDescription>{regions?.title}</DialogDescription>
          {regions && <RegionsEditor s={regions} onSave={(r) => { act.mutate({ method: "PATCH", url: `/api/admin/series/${regions.id}/regions`, body: { regions: r }, ok: "Regions updated" }); setRegions(null); }} />}
        </DialogContent>
      </Dialog>
      {dialog}
    </Card>
  );
}

// ======================= Copyright =======================
function CopyrightTab() {
  const [status, setStatus] = useState("");
  const list = useQuery<any[]>({ queryKey: ["/api/admin/takedowns", { status }], staleTime: 0 });
  const series = useQuery<any[]>({ queryKey: ["/api/admin/series", { q: "" }] });
  const act = useAct();
  const [open, setOpen] = useState<any>(null);
  const [note, setNote] = useState(""); const [remove, setRemove] = useState("");
  const tone = (s: string) => (s === "open" ? "bad" : s === "reviewing" ? "warn" : s === "resolved" ? "ok" : "muted") as any;
  return (
    <Card title="Copyright complaints" action={<select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm"><option value="">All</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select>}>
      {!list.data ? <Spinner /> : !list.data.length ? <p className="text-sm text-muted-foreground">No complaints.</p> : <ul className="divide-y divide-border">{list.data.map((t) => (
        <li key={t.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">#{t.id} · {t.ownerOf}</span><Pill tone={tone(t.status)}>{t.status}</Pill><span className="text-xs text-muted-foreground">{when(t.createdAt)}{t.handler ? ` · handled by ${t.handler}` : ""}</span>
            <Button size="sm" variant="outline" className="ml-auto h-7 rounded-full" onClick={() => { setOpen(t); setNote(t.note ?? ""); setRemove(""); }}>Handle</Button></div>
          <p className="mt-1 text-sm"><span className="text-muted-foreground">From</span> {t.name} &lt;<a href={`mailto:${t.email}`} className="text-primary">{t.email}</a>&gt;</p>
          <p className="mt-0.5 break-all text-sm"><span className="text-muted-foreground">Content:</span> {t.target}</p>
          {t.details && <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{t.details}</p>}
          {t.note && <p className="mt-1 text-xs"><b>Note:</b> {t.note}</p>}
        </li>
      ))}</ul>}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Complaint #{open?.id}</DialogTitle><DialogDescription>{open?.ownerOf}: {open?.target}</DialogDescription>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note / response" aria-label="Note" />
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Take down a series when resolving (optional)</span>
            <select value={remove} onChange={(e) => setRemove(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"><option value="">Don't remove anything</option>{series.data?.filter((s) => !s.removed).map((s) => <option key={s.id} value={s.id}>{s.title} (@{s.username})</option>)}</select></label>
          <div className="grid grid-cols-3 gap-2">
            {([["reviewing", "Reviewing"], ["resolved", "Resolve"], ["rejected", "Reject"]] as const).map(([s, l]) => <Button key={s} variant={s === "resolved" ? "default" : "outline"} className="rounded-full" onClick={() => { act.mutate({ method: "PATCH", url: `/api/admin/takedowns/${open.id}`, body: { status: s, note, removeSeriesId: s === "resolved" && remove ? Number(remove) : undefined }, ok: `Marked ${s}` }); setOpen(null); }}>{l}</Button>)}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ======================= Reports =======================
function ReportsTab() {
  const [status, setStatus] = useState("open");
  const list = useQuery<any[]>({ queryKey: ["/api/admin/reports", { status }], staleTime: 0 });
  const act = useAct();
  const { ask, dialog } = useReason();
  return (
    <Card title="Content reports" action={<div className="flex rounded-full border border-border p-0.5 text-sm">{["open", "resolved"].map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 capitalize ${status === s ? "bg-primary text-primary-foreground" : ""}`}>{s}</button>)}</div>}>
      {!list.data ? <Spinner /> : !list.data.length ? <p className="text-sm text-muted-foreground">No {status} reports.</p> : <ul className="space-y-3">{list.data.map((g) => (
        <li key={g.key} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2"><Pill tone="bad">{g.reports.length} report{g.reports.length === 1 ? "" : "s"}</Pill><Pill>{g.targetType}</Pill>
            {g.target ? (g.target.link ? <Link href={g.target.link} className="min-w-0 flex-1 truncate font-medium hover:text-primary">{g.target.label}</Link> : <span className="min-w-0 flex-1 truncate font-medium">{g.target.label}</span>) : <span className="flex-1 text-muted-foreground">Deleted content</span>}
            {g.target?.hidden && <Pill>Already hidden</Pill>}
          </div>
          {g.target?.body && <blockquote className="mt-2 line-clamp-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">{g.target.body}</blockquote>}
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">{g.reports.slice(0, 5).map((r: any) => <li key={r.id}><b className="text-foreground">{r.reason}</b> · @{r.reporter.username} · {timeAgo(r.createdAt)}{r.details ? ` — ${r.details}` : ""}{r.resolution ? ` · ${r.resolution}` : ""}</li>)}</ul>
          {status === "open" && <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => act.mutate({ method: "POST", url: "/api/admin/reports/resolve", body: { targetType: g.targetType, targetId: g.targetId, action: "dismiss" }, ok: "Dismissed" })}>Dismiss</Button>
            <Button size="sm" className="rounded-full" onClick={() => ask(g.targetType === "user" ? "Suspend this user" : `Remove this ${g.targetType}`, (note) => act.mutate({ method: "POST", url: "/api/admin/reports/resolve", body: { targetType: g.targetType, targetId: g.targetId, action: "hide", note }, ok: "Removed" }), "Reason (sent to the owner)", false)} data-testid={`button-hide-${g.key}`}>{g.targetType === "user" ? "Suspend" : "Remove"}</Button>
          </div>}
        </li>
      ))}</ul>}
      {dialog}
    </Card>
  );
}

// ======================= Spam =======================
function SpamTab() {
  const { user } = useApp();
  const q = useQuery<any>({ queryKey: ["/api/admin/spam"], staleTime: 0 });
  const act = useAct();
  const [cfg, setCfg] = useState<null | { threshold: number; blocked: string }>(null);
  if (!q.data) return <Spinner />;
  const { flags, settings, stats } = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2"><Stat label="Caught this week" value={stats.caught7} /><Stat label="Released (false positives)" value={stats.released} /><Stat label="Removed" value={stats.removed} /></div>
      <Card title={`Held for review · ${flags.length}`}>
        {!flags.length ? <p className="text-sm text-muted-foreground">No comments held as spam.</p> : <ul className="divide-y divide-border">{flags.map((f: any) => (
          <li key={f.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm"><b>@{f.user.username}</b><span className="text-xs text-muted-foreground">joined {timeAgo(f.user.joined)} · posted {timeAgo(f.postedAt)}</span><Pill tone="bad">score {f.score}</Pill></div>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background/60 p-2 text-sm">{f.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{f.reasons.join(" · ")}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => act.mutate({ method: "POST", url: `/api/admin/spam/${f.id}`, body: { action: "release" }, ok: "Released" })}>Not spam</Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => act.mutate({ method: "POST", url: `/api/admin/spam/${f.id}`, body: { action: "remove" }, ok: "Deleted" })}>Delete</Button>
              <Button size="sm" className="rounded-full" onClick={() => act.mutate({ method: "POST", url: `/api/admin/spam/${f.id}`, body: { action: "ban" }, ok: "Deleted and user suspended" })}>Delete &amp; suspend</Button>
            </div>
          </li>
        ))}</ul>}
      </Card>
      <Card title="Detection settings" action={isAdmin(user) && !cfg && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCfg({ threshold: settings.threshold, blocked: settings.blocked.join("\n") })}>Edit</Button>}>
        {cfg ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ method: "PUT", url: "/api/admin/spam/settings", body: { threshold: cfg.threshold, blocked: cfg.blocked.split("\n") }, ok: "Spam settings saved" }); setCfg(null); }}>
          <label className="block text-sm">Hold comments scoring at least <Input type="number" min={1} max={10} value={cfg.threshold} onChange={(e) => setCfg({ ...cfg, threshold: Number(e.target.value) })} className="mt-1 w-24" /></label>
          <label className="block text-sm">Blocked phrases (one per line)<Textarea rows={6} value={cfg.blocked} onChange={(e) => setCfg({ ...cfg, blocked: e.target.value })} className="mt-1 font-mono text-xs" /></label>
          <div className="flex gap-2"><Button type="submit" className="rounded-full">Save</Button><Button type="button" variant="ghost" onClick={() => setCfg(null)}>Cancel</Button></div>
        </form> : <p className="text-sm text-muted-foreground">Comments are scored for links, repeated text, all caps, posting floods, brand-new accounts and {settings.blocked.length} blocked phrases. Anything scoring {settings.threshold} or more is hidden until a moderator reviews it.</p>}
      </Card>
    </div>
  );
}

// ======================= Uploads =======================
function UploadsTab() {
  const q = useQuery<any>({ queryKey: ["/api/admin/uploads"], staleTime: 0 });
  const act = useAct();
  const [filter, setFilter] = useState<"all" | "orphans">("all");
  if (!q.data) return <Spinner />;
  const d = q.data;
  const files = d.recent.filter((f: any) => filter === "all" || f.orphan);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Files" value={d.totalFiles} /><Stat label="Storage used" value={bytes(d.totalBytes)} /><Stat label="Unused files" value={d.orphanFiles} tone="warn" /><Stat label="Reclaimable" value={bytes(d.orphanBytes)} /></div>
      <Card title="Storage by creator"><ul className="space-y-1 text-sm">{d.byUser.slice(0, 12).map((u: any) => <li key={u.userId} className="flex gap-2"><span className="flex-1 truncate">{u.displayName} <span className="text-xs text-muted-foreground">@{u.username}</span></span><span className="tabular-nums text-muted-foreground">{u.files} files · {bytes(u.bytes)}{u.orphans ? ` · ${u.orphans} unused` : ""}</span></li>)}</ul></Card>
      <Card title="Recent uploads" action={<div className="flex gap-2"><select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as any)} className="rounded-lg border border-border bg-background px-2 text-sm"><option value="all">All</option><option value="orphans">Unused only</option></select>
        <Button size="sm" variant="outline" className="gap-1 rounded-full" disabled={!d.orphanFiles} onClick={() => confirm("Delete unused uploads older than an hour?") && act.mutate({ method: "POST", url: "/api/admin/uploads/clean", body: {}, ok: "Unused uploads cleaned" })}><Trash2 className="h-3.5 w-3.5" />Clean unused</Button></div>}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">{files.slice(0, 60).map((f: any) => (
          <li key={f.path} className="relative"><a href={asset(f.path)} target="_blank" rel="noreferrer"><img src={asset(f.path)} alt="" loading="lazy" className="aspect-[2/3] w-full rounded object-cover" /></a>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{bytes(f.bytes)} · {timeAgo(f.modifiedAt)}</p>{f.orphan && <span className="absolute left-1 top-1"><Pill tone="warn">Unused</Pill></span>}</li>
        ))}</ul>
      </Card>
    </div>
  );
}

// ======================= Health =======================
function HealthTab() {
  const q = useQuery<HealthReport>({ queryKey: ["/api/admin/health"], staleTime: 0, refetchInterval: 15_000 });
  const h = q.data;
  if (!h) return <Spinner />;
  const memPct = Math.round((1 - h.memory.systemFree / h.memory.systemTotal) * 100);
  const diskPct = h.disk.totalBytes && h.disk.freeBytes != null ? Math.round((1 - h.disk.freeBytes / h.disk.totalBytes) * 100) : null;
  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${h.status === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : h.status === "degraded" ? "border-amber-500/40 bg-amber-500/10" : "border-primary/50 bg-primary/10"}`} role="status">
        <Activity className="h-5 w-5" /><p className="font-semibold">{h.status === "ok" ? "All systems normal" : h.status === "degraded" ? "Degraded performance" : "Service problem"}</p>
        <p className="text-sm text-muted-foreground">Up {dur(h.uptime)} · Node {h.node} · {h.platform}</p>
        <Button size="sm" variant="ghost" className="ml-auto gap-1 rounded-full" onClick={() => q.refetch()}><RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Requests / min" value={h.requests.perMinute} /><Stat label="Avg response" value={`${h.requests.avgMs} ms`} /><Stat label="p95 response" value={`${h.requests.p95Ms} ms`} /><Stat label="Server errors" value={h.requests.errors5xx} tone="warn" />
        <Stat label="Memory used" value={`${memPct}%`} /><Stat label="App memory" value={bytes(h.memory.rss)} /><Stat label="CPU load (1m)" value={`${h.load[0]?.toFixed(2)} / ${h.cpus}`} /><Stat label="Disk used" value={diskPct != null ? `${diskPct}%` : "–"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Services"><ul className="space-y-1.5 text-sm">{h.services.map((s) => <li key={s.name} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${s.ok ? "bg-emerald-500" : "bg-primary"}`} aria-hidden /><span className="flex-1">{s.name}</span><span className="text-xs text-muted-foreground">{s.ok ? "OK" : "Down"} · {s.ms != null ? `${s.ms} ms` : s.detail}</span></li>)}</ul></Card>
        <Card title="Storage"><ul className="space-y-1 text-sm">{([["Database", h.disk.dbBytes], ["Write-ahead log", h.disk.walBytes], [`Uploads (${h.disk.uploadsFiles} files)`, h.disk.uploadsBytes], ["Backups", h.disk.backupsBytes], ["Free disk", h.disk.freeBytes]] as const).map(([l, v]) => <li key={l} className="flex justify-between"><span>{l}</span><span className="tabular-nums text-muted-foreground">{bytes(v)}</span></li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Integrity check: {h.db.integrity} · Last backup: {h.lastBackup ? when(h.lastBackup) : "never"}</p></Card>
        <Card title="Slowest endpoints"><ul className="space-y-1 text-sm">{h.requests.slowest.map((s) => <li key={s.path} className="flex justify-between gap-2"><code className="truncate text-xs">{s.path}</code><span className="tabular-nums text-muted-foreground">{s.ms} ms</span></li>)}</ul></Card>
        <Card title="Recent errors">{!h.recentErrors.length ? <p className="text-sm text-muted-foreground">No server errors recorded.</p> : <ul className="space-y-1 text-xs">{h.recentErrors.map((e, i) => <li key={i}><span className="text-muted-foreground">{timeAgo(e.at)}</span> <b>{e.status}</b> {e.method} <code>{e.path}</code> {e.message}</li>)}</ul>}</Card>
      </div>
      <Card title="Database tables"><div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">{h.db.tables.map((t) => <div key={t.name} className="flex justify-between"><code className="text-xs">{t.name}</code><span className="tabular-nums text-muted-foreground">{compact(t.rows)}</span></div>)}</div></Card>
    </div>
  );
}

// ======================= Backups =======================
function BackupsTab() {
  const { toast } = useToast();
  const q = useQuery<{ backups: BackupFile[]; intervalHours: number; keep: number; dir: string }>({ queryKey: ["/api/admin/backups"], staleTime: 0 });
  const act = useAct();
  const [busy, setBusy] = useState("");
  const download = async (name: string) => {
    setBusy(name);
    try {
      const r = await fetch(`${API_BASE}/api/admin/backups/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText);
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { toast({ title: "Download failed", description: e.message }); } finally { setBusy(""); }
  };
  if (!q.data) return <Spinner />;
  return (
    <Card title="Database backups" action={<Button size="sm" className="gap-1 rounded-full" disabled={act.isPending} onClick={() => act.mutate({ method: "POST", url: "/api/admin/backups", ok: "Backup created" })} data-testid="button-backup-now">{act.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}Back up now</Button>}>
      <p className="mb-3 text-sm text-muted-foreground">Automatic backups run every {q.data.intervalHours} hours and the newest {q.data.keep} are kept in <code>{q.data.dir}</code>. Each file is a complete SQLite copy you can restore by replacing <code>data.db</code> while the server is stopped.</p>
      {!q.data.backups.length ? <EmptyBox>No backups yet.</EmptyBox> : <ul className="divide-y divide-border">{q.data.backups.map((b) => (
        <li key={b.name} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
          <code className="min-w-0 flex-1 truncate text-xs">{b.name}</code>{b.auto ? <Pill>Automatic</Pill> : <Pill tone="ok">Manual</Pill>}
          <span className="text-xs text-muted-foreground">{when(b.createdAt)} · {bytes(b.bytes)}</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full" onClick={() => download(b.name)} disabled={busy === b.name} aria-label={`Download ${b.name}`}>{busy === b.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-primary" aria-label={`Delete ${b.name}`} onClick={() => confirm(`Delete ${b.name}?`) && act.mutate({ method: "DELETE", url: `/api/admin/backups/${b.name}`, ok: "Backup deleted" })}><Trash2 className="h-3.5 w-3.5" /></Button>
        </li>
      ))}</ul>}
    </Card>
  );
}

// ======================= Logs =======================
function LogsTab() {
  const [q, setQ] = useState(""); const [action, setAction] = useState("");
  const list = useQuery<ModLog[]>({ queryKey: ["/api/admin/logs", { q, action }], staleTime: 0 });
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative flex-1"><span className="sr-only">Search logs</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search details or ID" className="pl-9" /></label>
        <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All actions</option>{["series", "chapter", "user", "creator", "takedown", "report", "spam", "backup", "uploads", "notify"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {!list.data ? <Spinner /> : !list.data.length ? <p className="text-sm text-muted-foreground">No log entries.</p> : <ol className="divide-y divide-border text-sm">{list.data.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <time className="w-36 shrink-0 text-xs text-muted-foreground" dateTime={new Date(l.at).toISOString()}>{when(l.at)}</time>
          <span className="font-medium">{l.actor?.displayName ?? "System"}</span><code className="rounded bg-secondary px-1.5 text-xs">{l.action}</code>
          <span className="min-w-0 flex-1 break-words text-muted-foreground">{l.details || `${l.targetType} ${l.targetId}`}</span>
        </li>
      ))}</ol>}
    </Card>
  );
}

// ======================= Broadcast =======================
function BroadcastTab() {
  const [f, setF] = useState({ title: "", body: "", link: "", audience: "all" });
  const act = useAct(() => setF({ title: "", body: "", link: "", audience: "all" }));
  return (
    <Card title="Send a notification">
      <form className="max-w-lg space-y-3" onSubmit={(e) => { e.preventDefault(); if (confirm(`Send to ${f.audience}?`)) act.mutate({ method: "POST", url: "/api/admin/notify", body: f, ok: "Notification sent" }); }}>
        <Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" aria-label="Title" maxLength={120} />
        <Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Message" aria-label="Message" maxLength={500} />
        <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="In-app link, e.g. /calendar (optional)" aria-label="Link" />
        <select aria-label="Audience" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"><option value="all">Everyone</option><option value="readers">Readers only</option><option value="creators">Creators only</option><option value="staff">Staff only</option></select>
        <Button type="submit" className="gap-1.5 rounded-full" disabled={act.isPending}><Megaphone className="h-4 w-4" />Send</Button>
      </form>
    </Card>
  );
}

// ======================= Page =======================
export default function AdminPage({ params }: { params: { tab?: string } }) {
  const { user, openAuth } = useApp();
  const [, navigate] = useLocation();
  const overview = useQuery<AdminOverview>({ queryKey: ["/api/admin/overview"], enabled: isStaff(user) });
  if (!user) return <div className="mx-auto max-w-md px-4 py-20 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-semibold">Admin dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with a staff account.</p><Button className="mt-4 rounded-full" onClick={() => openAuth("login")}>Sign in</Button></div>;
  if (!isStaff(user)) return <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">This area is for MANGASALT moderators and admins.</div>;
  const tabs = TABS.filter(([, , , adminOnly]) => !adminOnly || isAdmin(user));
  const tab = (tabs.find(([k]) => k === params.tab)?.[0] ?? "overview") as Tab;
  const go = (t: Tab) => navigate(`/admin/${t}`);
  const qu = overview.data?.queues;
  const badge: Partial<Record<Tab, number>> = qu ? { approvals: qu.pendingSeries + qu.pendingChapters, reports: qu.openReports, copyright: qu.openTakedowns, spam: qu.spam } : {};
  const Body = { overview: () => <Overview go={go} />, approvals: Approvals, users: UsersTab, creators: CreatorsTab, series: SeriesTab, chapters: ChaptersTab, copyright: CopyrightTab, reports: ReportsTab, spam: SpamTab, uploads: UploadsTab, health: HealthTab, backups: BackupsTab, logs: LogsTab, broadcast: BroadcastTab }[tab];
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6">
      <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="font-display text-2xl font-semibold">Admin</h1><Pill>{user.role}</Pill></div>
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav aria-label="Admin sections" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {tabs.map(([k, l, Icon]) => (
            <Link key={k} href={`/admin/${k}`} aria-current={tab === k ? "page" : undefined} data-testid={`tab-admin-${k}`}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{l}{!!badge[k] && <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{badge[k]}</span>}
            </Link>
          ))}
        </nav>
        <div className="min-w-0"><h2 className="sr-only">{tabs.find(([k]) => k === tab)?.[1]}</h2><Body /></div>
      </div>
    </div>
  );
}
