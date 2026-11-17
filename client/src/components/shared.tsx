import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Search, Moon, Sun, LogOut, User as UserIcon, BookOpen, Eye, UserPlus, Check, Loader2, ShieldCheck, Bookmark, Home as HomeIcon, Flame, Library as LibraryIcon, Star } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useApp, TYPE_LABEL, compact } from "@/lib/app-context";
import type { PublicUser, SeriesCard } from "@shared/schema";

const API_ASSET = (p: string) => (p.startsWith("/") ? `.${p}` : p);
export const asset = API_ASSET;

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
  const tone = type === "manga" ? "bg-primary text-primary-foreground" : type === "manhwa" ? "bg-[hsl(258_70%_58%)] text-white" : "bg-[hsl(158_60%_36%)] text-white";
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
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
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
      className="group relative cursor-pointer"
      onClick={() => onOpen(s)}
      data-testid={`card-series-${s.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-white/5">
        <img src={asset(s.cover)} alt={`${s.title} cover`} loading="lazy" width={600} height={900}
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-80 transition group-hover:opacity-100" />
        <div className="absolute left-2 top-2"><TypeBadge type={s.type} /></div>
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
export function FollowButton({ type, id, following, size = "sm" }: { type: "series" | "creator"; id: number; following: boolean; size?: "sm" | "default" }) {
  const { user, openAuth } = useApp();
  const [state, setState] = useState(following);
  useEffect(() => setState(following), [following]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/follow/${type}/${id}`)).json(),
    onSuccess: (d: any) => { setState(d.following); ["/api/home", "/api/series", "/api/me/library"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); },
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
  const { user, openSeries: s, setOpenSeries } = useApp();
  const onClose = () => setOpenSeries(null);
  const live = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: s?.title ?? "" }], enabled: !!s });
  const current = live.data?.find((x) => x.id === s?.id) ?? s;
  useEffect(() => {
    if (s && user) apiRequest("POST", `/api/series/${s.id}/view`).then(() => { queryClient.invalidateQueries({ queryKey: ["/api/home"] }); queryClient.invalidateQueries({ queryKey: ["/api/me/library"] }); });
  }, [s?.id]);
  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto border-white/10 p-0 sm:rounded-2xl">
        {current && (
          <div className="grid sm:grid-cols-[240px_1fr]">
            <div className="relative h-56 sm:h-auto">
              <img src={asset(current.cover)} alt="" className="h-full w-full object-cover object-[center_20%]" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-background/40" />
            </div>
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-2"><TypeBadge type={current.type} />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Original · Official EN</span>
              </div>
              <div>
                <DialogTitle className="font-display text-2xl font-semibold leading-tight">{current.title}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">by <span className="text-foreground">{current.creator.displayName}</span> · {current.chapterCount} chapters · <span className="capitalize">{current.status}</span></p>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{current.rating.toFixed(1)} · {current.year}</p>
              </div>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/80">{current.synopsis}</DialogDescription>
              <div className="flex flex-wrap gap-1.5">{current.genres.map((g) => <span key={g} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{g}</span>)}</div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                <Button className="gap-2 rounded-full" data-testid="button-read-first" onClick={() => toastSoon()}><BookOpen className="h-4 w-4" /> Read Chapter 1</Button>
                <LikeButton s={current} />
                <SaveButton s={current} />
                <FollowButton type="series" id={current.id} following={current.followedByMe} size="default" />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
let toastSoon = () => {};
export function ToastBridge() {
  const { toast } = useToast();
  toastSoon = () => toast({ title: "Reader arrives in the next build", description: "The series page and chapter reader are the next pages we build." });
  return null;
}

// ---------- Auth dialog ----------
export function AuthDialog() {
  const { authOpen, closeAuth, openAuth, signIn } = useApp();
  const [form, setForm] = useState({ username: "", password: "", displayName: "" });
  const [error, setError] = useState("");
  const isSignup = authOpen === "signup";
  useEffect(() => setError(""), [authOpen]);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", isSignup ? "/api/auth/signup" : "/api/auth/login", isSignup ? form : { username: form.username, password: form.password })).json(),
    onSuccess: (d: any) => { signIn(d.token, d.user); setForm({ username: "", password: "", displayName: "" }); },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog open={!!authOpen} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="max-w-md border-white/10 sm:rounded-2xl">
        <DialogTitle className="font-display text-2xl font-semibold">{isSignup ? "Join MANGASALT" : "Welcome back"}</DialogTitle>
        <DialogDescription>{isSignup ? "Like series, follow creators, and keep your reading history." : "Sign in to like, comment and follow."}</DialogDescription>
        <form className="mt-2 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {isSignup && <Input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} data-testid="input-displayname" required />}
          <Input placeholder="Username" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} data-testid="input-username" required />
          <Input placeholder="Password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-password" required />
          {error && <p className="text-sm text-primary" data-testid="text-auth-error">{error}</p>}
          <Button type="submit" disabled={m.isPending} className="mt-1 rounded-full" data-testid="button-auth-submit">
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
    onSuccess: (d: any) => { setSaved(d.saved); ["/api/me/library", "/api/series", "/api/home"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); },
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
    <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? "border-b border-border/60 bg-background/85 backdrop-blur-xl" : "bg-background/0"}`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="font-display text-lg font-bold tracking-tight sm:text-xl" data-testid="link-home" aria-label="MANGASALT home">
          MANGA<span className="text-primary">SALT</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {TABS.slice(0, 4).map((t) => (
            <Link key={t.href} href={t.href} data-testid={`link-top-${t.label.toLowerCase()}`}
              className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition ${loc === t.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {loc === t.href && <motion.span layoutId="top-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{t.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} data-testid="button-theme"
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
          <Link href="/profile" aria-label="Profile" data-testid="button-profile"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground">
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
      <div className="mx-auto flex max-w-md items-center justify-between rounded-2xl border border-border bg-card/90 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
        {TABS.map((t) => {
          const active = loc === t.href;
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} data-testid={`tab-${t.label.toLowerCase()}`} aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${active ? "text-primary" : "text-muted-foreground"}`}>
              {active && <motion.span layoutId="tab-glow" className="absolute inset-x-2 inset-y-0 rounded-xl bg-primary/15 shadow-[0_0_24px_hsl(var(--primary)/0.35)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon className="relative h-5 w-5" />
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

export function RankRow({ s, rank }: { s: SeriesCard; rank: number }) {
  const { setOpenSeries } = useApp();
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30, delay: Math.min(rank, 10) * 0.03 }}
      className="group flex min-w-0 cursor-pointer items-center gap-3 border-b border-border/70 py-3 sm:gap-4" onClick={() => setOpenSeries(s)} data-testid={`row-rank-${s.id}`}>
      <span className={`rank-numeral font-display w-8 shrink-0 text-center text-3xl font-bold tabular-nums sm:w-10 sm:text-4xl ${rank <= 3 ? "top" : ""}`}>{rank}</span>
      <img src={asset(s.cover)} alt="" className="h-[72px] w-12 shrink-0 rounded-md object-cover ring-1 ring-white/5 transition group-hover:scale-105" loading="lazy" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold group-hover:text-primary">{s.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TypeBadge type={s.type} />
          <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" />Official EN · Original</p>
      </div>
      <div onClick={(e) => e.stopPropagation()}><LikeButton s={s} /></div>
    </motion.li>
  );
}
