import { API_BASE } from "@/lib/queryClient";
import { flushSync } from "react-dom";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Search, Moon, Sun, LogOut, User as UserIcon, BookOpen, Eye, UserPlus, Check, Loader2, ShieldCheck, Bookmark, Home as HomeIcon, Flame, Library as LibraryIcon, Star, PenTool, CalendarDays, ArrowUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidatePrefixes } from "@/lib/queryClient";
import { useApp, TYPE_LABEL, compact, rightsLabel } from "@/lib/app-context";
import type { PublicUser, SeriesCard } from "@shared/schema";
import { NotificationBell } from "@/components/platform";

const API_ASSET = (p: string) => (!p ? p : p.startsWith("uploads/") ? `${API_BASE}/${p}` : p.startsWith("/api/") ? `${API_BASE}${p}` : p.startsWith("/") ? `.${p}` : p);
export const asset = API_ASSET;

/** Public site settings. inAppOnly: list only titles readable inside MANGASALT (default on). */
export function useSiteConfig() {
  const { data } = useQuery<{ googleClientId: string | null; inAppOnly?: boolean }>({ queryKey: ["/api/auth/config"], staleTime: 5 * 60_000 });
  return { inAppOnly: data?.inAppOnly !== false, googleClientId: data?.googleClientId ?? null, loaded: !!data };
}

// ---------- Avatar ----------
export function Avatar({ user, size = 32 }: { user: Pick<PublicUser, "displayName" | "avatarHue">; size?: number }) {
  const initials = user.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${user.avatarHue} 65% 45%), hsl(${(user.avatarHue + 40) % 360} 70% 28%))` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// ---------- Type badge ----------
export function TypeBadge({ type, className = "" }: { type: string; className?: string }) {
  const tone = type === "manga" ? "bg-primary text-primary-foreground" : type === "manhwa" ? "bg-[hsl(258_70%_58%)] text-white" : type === "comic" ? "bg-[hsl(200_80%_44%)] text-white" : "bg-[hsl(158_60%_36%)] text-white";
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone} ${className}`}>{TYPE_LABEL[type]}</span>;
}

