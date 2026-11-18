// Shared UI for shelves, favourites, reports, notifications, badges and regions.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Bell, Check, Flag, Globe2, Heart, Loader2, Lock, Plus, ListPlus, BookOpen, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes, queryClient } from "@/lib/queryClient";
import { useApp, timeAgo } from "@/lib/app-context";
import { asset } from "@/components/shared";
import type { EarnedBadge, NotificationItem, Shelf } from "@shared/platform";

type Membership = { shelves: { id: number; name: string; kind: string; visibility: string; on: boolean }[]; favourite: boolean; counter: { read: number; total: number | null } | null };

export function useMembership(key: string) {
  const { user } = useApp();
  return useQuery<Membership>({ queryKey: [`/api/shelves/membership/${key}`, { u: String(user?.id ?? "") }], enabled: !!user });
}
const refreshShelves = () => invalidatePrefixes("/api/shelves", "/api/me", "/api/readers");

// ---------- Favourite ----------
export function FavouriteButton({ itemKey }: { itemKey: string }) {
  const { user, openAuth } = useApp();
  const { data } = useMembership(itemKey);
  const [on, setOn] = useState(false);
  useEffect(() => setOn(!!data?.favourite), [data?.favourite]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/favourites/${itemKey}`)).json(),
    onSuccess: (d: any) => { setOn(d.favourite); refreshShelves(); },
  });
  return (
    <Button variant={on ? "default" : "outline"} className="gap-2 rounded-full" aria-pressed={on} data-testid="button-favourite"
      onClick={() => (user ? (setOn(!on), m.mutate()) : openAuth("login"))}>
      <Star className={`h-4 w-4 ${on ? "fill-current" : ""}`} />{on ? "Favourite" : "Add to favourites"}
    </Button>
  );
}

// ---------- Add to shelf ----------
export function AddToShelf({ itemKey }: { itemKey: string }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const { data } = useMembership(itemKey);
  const [name, setName] = useState("");
  const [pub, setPub] = useState(false);
  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: number; on: boolean }) => (await apiRequest("POST", `/api/shelves/${id}/items`, { key: itemKey, on })).json(),
    onSuccess: refreshShelves,
    onError: (e: Error) => toast({ title: "Couldn't update shelf", description: e.message }),
  });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/shelves", { name, visibility: pub ? "public" : "private", add: itemKey })).json(),
    onSuccess: () => { setName(""); refreshShelves(); toast({ title: "Shelf created", description: `Added to “${name}”.` }); },
    onError: (e: Error) => toast({ title: "Couldn't create shelf", description: e.message }),
  });
  if (!user) return <Button variant="outline" className="gap-2 rounded-full" onClick={() => openAuth("login")} data-testid="button-add-shelf"><ListPlus className="h-4 w-4" />Add to shelf</Button>;
  const status = data?.shelves.filter((s) => s.kind === "status") ?? [];
  const custom = data?.shelves.filter((s) => s.kind !== "status" && s.kind !== "favourites") ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 rounded-full" data-testid="button-add-shelf"><ListPlus className="h-4 w-4" />{status.find((s) => s.on)?.name ?? "Add to shelf"}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reading status</p>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Reading status">
          {status.map((s) => (
            <button key={s.id} aria-pressed={s.on} onClick={() => toggle.mutate({ id: s.id, on: !s.on })} data-testid={`button-status-${s.id}`}
              className={`rounded-lg border px-2 py-1.5 text-left text-sm ${s.on ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent"}`}>{s.name}</button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shelves &amp; collections</p>
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          {!custom.length && <p className="text-xs text-muted-foreground">No custom shelves yet.</p>}
          {custom.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent">
              <input type="checkbox" checked={s.on} onChange={() => toggle.mutate({ id: s.id, on: !s.on })} className="accent-[hsl(var(--primary))]" />
              <span className="flex-1 truncate">{s.name}</span>
              {s.visibility === "public" ? <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-label="Public" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Private" />}
            </label>
          ))}
        </div>
        <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New shelf name" aria-label="New shelf name" className="h-9" data-testid="input-new-shelf" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />Public</label>
            <Button size="sm" type="submit" disabled={!name.trim() || create.isPending} className="h-8 gap-1 rounded-full"><Plus className="h-3.5 w-3.5" />Create</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function ChapterCounter({ itemKey }: { itemKey: string }) {
  const { data } = useMembership(itemKey);
  const c = data?.counter;
  if (!c || !c.read) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium" data-testid="text-chapter-counter">
      <BookOpen className="h-3.5 w-3.5 text-primary" />{c.read}{c.total ? ` of ${c.total}` : ""} chapter{c.read === 1 && !c.total ? "" : "s"} read
    </span>
  );
}

// ---------- Report ----------
const REASONS = ["Spam or advertising", "Harassment or hate", "Sexual content involving minors", "Graphic or explicit content", "Copyright infringement", "Spoilers without warning", "Impersonation", "Something else"];
export function ReportButton({ targetType, targetId, label = "Report", className = "" }: { targetType: "series" | "chapter" | "user" | "world" | "comment"; targetId: number; label?: string; className?: string }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/report", { targetType, targetId, reason, details })).json(),
    onSuccess: () => { setOpen(false); setReason(""); setDetails(""); toast({ title: "Report sent", description: "Thanks. A moderator will review it." }); },
    onError: (e: Error) => toast({ title: "Couldn't send report", description: e.message }),
  });
  return (
    <>
      <button onClick={() => (user ? setOpen(true) : openAuth("login"))} className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary ${className}`} data-testid={`button-report-${targetType}`}>
        <Flag className="h-3 w-3" />{label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Report this {targetType === "world" ? "title" : targetType === "user" ? "reader" : targetType}</DialogTitle>
          <DialogDescription>Tell our moderators what's wrong. For copyright claims by rights holders, use the copyright form instead.</DialogDescription>
          <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
            <fieldset className="grid gap-1.5">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${reason === r ? "border-primary bg-primary/10" : "border-border"}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />{r}
                </label>
              ))}
            </fieldset>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" aria-label="Details" maxLength={1000} />
            <div className="flex items-center justify-between">
              <Link href="/legal/copyright" className="text-xs text-muted-foreground hover:text-primary" onClick={() => setOpen(false)}>Copyright form</Link>
              <Button type="submit" disabled={!reason || m.isPending} className="rounded-full" data-testid="button-report-submit">{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send report</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Notifications ----------
export function NotificationBell() {
  const { user } = useApp();
  const [, navigate] = useLocation();
  const lastSeen = useRef<number>(0);
  const { data } = useQuery<{ unread: number; latest: { id: number; title: string; body: string; link: string | null } | null }>({
    queryKey: ["/api/notifications/unread", { u: String(user?.id ?? "") }], enabled: !!user, refetchInterval: 60_000, staleTime: 0,
  });
  const settings = useQuery<{ notify: { browser: boolean } }>({ queryKey: ["/api/me/settings", { u: String(user?.id ?? "") }], enabled: !!user });
  useEffect(() => {
    const l = data?.latest;
    if (!l || !settings.data?.notify.browser || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (lastSeen.current === 0) { lastSeen.current = l.id; return; }
    if (l.id <= lastSeen.current) return;
    lastSeen.current = l.id;
    if (document.visibilityState === "visible") return;
    try { const n = new Notification(l.title, { body: l.body, tag: `ms-${l.id}` }); n.onclick = () => { window.focus(); if (l.link) navigate(l.link); }; } catch {}
  }, [data?.latest?.id, settings.data?.notify.browser]);
  if (!user) return null;
  const n = data?.unread ?? 0;
  return (
    <Link href="/notifications" aria-label={n ? `Notifications, ${n} unread` : "Notifications"} data-testid="link-notifications"
      className="glass-btn lift relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground">
      <Bell className="h-4 w-4" />
      {n > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground" aria-hidden>{n > 99 ? "99+" : n}</motion.span>}
    </Link>
  );
}

export function NotificationRow({ n, onOpen }: { n: NotificationItem; onOpen: (n: NotificationItem) => void }) {
  const icon = { chapter: BookOpen, reply: Icons.MessageCircle, follow: Icons.UserPlus, approval: Icons.BadgeCheck, badge: Icons.Award, system: Icons.Megaphone, moderation: Icons.ShieldAlert }[n.type] ?? Bell;
  const Icon = icon;
  return (
    <li>
      <button onClick={() => onOpen(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent/50 ${n.read ? "" : "bg-primary/[0.06]"}`} data-testid={`row-notification-${n.id}`}>
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.read ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
          <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
        </span>
        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
      </button>
    </li>
  );
}

