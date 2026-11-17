import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Search, Moon, Sun, X, LogOut, User as UserIcon, BookOpen, Eye, UserPlus, Check, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
    onSuccess: (d: any) => { setState(d.following); queryClient.invalidateQueries({ queryKey: ["/api/home"] }); },
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
export function QuickView({ s, onClose }: { s: SeriesCard | null; onClose: () => void }) {
  const { user } = useApp();
  const live = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: s?.title ?? "" }], enabled: !!s });
  const current = live.data?.find((x) => x.id === s?.id) ?? s;
  useEffect(() => {
    if (s && user) apiRequest("POST", `/api/series/${s.id}/view`).then(() => queryClient.invalidateQueries({ queryKey: ["/api/home"] }));
  }, [s?.id]);
  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden border-white/10 p-0 sm:rounded-2xl">
        {current && (
          <div className="grid sm:grid-cols-[240px_1fr]">
            <div className="relative aspect-[2/3] sm:aspect-auto">
              <img src={asset(current.cover)} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-background/40" />
            </div>
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-2"><TypeBadge type={current.type} />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Original work · Creator-published</span>
              </div>
              <div>
                <DialogTitle className="font-display text-2xl font-semibold leading-tight">{current.title}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">by <span className="text-foreground">{current.creator.displayName}</span> · {current.chapterCount} chapters · {current.status}</p>
              </div>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/80">{current.synopsis}</DialogDescription>
              <div className="flex flex-wrap gap-1.5">{current.genres.map((g) => <span key={g} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{g}</span>)}</div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                <Button className="gap-2 rounded-full" data-testid="button-read-first" onClick={() => toastSoon()}><BookOpen className="h-4 w-4" /> Read Chapter 1</Button>
                <LikeButton s={current} />
                <FollowButton type="series" id={current.id} following={false} size="default" />
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

// ---------- Search overlay ----------
export function SearchOverlay({ onOpen }: { onOpen: (s: SeriesCard) => void }) {
  const { searchOpen, setSearchOpen } = useApp();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50); }, [searchOpen]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea"))) { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const { data, isFetching } = useQuery<SeriesCard[]>({ queryKey: ["/api/series", { q: debounced, type, order: "likes" }], enabled: searchOpen });
  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSearchOpen(false)}>
          <motion.div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-popover shadow-2xl"
            initial={{ y: -20, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -10, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, genres, creators…"
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" data-testid="input-search" />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <button onClick={() => setSearchOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Close search" data-testid="button-close-search"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex gap-1.5 border-b border-border px-4 py-2.5">
              {[["", "All"], ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]].map(([v, l]) => (
                <button key={v} onClick={() => setType(v)} data-testid={`button-search-type-${v || "all"}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${type === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>{l}</button>
              ))}
            </div>
            <ul className="max-h-[55vh] overflow-y-auto p-2">
              {data?.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No series match “{debounced}”. Try a genre like “Romance”.</li>}
              {data?.map((s) => (
                <li key={s.id}>
                  <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-accent" data-testid={`result-search-${s.id}`}
                    onClick={() => { setSearchOpen(false); onOpen(s); }}>
                    <img src={asset(s.cover)} alt="" className="h-16 w-11 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate font-semibold">{s.title}</span><TypeBadge type={s.type} /></div>
                      <p className="truncate text-xs text-muted-foreground">{s.genres.join(" · ")} — {s.creator.displayName}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5 fill-primary text-primary" />{compact(s.likes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Header ----------
export function Header({ onNav }: { onNav: (id: string) => void }) {
  const { user, theme, toggleTheme, openAuth, signOut, setSearchOpen } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 24); h(); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  const links = [["trending", "Trending"], ["charts", "Top Liked"], ["latest", "Latest"], ["library", "Creator Library"], ["community", "Community"]];
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${scrolled ? "border-b border-border/60 bg-background/80 backdrop-blur-xl" : "bg-gradient-to-b from-black/60 to-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="font-display text-xl font-bold tracking-tight" data-testid="link-home" aria-label="MANGASALT home">
          <span className={scrolled ? "text-foreground" : "text-white"}>MANGA</span><span className="text-primary">SALT</span>
        </button>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map(([id, l]) => (
            <button key={id} onClick={() => onNav(id)} data-testid={`link-nav-${id}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${scrolled ? "text-muted-foreground hover:text-foreground" : "text-white/75 hover:text-white"}`}>{l}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setSearchOpen(true)} data-testid="button-open-search"
            className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition ${scrolled ? "border-border text-muted-foreground hover:text-foreground" : "border-white/20 bg-black/20 text-white/80 hover:text-white"}`}>
            <Search className="h-4 w-4" /><span className="hidden sm:inline">Search</span><kbd className="hidden rounded bg-white/10 px-1.5 text-[11px] md:inline">/</kbd>
          </button>
          <button onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} data-testid="button-theme"
            className={`grid h-9 w-9 place-items-center rounded-full transition ${scrolled ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-white/80 hover:bg-white/10"}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full outline-none ring-primary focus-visible:ring-2" data-testid="button-profile-menu"><Avatar user={user} size={34} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><div className="font-semibold">{user.displayName}</div><div className="text-xs font-normal text-muted-foreground">@{user.username}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNav("recent")} data-testid="menu-recent"><Eye className="mr-2 h-4 w-4" />Recently viewed</DropdownMenuItem>
                <DropdownMenuItem disabled><UserIcon className="mr-2 h-4 w-4" />Profile (next build)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} data-testid="menu-signout"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="rounded-full px-4" onClick={() => openAuth("login")} data-testid="button-signin">Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}