// ---------- Like button (series) ----------
export function useSeriesLike() {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/series/${id}/like`)).json() as Promise<{ liked: boolean; likes: number }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      invalidatePrefixes("/api/series");
      queryClient.invalidateQueries({ queryKey: ["/api/me/library"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't update like", description: e.message }),
  });
  return { toggle: (id: number) => (user ? m.mutate(id) : openAuth("login")), pending: m.isPending, variables: m.variables };
}

export function LikeButton({ s, variant = "pill" }: { s: SeriesCard; variant?: "pill" | "icon" }) {
  const { toggle } = useSeriesLike();
  const [optimistic, setOptimistic] = useState<{ liked: boolean; likes: number } | null>(null);
  useEffect(() => setOptimistic(null), [s.likedByMe, s.likes]);
  const liked = optimistic?.liked ?? s.likedByMe;
  const likes = optimistic?.likes ?? s.likes;
  const { user } = useApp();
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) setOptimistic({ liked: !liked, likes: likes + (liked ? -1 : 1) });
    toggle(s.id);
  };
  if (variant === "icon")
    return (
      <button onClick={onClick} aria-label={liked ? "Unlike" : "Like"} data-testid={`button-like-${s.id}`}
        className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75">
        <motion.span key={String(liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
          <Heart className={`h-4 w-4 ${liked ? "fill-primary text-primary" : ""}`} />
        </motion.span>
      </button>
    );
  return (
    <Button variant={liked ? "default" : "outline"} onClick={onClick} data-testid={`button-like-${s.id}`} className="gap-2 rounded-full">
      <motion.span key={String(liked)} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>
        <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
      </motion.span>
      <span className="tabular-nums">{compact(likes)}</span>
    </Button>
  );
}

// ---------- Series card ----------
export function SeriesPoster({ s, index = 0, onOpen, size = "md" }: { s: SeriesCard; index?: number; onOpen: (s: SeriesCard) => void; size?: "md" | "sm" }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="group relative cursor-pointer rounded-lg"
      onClick={() => onOpen(s)}
      role="link"
      tabIndex={0}
      aria-label={`${s.title}, ${TYPE_LABEL[s.type]} by ${s.creator.displayName}`}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(s); } }}
      data-testid={`card-series-${s.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-white/5">
        <img src={asset(s.cover)} alt={`${s.title} cover`} loading="lazy" width={600} height={900}
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-80 transition group-hover:opacity-100" />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1"><TypeBadge type={s.type} />{!!s.unread && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow" data-testid={`badge-unread-${s.id}`}>{s.unread} new</span>}</div>
        <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100"><LikeButton s={s} variant="icon" /></div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2.5 text-xs text-white/85">
          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 fill-primary text-primary" />{compact(s.likes)}</span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{compact(s.views)}</span>
          <span>Ch. {s.latestChapter}</span>
        </div>
      </div>
      <h3 className={`mt-2.5 line-clamp-1 font-semibold leading-tight transition group-hover:text-primary ${size === "sm" ? "text-sm" : "text-[15px]"}`}>{s.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.genres.slice(0, 2).join(" · ")} — {s.creator.displayName}</p>
    </motion.article>
  );
}

export function PosterSkeleton() {
  return (
    <div>
      <div className="shimmer relative aspect-[2/3] overflow-hidden rounded-lg bg-muted" />
      <div className="mt-2.5 h-4 w-3/4 rounded bg-muted" />
      <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
    </div>
  );
}

// ---------- Follow ----------
export function FollowButton({ type, id, following, size = "sm" }: { type: "series" | "creator" | "user"; id: number; following: boolean; size?: "sm" | "default" }) {
  const { user, openAuth } = useApp();
  const [state, setState] = useState(following);
  useEffect(() => setState(following), [following]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/follow/${type}/${id}`)).json(),
    onSuccess: (d: any) => { setState(d.following); invalidatePrefixes("/api/home", "/api/series", "/api/me/library", "/api/readers", "/api/me/feed"); },
  });
  return (
    <Button size={size} variant={state ? "secondary" : "outline"} className="gap-1.5 rounded-full" data-testid={`button-follow-${type}-${id}`}
      onClick={(e) => { e.stopPropagation(); user ? m.mutate() : openAuth("login"); }}>
      {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {state ? "Following" : "Follow"}
    </Button>
  );
}

// ---------- Quick view ----------
export function QuickView() {
  const { openSeries: s, setOpenSeries } = useApp();
  const [, navigate] = useLocation();
  useEffect(() => { if (s) { navigate(`/series/${s.slug}`); setOpenSeries(null); } }, [s?.id]);
  return null;
}
let toastSoon = () => {};
export function ToastBridge() {
  const { toast } = useToast();
  toastSoon = () => toast({ title: "Reader arrives in the next build", description: "The series page and chapter reader are the next pages we build." });
  return null;
}

// ---------- Auth dialog ----------
declare global { interface Window { google?: any } }
let gisPromise: Promise<void> | null = null;
const loadGis = () => gisPromise ??= new Promise<void>((ok, fail) => {
  if (window.google?.accounts?.id) return ok();
  const sc = document.createElement("script");
  sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = () => ok(); sc.onerror = () => { gisPromise = null; fail(new Error("Couldn't load Google sign-in")); };
  document.head.appendChild(sc);
});

function GoogleButton({ onToken, onError, signup }: { onToken: (c: string) => void; onError: (m: string) => void; signup: boolean }) {
  const { data } = useQuery<{ googleClientId: string | null }>({ queryKey: ["/api/auth/config"], staleTime: Infinity });
  const ref = useRef<HTMLDivElement>(null);
  const cid = data?.googleClientId;
  useEffect(() => {
    if (!cid || !ref.current) return;
    let alive = true;
    loadGis().then(() => {
      if (!alive || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: cid, callback: (r: any) => (r?.credential ? onToken(r.credential) : onError("Google sign-in was cancelled.")), ux_mode: "popup", itp_support: true });
      ref.current.innerHTML = "";
      window.google.accounts.id.renderButton(ref.current, { theme: document.documentElement.classList.contains("dark") ? "filled_black" : "outline", size: "large", shape: "pill", text: signup ? "signup_with" : "continue_with", width: Math.min(360, ref.current.offsetWidth || 320) });
    }).catch((e) => onError(e.message));
    return () => { alive = false; };
  }, [cid, signup]);
  if (data === undefined) return <div className="shimmer h-10 overflow-hidden rounded-full bg-muted" aria-hidden />;
  if (!cid) return (
    <button type="button" disabled className="glass-btn flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full text-sm font-medium opacity-60" title="Google sign-in will be available soon" data-testid="button-google-disabled">
      <GoogleG />Continue with Google <span className="text-xs text-muted-foreground">(coming soon)</span>
    </button>
  );
  return <div ref={ref} className="flex min-h-10 w-full justify-center [color-scheme:light]" data-testid="button-google" />;
}
const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
);

export function AuthDialog() {
  const { authOpen, closeAuth, openAuth, signIn } = useApp();
  const empty = { username: "", password: "", displayName: "", email: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const isSignup = authOpen === "signup";
  useEffect(() => setError(""), [authOpen]);
  const done = (d: any) => { signIn(d.token, d.user); setForm(empty); };
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", isSignup ? "/api/auth/signup" : "/api/auth/login", isSignup ? form : { username: form.username, password: form.password })).json(),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });
  const g = useMutation({
    mutationFn: async (credential: string) => (await apiRequest("POST", "/api/auth/google", { credential })).json(),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });
  // live hints so people know why a sign-up would fail before they submit
  const u = form.username;
  const userHint = !isSignup || !u ? "" : u.length < 3 ? "At least 3 characters" : u.length > 20 ? "At most 20 characters" : !/^[a-z0-9_]+$/i.test(u) ? "Letters, numbers and _ only" : "";
  const pwHint = isSignup && form.password && form.password.length < 6 ? `${6 - form.password.length} more character${form.password.length === 5 ? "" : "s"}` : "";
  const blocked = isSignup && (!!userHint || !!pwHint);
  return (
    <Dialog open={!!authOpen} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto border-white/10 sm:rounded-2xl">
        <DialogTitle className="font-display text-2xl font-semibold">{isSignup ? "Join MANGASALT" : "Welcome back"}</DialogTitle>
        <DialogDescription>{isSignup ? "Like series, follow creators, and keep your reading history." : "Sign in to like, comment and follow."}</DialogDescription>
        <div className="mt-2">
          <GoogleButton signup={isSignup} onToken={(c) => { setError(""); g.mutate(c); }} onError={setError} />
          {g.isPending && <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Signing in with Google…</p>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
        <form className="flex flex-col gap-3" noValidate onSubmit={(e) => { e.preventDefault(); if (!blocked) m.mutate(); }}>
          {isSignup && <Input placeholder="Display name (e.g. Asha Rao)" aria-label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} data-testid="input-displayname" required />}
          <div>
            <Input placeholder={isSignup ? "Username (e.g. asha_reads)" : "Username or email"} aria-label={isSignup ? "Username" : "Username or email"} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={form.username} onChange={(e) => setForm({ ...form, username: isSignup ? e.target.value.replace(/\s+/g, "_").toLowerCase() : e.target.value })} data-testid="input-username" required aria-invalid={!!userHint} aria-describedby="hint-username" />
            {isSignup && <p id="hint-username" className={`mt-1 px-1 text-xs ${userHint ? "text-primary" : "text-muted-foreground"}`}>{userHint || "3–20 letters, numbers or _"}</p>}
          </div>
          {isSignup && <Input type="email" placeholder="Email (optional, lets you sign in with it)" aria-label="Email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" />}
          <div>
            <div className="relative">
              <Input placeholder="Password" type={showPw ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-password" required className="pr-16" aria-describedby="hint-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 right-2 my-auto h-7 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground" aria-pressed={showPw}>{showPw ? "Hide" : "Show"}</button>
            </div>
            {isSignup && <p id="hint-password" className={`mt-1 px-1 text-xs ${pwHint ? "text-primary" : "text-muted-foreground"}`}>{pwHint || "At least 6 characters"}</p>}
          </div>
          {error && <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary" role="alert" data-testid="text-auth-error">{error}</p>}
          <Button type="submit" disabled={m.isPending || blocked} className="mt-1 rounded-full" data-testid="button-auth-submit">
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isSignup ? "Create account" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => openAuth(isSignup ? "login" : "signup")} data-testid="button-auth-switch">
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
          {!isSignup && <p className="text-center text-xs text-muted-foreground">Demo reader: <code className="text-foreground">nightowl</code> / <code className="text-foreground">reader123</code></p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Save ----------
export function SaveButton({ s, compact: small = false }: { s: SeriesCard; compact?: boolean }) {
  const { user, openAuth } = useApp();
  const [saved, setSaved] = useState(s.savedByMe);
  useEffect(() => setSaved(s.savedByMe), [s.savedByMe]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/series/${s.id}/save`)).json(),
    onSuccess: (d: any) => { setSaved(d.saved); invalidatePrefixes("/api/me/library", "/api/series", "/api/home"); },
  });
  const onClick = (e: React.MouseEvent) => { e.stopPropagation(); user ? m.mutate() : openAuth("login"); };
  if (small) return (
    <button onClick={onClick} aria-label={saved ? "Remove from saved" : "Save"} data-testid={`button-save-${s.id}`}
      className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75">
      <Bookmark className={`h-4 w-4 ${saved ? "fill-primary text-primary" : ""}`} />
    </button>
  );
  return (
    <Button variant={saved ? "secondary" : "outline"} className="gap-2 rounded-full" onClick={onClick} data-testid={`button-save-${s.id}`}>
      <Bookmark className={`h-4 w-4 ${saved ? "fill-primary text-primary" : ""}`} />{saved ? "Saved" : "Save"}
    </Button>
  );
}

