import { NotFoundView } from "@/pages/not-found";
// Reader pages: shelves, stats, timeline, reader profiles, discovery, notifications.
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, BookOpen, CalendarClock, Flame, Globe2, History, Lock, MessageCircle, Search, Star, Trash2, Users, Bell, CheckCheck, Bookmark, Heart, Award, UserPlus, PenTool, Pencil, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp, compact, timeAgo, TYPE_LABEL } from "@/lib/app-context";
import { PageHead, EmptyBox, Avatar, FollowButton, asset } from "@/components/shared";
import { BadgeTile, ShelfTile, ReportButton, NotificationRow } from "@/components/platform";
import type { Shelf, FullStats, TimelineEvent, ReaderProfile, ReaderCard, EarnedBadge, NotificationItem } from "@shared/platform";
import { countryName } from "@shared/platform";
import type { PublicUser } from "@shared/schema";

const key = (user: PublicUser | null) => ({ u: String(user?.id ?? "") });

function SignInPrompt({ what }: { what: string }) {
  const { openAuth } = useApp();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Sign in to see {what}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your shelves, stats and timeline are saved to your account.</p>
      <Button className="mt-5 rounded-full px-6" onClick={() => openAuth("login")}>Sign in</Button>
    </div>
  );
}

// ======================= Shelves =======================
export function ShelvesSection() {
  const { user } = useApp();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "private", kind: "custom" });
  const q = useQuery<Shelf[]>({ queryKey: ["/api/shelves", key(user)], enabled: !!user });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/shelves", form)).json(),
    onSuccess: () => { setOpen(false); setForm({ name: "", description: "", visibility: "private", kind: "custom" }); invalidatePrefixes("/api/shelves", "/api/me"); },
    onError: (e: Error) => toast({ title: "Couldn't create shelf", description: e.message }),
  });
  if (!user) return null;
  return (
    <section aria-labelledby="h-shelves">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="h-shelves" className="flex items-center gap-2 font-semibold"><Bookmark className="h-4 w-4 text-primary" />Shelves &amp; collections</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)} data-testid="button-new-shelf">New shelf</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{q.data?.map((s) => <ShelfTile key={s.id} s={s} />)}</div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>New shelf</DialogTitle>
          <DialogDescription>Group titles your way. Public shelves appear on your reader profile.</DialogDescription>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Rainy day reads" aria-label="Shelf name" maxLength={60} />
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" aria-label="Description" maxLength={300} />
            <div className="grid grid-cols-2 gap-2">
              {([["custom", "Shelf"], ["collection", "Collection"]] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={form.kind === v} onClick={() => setForm({ ...form, kind: v })} className={`rounded-lg border px-3 py-2 text-sm ${form.kind === v ? "border-primary bg-primary/10" : "border-border"}`}>{l}</button>)}
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">Public reading list<Switch checked={form.visibility === "public"} onCheckedChange={(c) => setForm({ ...form, visibility: c ? "public" : "private" })} /></label>
            <Button type="submit" className="w-full rounded-full" disabled={create.isPending}>Create</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ShelfPage({ params }: { params: { id: string } }) {
  const { user } = useApp();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const q = useQuery<Shelf>({ queryKey: [`/api/shelves/${params.id}`, key(user)] });
  const [edit, setEdit] = useState<null | { name: string; description: string; visibility: string }>(null);
  const save = useMutation({
    mutationFn: async (b: any) => (await apiRequest("PATCH", `/api/shelves/${params.id}`, b)).json(),
    onSuccess: () => { setEdit(null); invalidatePrefixes("/api/shelves"); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message }),
  });
  const del = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/shelves/${params.id}`)).json(),
    onSuccess: () => { invalidatePrefixes("/api/shelves"); navigate("/library"); },
  });
  const remove = useMutation({
    mutationFn: async (k: string) => (await apiRequest("POST", `/api/shelves/${params.id}/items`, { key: k, on: false })).json(),
    onSuccess: () => invalidatePrefixes("/api/shelves"),
  });
  if (q.isLoading) return <div className="mx-auto max-w-5xl px-4 pt-6"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  const s = q.data;
  if (!s) return <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">This shelf is private or doesn't exist.</div>;
  const share = () => { navigator.clipboard?.writeText(location.href).then(() => toast({ title: "Link copied" })).catch(() => {}); };
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-6">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">{s.visibility === "public" ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{s.visibility === "public" ? "Public" : "Private"} {s.kind === "collection" ? "collection" : "reading list"}</p>
      <h1 className="font-display text-3xl font-semibold" data-testid="text-shelf-name">{s.name}</h1>
      {s.description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{s.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {s.owner && <Link href={`/u/${s.owner.username}`} className="flex items-center gap-2 hover:text-foreground"><Avatar user={s.owner} size={24} />{s.owner.displayName}</Link>}
        <span>· {s.count} title{s.count === 1 ? "" : "s"}</span>
        {s.isMine && <>
          <Button size="sm" variant="outline" className="ml-auto gap-1.5 rounded-full" onClick={() => setEdit({ name: s.name, description: s.description, visibility: s.visibility })} data-testid="button-edit-shelf"><Pencil className="h-3.5 w-3.5" />Edit</Button>
          {s.kind !== "favourites" && <Button size="sm" variant="ghost" className="gap-1.5 rounded-full text-primary" onClick={() => confirm(`Delete “${s.name}”?`) && del.mutate()}><Trash2 className="h-3.5 w-3.5" />Delete</Button>}
        </>}
        {s.visibility === "public" && <Button size="sm" variant="outline" className={`rounded-full ${s.isMine ? "" : "ml-auto"}`} onClick={share}>Copy link</Button>}
      </div>
      {!s.items?.length ? <div className="mt-6"><EmptyBox>Nothing here yet. Use “Add to shelf” on any title page.</EmptyBox></div> : (
        <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {s.items.map((m, k) => (
            <motion.li key={m.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k, 12) * 0.03 }} className="group relative">
              <Link href={m.href} className="block">
                <img src={asset(m.cover)} alt="" className="aspect-[2/3] w-full rounded-xl object-cover transition group-hover:-translate-y-1" loading="lazy" />
                <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-primary">{m.title}</p>
                <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[m.type] ?? m.type}</p>
              </Link>
              {s.isMine && <button onClick={() => remove.mutate(m.key)} aria-label={`Remove ${m.title}`} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"><X className="h-3.5 w-3.5" /></button>}
            </motion.li>
          ))}
        </ul>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit shelf</DialogTitle>
          <DialogDescription>Change the name, description or who can see it.</DialogDescription>
          {edit && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Name" disabled={s.kind !== "custom" && s.kind !== "collection"} />
            <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} aria-label="Description" />
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">Public<Switch checked={edit.visibility === "public"} onCheckedChange={(c) => setEdit({ ...edit, visibility: c ? "public" : "private" })} /></label>
            <Button type="submit" className="w-full rounded-full">Save</Button>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ======================= Stats =======================
const PIE = ["hsl(var(--primary))", "hsl(258 70% 58%)", "hsl(158 60% 40%)", "hsl(200 80% 48%)", "hsl(43 74% 49%)"];
const fmtDay = (d: number) => new Date(d * 864e5).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export function StatsPage() {
  const { user } = useApp();
  const q = useQuery<FullStats>({ queryKey: ["/api/me/full-stats", key(user)], enabled: !!user, staleTime: 0, refetchOnMount: "always" });
  if (!user) return <SignInPrompt what="your reading stats" />;
  const s = q.data;
  const tiles = [[BookOpen, "Chapters read", s?.chapters], [Star, "Titles", s?.titles], [Flame, "Current streak", s?.streak], [Award, "Best streak", s?.bestStreak], [CalendarClock, "This week", s?.thisWeek], [BarChart3, "This month", s?.thisMonth], [History, "This year", s?.thisYear], [Users, "Active days", s?.activeDays]] as const;
  const tip = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 } };
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={BarChart3} kicker="You" title="Reading statistics" sub="Every chapter you open on MANGASALT and from official publishers counts here." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([Icon, l, v]) => <div key={l} className="rounded-2xl border border-border bg-card p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{compact(v ?? 0)}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
      </div>
      <section className="rounded-3xl border border-border bg-card p-5" aria-labelledby="h-30">
        <h2 id="h-30" className="font-semibold">Chapters per day, last 30 days</h2>
        <div className="mt-4 h-56" role="img" aria-label={`Chapters per day. Total ${s?.last30.reduce((a, d) => a + d.count, 0) ?? 0} in the last 30 days.`}>
          <ResponsiveContainer><AreaChart data={(s?.last30 ?? []).map((d) => ({ ...d, label: fmtDay(d.day) }))}>
            <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={4} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={28} tickLine={false} axisLine={false} />
            <Tooltip {...tip} /><Area type="monotone" dataKey="count" name="Chapters" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={2} />
          </AreaChart></ResponsiveContainer>
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-semibold">When you read</h2>
          <div className="mt-4 h-48" role="img" aria-label="Chapters by hour of day">
            <ResponsiveContainer><BarChart data={(s?.byHour ?? []).map((count, h) => ({ h: `${h}:00`, count }))}>
              <XAxis dataKey="h" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={24} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip {...tip} /><Bar dataKey="count" name="Chapters" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-semibold">By type</h2>
          {!s?.byType.length ? <p className="mt-4 text-sm text-muted-foreground">Read a few chapters to see your mix.</p> : (
            <div className="mt-2 flex items-center gap-4">
              <div className="h-44 w-44" role="img" aria-label={s.byType.map((t) => `${TYPE_LABEL[t.type] ?? t.type} ${t.count}`).join(", ")}>
                <ResponsiveContainer><PieChart><Pie data={s.byType} dataKey="count" nameKey="type" innerRadius={42} outerRadius={70} paddingAngle={3}>{s.byType.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 text-sm">{s.byType.map((t, i) => <li key={t.type} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />{TYPE_LABEL[t.type] ?? t.type}<span className="tabular-nums text-muted-foreground">{t.count}</span></li>)}</ul>
            </div>
          )}
        </section>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Most-read titles</h2>
        {!s?.topTitles.length ? <EmptyBox>No chapters read yet.</EmptyBox> : (
          <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
            {s.topTitles.map((t, i) => <li key={t.key}><Link href={t.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50"><span className="w-5 text-center font-display font-semibold text-muted-foreground">{i + 1}</span><img src={asset(t.cover)} alt="" className="h-12 w-8 rounded object-cover" /><span className="flex-1 truncate font-medium">{t.title}</span><span className="text-sm tabular-nums text-muted-foreground">{t.chapters} ch.</span></Link></li>)}
          </ol>
        )}
      </section>
    </div>
  );
}

// ======================= Timeline =======================
const EV_ICON: Record<TimelineEvent["kind"], any> = { read: BookOpen, saved: Bookmark, liked: Heart, favourite: Star, comment: MessageCircle, badge: Award, follow: UserPlus, published: PenTool };
const dayLabel = (t: number) => { const d = new Date(t), today = new Date(); const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5); return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }); };
export function TimelineList({ events, showUser }: { events: (TimelineEvent & { user?: PublicUser })[]; showUser?: boolean }) {
  const groups: [string, typeof events][] = [];
  for (const e of events) { const l = dayLabel(e.at); const g = groups[groups.length - 1]; g && g[0] === l ? g[1].push(e) : groups.push([l, [e]]); }
  return (
    <div className="space-y-6">
      {groups.map(([label, list]) => (
        <section key={label} aria-label={label}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</h3>
          <ol className="relative space-y-1 border-l border-border pl-5">
            {list.map((e) => { const Icon = EV_ICON[e.kind] ?? BookOpen; const body = (
              <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent/40">
                {e.cover ? <img src={asset(e.cover)} alt="" className="h-12 w-8 shrink-0 rounded object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Icon className="h-4 w-4" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{showUser && e.user && <span className="font-semibold">{e.user.displayName} </span>}<span className={showUser ? "" : "font-medium"}>{e.title}</span></p>
                  {e.detail && <p className="truncate text-xs text-muted-foreground">{e.detail}</p>}
                </div>
                <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={new Date(e.at).toISOString()}>{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>
              </div>
            );
            return <li key={e.id + (e.user?.id ?? "")} className="relative"><span className="absolute -left-[27px] top-4 grid h-3 w-3 place-items-center rounded-full border-2 border-background bg-primary" aria-hidden />{e.href ? <Link href={e.href}>{body}</Link> : body}</li>; })}
          </ol>
        </section>
      ))}
    </div>
  );
}
export function TimelinePage() {
  const { user } = useApp();
  const q = useQuery<TimelineEvent[]>({ queryKey: ["/api/me/timeline", key(user)], enabled: !!user, staleTime: 0, refetchOnMount: "always" });
  if (!user) return <SignInPrompt what="your reading timeline" />;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={History} kicker="You" title="Reading timeline" sub="Everything you've read, saved, liked and earned, newest first." />
      {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : !q.data?.length ? <EmptyBox>Nothing yet. Open a chapter and it will appear here.</EmptyBox> : <TimelineList events={q.data} />}
    </div>
  );
}

// ======================= Readers =======================
function ReaderRow({ r }: { r: ReaderCard }) {
  const { user } = useApp();
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar user={r} size={40} /><span className="min-w-0"><span className="block truncate font-semibold">{r.displayName}</span><span className="block truncate text-xs text-muted-foreground">@{r.username} · {compact(r.followers)} followers · {compact(r.chapters)} chapters</span></span></Link>
      {user?.id !== r.id && <FollowButton type="user" id={r.id} following={r.followedByMe} />}
    </li>
  );
}
export function ReadersPage() {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const list = useQuery<ReaderCard[]>({ queryKey: ["/api/readers", { q, ...key(user) }] });
  const feed = useQuery<(TimelineEvent & { user: PublicUser })[]>({ queryKey: ["/api/me/feed", key(user)], enabled: !!user, staleTime: 0 });
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <PageHead icon={Users} kicker="Community" title="Find readers" sub="Follow readers to see what they're reading and their public shelves." />
        <label className="relative block"><span className="sr-only">Search readers</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or @username" className="pl-9" data-testid="input-reader-search" /></label>
        <ul className="mt-4 space-y-2">{list.data?.map((r) => <ReaderRow key={r.id} r={r} />)}{list.data && !list.data.length && <EmptyBox>No readers found.</EmptyBox>}</ul>
      </div>
      <div>
        <h2 className="mb-3 mt-1 font-semibold lg:mt-[76px]">From readers you follow</h2>
        {!user ? <EmptyBox>Sign in and follow readers to see their activity.</EmptyBox> : !feed.data?.length ? <EmptyBox>No activity yet. Follow a few readers to fill this feed.</EmptyBox> : <TimelineList events={feed.data} showUser />}
      </div>
    </div>
  );
}

function FollowListDialog({ username, which, onClose }: { username: string; which: "followers" | "following" | null; onClose: () => void }) {
  const { user } = useApp();
  const q = useQuery<ReaderCard[]>({ queryKey: [`/api/readers/${username}/${which}`, key(user)], enabled: !!which });
  return (
    <Dialog open={!!which} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="capitalize">{which}</DialogTitle>
        <DialogDescription className="sr-only">List of {which}</DialogDescription>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">{q.data?.map((r) => <ReaderRow key={r.id} r={r} />)}{q.data && !q.data.length && <p className="text-sm text-muted-foreground">Nobody yet.</p>}</ul>
      </DialogContent>
    </Dialog>
  );
}
export function ReaderProfilePage({ params }: { params: { username: string } }) {
  const { user } = useApp();
  const q = useQuery<ReaderProfile>({ queryKey: [`/api/readers/${params.username}`, key(user)], staleTime: 0 });
  const [list, setList] = useState<"followers" | "following" | null>(null);
  if (q.isLoading) return <div className="mx-auto max-w-3xl px-4 pt-6"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  const p = q.data;
  if (!p) return <NotFoundView embedded title="Reader not found" message="No reader has that username, or the profile was removed." />;
  const earned = p.badges.filter((b) => b.earned);
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `hsl(${p.user.avatarHue} 70% 45% / .45)` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar user={p.user} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold" data-testid="text-reader-name">{p.user.displayName}</h1>
            <p className="text-sm text-muted-foreground">@{p.user.username}{p.user.isCreator ? " · Creator" : ""}{p.user.country ? ` · ${countryName(p.user.country)}` : ""} · Joined {new Date(p.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
            {p.user.bio && <p className="mt-2 text-sm">{p.user.bio}</p>}
          </div>
          {p.isMe ? <Link href="/settings"><Button variant="outline" className="rounded-full">Edit profile</Button></Link> : <FollowButton type="user" id={p.user.id} following={p.followedByMe} size="default" />}
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2 text-sm">
          <button onClick={() => setList("followers")} className="rounded-full bg-background/60 px-3 py-1.5 hover:bg-background" data-testid="button-followers"><b className="tabular-nums">{compact(p.followers)}</b> followers</button>
          <button onClick={() => setList("following")} className="rounded-full bg-background/60 px-3 py-1.5 hover:bg-background" data-testid="button-following"><b className="tabular-nums">{compact(p.following)}</b> following</button>
          {p.stats && <><span className="rounded-full bg-background/60 px-3 py-1.5"><b className="tabular-nums">{compact(p.stats.chapters)}</b> chapters</span><span className="rounded-full bg-background/60 px-3 py-1.5"><b className="tabular-nums">{p.stats.streak}</b> day streak</span></>}
          {!p.isMe && <ReportButton targetType="user" targetId={p.user.id} label="Report reader" className="ml-auto" />}
        </div>
      </div>
      {p.isPrivate && !p.isMe ? <EmptyBox><Lock className="mr-1.5 inline h-4 w-4" />This reader keeps their profile private.</EmptyBox> : <>
        <section><h2 className="mb-3 font-semibold">Public shelves</h2>{!p.shelves.length ? <EmptyBox>No public shelves yet.</EmptyBox> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{p.shelves.map((s) => <ShelfTile key={s.id} s={s} />)}</div>}</section>
        <section><h2 className="mb-3 font-semibold">Badges · {earned.length}</h2>{!earned.length ? <EmptyBox>No badges yet.</EmptyBox> : <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{earned.map((b) => <BadgeTile key={b.id} b={b} />)}</div>}</section>
        {p.timeline && <section><h2 className="mb-3 font-semibold">Recent activity</h2>{p.timeline.length ? <TimelineList events={p.timeline} /> : <EmptyBox>No recent activity.</EmptyBox>}</section>}
      </>}
      <FollowListDialog username={p.user.username} which={list} onClose={() => setList(null)} />
    </div>
  );
}

export function BadgesSection() {
  const { user } = useApp();
  const q = useQuery<EarnedBadge[]>({ queryKey: ["/api/me/badges", key(user)], enabled: !!user, staleTime: 0, refetchOnMount: "always" });
  if (!user) return null;
  const n = q.data?.filter((b) => b.earned).length ?? 0;
  return (
    <section id="badges" aria-labelledby="h-badges">
      <h2 id="h-badges" className="mb-3 flex items-center gap-2 font-semibold"><Award className="h-4 w-4 text-primary" />Achievements<span className="text-sm font-normal text-muted-foreground">{n} of {q.data?.length ?? 0}</span></h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{q.data?.map((b) => <BadgeTile key={b.id} b={b} />)}</div>
    </section>
  );
}

// ======================= Notifications =======================
export function NotificationsPage() {
  const { user } = useApp();
  const [, navigate] = useLocation();
  const q = useQuery<{ unread: number; items: NotificationItem[] }>({ queryKey: ["/api/notifications", key(user)], enabled: !!user, staleTime: 0, refetchOnMount: "always" });
  const done = () => invalidatePrefixes("/api/notifications");
  const readAll = useMutation({ mutationFn: () => apiRequest("POST", "/api/notifications/read-all"), onSuccess: done });
  const clear = useMutation({ mutationFn: () => apiRequest("DELETE", "/api/notifications"), onSuccess: done });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  if (!user) return <SignInPrompt what="your notifications" />;
  const items = (q.data?.items ?? []).filter((n) => filter === "all" || !n.read);
  const open = (n: NotificationItem) => { if (!n.read) apiRequest("POST", `/api/notifications/${n.id}/read`).then(done); if (n.link) navigate(n.link); };
  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={Bell} kicker="Inbox" title="Notifications" sub="New chapters from series you follow, replies, followers, approvals and announcements." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "unread"] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{f}{f === "unread" && q.data?.unread ? ` · ${q.data.unread}` : ""}</button>)}
        <Button size="sm" variant="ghost" className="ml-auto gap-1.5 rounded-full" onClick={() => readAll.mutate()} disabled={!q.data?.unread} data-testid="button-read-all"><CheckCheck className="h-4 w-4" />Mark all read</Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => clear.mutate()}>Clear read</Button>
        <Link href="/settings#notifications" className="text-sm text-muted-foreground hover:text-foreground">Settings</Link>
      </div>
      {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : !items.length ? <EmptyBox>You're all caught up.</EmptyBox> : <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-live="polite">{items.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} />)}</ul>}
    </div>
  );
}
export { Loader2 };