// ---------- Badges ----------
const TIER = { bronze: "from-amber-700 to-amber-500", silver: "from-slate-400 to-slate-200", gold: "from-yellow-500 to-amber-300", special: "from-primary to-fuchsia-500" } as const;
export function BadgeTile({ b }: { b: EarnedBadge }) {
  const Icon = (Icons as any)[b.icon] ?? Icons.Award;
  const [cur, max] = b.progress;
  return (
    <div className={`rounded-2xl border p-3 text-center ${b.earned ? "border-border bg-card" : "border-dashed border-border bg-card/40"}`} data-testid={`badge-${b.id}`}
      aria-label={`${b.name}: ${b.description}. ${b.earned ? "Earned" : `Progress ${cur} of ${max}`}`} role="img">
      <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br ${b.earned ? TIER[b.tier] : "from-muted to-muted"} ${b.earned ? "text-white shadow-lg" : "text-muted-foreground"}`}><Icon className="h-5 w-5" /></span>
      <p className={`mt-2 text-sm font-semibold ${b.earned ? "" : "text-muted-foreground"}`}>{b.name}</p>
      <p className="text-[11px] leading-snug text-muted-foreground">{b.description}</p>
      {!b.earned && max > 1 && <div className="mx-auto mt-2 h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full bg-primary/70" style={{ width: `${(cur / max) * 100}%` }} /></div>}
      {b.earned && b.earnedAt && <p className="mt-1 text-[10px] text-muted-foreground">{new Date(b.earnedAt).toLocaleDateString()}</p>}
    </div>
  );
}

// ---------- Shelves ----------
export function ShelfTile({ s }: { s: Shelf }) {
  return (
    <Link href={`/shelf/${s.id}`} className="group block rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40" data-testid={`card-shelf-${s.id}`}>
      <div className="grid aspect-[3/2] grid-cols-3 gap-1 overflow-hidden rounded-lg bg-muted">
        {[0, 1, 2].map((i) => s.covers[i] ? <img key={i} src={asset(s.covers[i])} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span key={i} className="bg-muted-foreground/10" />)}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {s.kind === "favourites" && <Heart className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
        <p className="truncate font-semibold group-hover:text-primary">{s.name}</p>
        {s.visibility === "public" ? <Globe2 className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Public" /> : <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Private" />}
      </div>
      <p className="text-xs text-muted-foreground">{s.count} title{s.count === 1 ? "" : "s"}{s.kind === "collection" ? " · Collection" : ""}</p>
    </Link>
  );
}

// ---------- Region ----------
export function RegionBanner({ region }: { region?: { blocked: boolean; country: string | null; label: string } }) {
  if (!region || (!region.blocked && region.label === "Available worldwide")) return null;
  return (
    <div role={region.blocked ? "alert" : undefined} className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${region.blocked ? "border-primary/50 bg-primary/10" : "border-border bg-card/60 text-muted-foreground"}`} data-testid="banner-region">
      <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{region.blocked ? <>This series isn't available in your region yet. {region.label}. <Link href="/settings" className="text-primary underline-offset-2 hover:underline">Change your country</Link></> : region.label}</span>
    </div>
  );
}

export function useInvalidateAll() {
  return () => queryClient.invalidateQueries();
}
export { Check };