// ---------- Shell: top bar + bottom tab bar ----------
export const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, desktopOnly: true },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function TopBar() {
  const { user, theme, toggleTheme } = useApp();
  const [loc] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 12); h(); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  return (
    <header className={`sticky top-0 z-40 transition-[padding] duration-500 ${scrolled ? "px-2 pt-2 sm:px-4" : "px-0 pt-0"}`}>
      <div className={`mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 transition-all duration-500 sm:h-16 sm:px-6 ${scrolled ? "glass-nav rounded-2xl sm:h-14" : "border border-transparent"}`}>
        <Link href="/" className="logo-shine font-display text-lg font-bold tracking-tight sm:text-xl" data-testid="link-home" aria-label="MANGASALT home">
          MANGA<span className="text-primary">SALT</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {TABS.filter((t) => t.href !== "/profile").map((t) => (
            <Link key={t.href} href={t.href} data-testid={`link-top-${t.label.toLowerCase()}`}
              className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition ${loc === t.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {loc === t.href && <motion.span layoutId="top-pill" className="glass-btn absolute inset-0 rounded-full shadow-[0_0_18px_hsl(var(--primary)/0.25)]" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{t.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/studio" data-testid="link-top-studio" className={`mr-1 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition md:flex glass-btn lift ${loc.startsWith("/studio") ? "!border-primary !bg-primary/15 text-primary" : "text-muted-foreground hover:!border-primary/60 hover:text-foreground"}`}>
            <PenTool className="h-3.5 w-3.5" />Studio
          </Link>
          <ThemeSwitch />
          <NotificationBell />
          <Link href="/profile" aria-label="Profile" data-testid="button-profile"
            className="glass-btn lift grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground">
            {user ? <Avatar user={user} size={34} /> : <UserIcon className="h-4 w-4" />}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const [loc] = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden" aria-label="Tabs">
      <div className="glass-nav mx-auto flex max-w-md items-center justify-between rounded-[22px] px-2 py-1.5">
        {TABS.filter((t) => !(t as any).desktopOnly).map((t) => {
          const active = loc === t.href;
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} data-testid={`tab-${t.label.toLowerCase()}`} aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${active ? "text-primary" : "text-muted-foreground"}`}>
              {active && <motion.span layoutId="tab-glow" className="absolute inset-x-2 inset-y-0 rounded-xl bg-primary/15 shadow-[0_0_24px_hsl(var(--primary)/0.35)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <motion.span className="relative" animate={active ? { y: [0, -4, 0], scale: [1, 1.18, 1] } : { y: 0, scale: 1 }} transition={{ duration: 0.45 }}><Icon className={`h-5 w-5 ${active ? "drop-shadow-[0_0_8px_hsl(var(--primary))]" : ""}`} /></motion.span>
              <span className="relative">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function PageHead({ icon: Icon, kicker, title, sub }: { icon?: any; kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      {kicker && <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">{Icon && <Icon className="h-3.5 w-3.5" />}{kicker}</p>}
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {sub && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card/60 px-5 py-6 text-sm text-muted-foreground">{children}</div>;
}

export function RankRow({ s, rank, score, max, unit = "likes" }: { s: SeriesCard; rank: number; score?: number; max?: number; unit?: string }) {
  const { setOpenSeries } = useApp();
  const pct = score !== undefined && max ? Math.max(6, (score / max) * 100) : null;
  return (
    <motion.li layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ layout: { type: "spring", stiffness: 380, damping: 34 }, default: { type: "spring", stiffness: 300, damping: 28, delay: Math.min(rank, 10) * 0.045 } }}
      whileHover={{ x: 4 }} whileTap={{ scale: 0.985 }}
      className="group relative flex min-w-0 cursor-pointer items-center gap-3 border-b border-border/70 py-3 sm:gap-4" onClick={() => setOpenSeries(s)} data-testid={`row-rank-${s.id}`}>
      <motion.span key={rank} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`rank-numeral font-display w-8 shrink-0 text-center text-3xl font-bold tabular-nums sm:w-10 sm:text-4xl ${rank <= 3 ? "top" : ""}`}>{rank}</motion.span>
      <div className="relative shrink-0">
        <img src={asset(s.cover)} alt="" className="h-[72px] w-12 rounded-md object-cover ring-1 ring-white/5 transition duration-300 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-primary/30" loading="lazy" />
        {rank === 1 && <motion.span className="absolute -inset-1 -z-10 rounded-lg bg-primary/40 blur-md" animate={{ opacity: [0.35, 0.9, 0.35] }} transition={{ duration: 2.4, repeat: Infinity }} />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold transition-colors group-hover:text-primary">{s.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TypeBadge type={s.type} />
          {s.rating > 0 && <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>}
          {score !== undefined && <span className="tabular-nums">{compact(score)} {unit}</span>}
        </div>
        {pct !== null ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 + Math.min(rank, 10) * 0.05 }} />
          </div>
        ) : (
          <p className={`mt-1 flex items-center gap-1 truncate text-xs ${s.readable ? "text-emerald-500" : "text-muted-foreground"}`}><ShieldCheck className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{rightsLabel(s)}</span></p>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}><LikeButton s={s} /></div>
    </motion.li>
  );
}

// ---------- Theme switch (sun / moon) ----------
/** Animated day/night switch: the new theme spreads across the screen in a circle from the button. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useApp();
  const dark = theme === "dark";
  const [burst, setBurst] = useState(0);
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setBurst((b) => b + 1);
    const doc: any = document;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce) { toggleTheme(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const next = dark ? "light" : "dark";
    const vt = doc.startViewTransition(() => { flushSync(toggleTheme); document.documentElement.classList.toggle("dark", next === "dark"); });
    vt.ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => {});
  };
  return (
    <button role="switch" aria-checked={dark} aria-label="Dark mode" onClick={onClick} data-testid="switch-theme"
      className={`group relative flex h-8 w-[62px] shrink-0 items-center overflow-hidden rounded-full border p-0.5 transition-colors duration-700 ${dark ? "border-white/10 bg-gradient-to-br from-[hsl(232_45%_12%)] to-[hsl(260_40%_20%)]" : "border-sky-300/70 bg-gradient-to-br from-sky-300 to-amber-200"} ${className}`}>
      {/* night sky: twinkling stars */}
      {[[10, 7, 0], [20, 18, 0.6], [30, 9, 1.2], [14, 22, 1.8]].map(([l, t, d], i) => (
        <motion.span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-white" style={{ left: l, top: t }}
          animate={dark ? { opacity: [0.2, 1, 0.2], scale: [0.8, 1.4, 0.8], y: 0 } : { opacity: 0, y: 10 }} transition={dark ? { duration: 1.8, repeat: Infinity, delay: d } : { duration: 0.3 }} />
      ))}
      {/* day sky: drifting clouds */}
      {[[30, 15, 14], [40, 6, 10]].map(([l, t, w], i) => (
        <motion.span key={i} className="absolute h-[6px] rounded-full bg-white/90" style={{ left: l, top: t, width: w }}
          animate={dark ? { opacity: 0, y: 12 } : { opacity: 1, y: 0, x: [0, 4, 0] }} transition={dark ? { duration: 0.3 } : { x: { duration: 3 + i, repeat: Infinity, ease: "easeInOut" }, default: { duration: 0.4 } }} />
      ))}
      <motion.span layout transition={{ type: "spring", stiffness: 520, damping: 28 }}
        className={`relative z-10 grid h-6 w-6 place-items-center rounded-full ${dark ? "ml-auto bg-gradient-to-br from-slate-100 to-indigo-200 shadow-[0_0_12px_rgba(199,210,254,.7)]" : "bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_14px_rgba(251,191,36,.9)]"}`}>
        <AnimatePresence mode="wait" initial={false}>
          {dark ? (
            <motion.span key="moon" className="relative block h-6 w-6" initial={{ rotate: -90, scale: 0.3 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0.3 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
              <span className="absolute left-[7px] top-[5px] h-[5px] w-[5px] rounded-full bg-indigo-300/70" />
              <span className="absolute left-[13px] top-[12px] h-[4px] w-[4px] rounded-full bg-indigo-300/70" />
              <span className="absolute left-[6px] top-[14px] h-[3px] w-[3px] rounded-full bg-indigo-300/60" />
            </motion.span>
          ) : (
            <motion.span key="sun" className="relative block h-6 w-6" initial={{ rotate: 90, scale: 0.3 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: -90, scale: 0.3 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
              <motion.span className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                {Array.from({ length: 8 }).map((_, k) => <span key={k} className="absolute left-1/2 top-1/2 h-[3px] w-[1.5px] rounded bg-white/90" style={{ transform: `rotate(${k * 45}deg) translateY(-9px)` }} />)}
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {burst > 0 && <motion.span key={burst} className={`pointer-events-none absolute inset-0 rounded-full border-2 ${dark ? "border-indigo-200" : "border-amber-300"}`} initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 3, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />}
        </AnimatePresence>
      </motion.span>
    </button>
  );
}


/** Slow floating colour orbs and specks behind the app. Pure CSS so reduce-motion can stop it. */
export function AmbientBackdrop() {
  return (
    <div className="ambient pointer-events-none fixed inset-0 -z-20 overflow-hidden" aria-hidden>
      <span className="orb orb-a" /><span className="orb orb-b" /><span className="orb orb-c" />
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="speck" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-(i * 1.7)}s`, animationDuration: `${14 + (i % 5) * 3}s`, width: 2 + (i % 3), height: 2 + (i % 3) }} />
      ))}
    </div>
  );
}

/** Floating glass "back to top" button that appears after scrolling. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => { const h = () => setShow(window.scrollY > 900); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 20 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" data-testid="button-back-to-top"
          className="glass-btn float-slow fixed bottom-24 right-4 z-40 grid h-11 w-11 place-items-center rounded-full text-foreground shadow-lg md:bottom-8 md:right-8">
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
