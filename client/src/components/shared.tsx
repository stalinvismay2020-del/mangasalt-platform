import { flushSync } from "react-dom";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Search, User as UserIcon, Eye, EyeOff, Loader2, Home as HomeIcon, Flame, Library as LibraryIcon, Star, PenTool, MessagesSquare,
  History, Settings, Shield, LogOut, RotateCw, WifiOff, ChevronLeft, ChevronRight, MailCheck, ImageOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp, TYPE_LABEL } from "@/lib/app-context";
import { supabase, errMsg, pageUrl } from "@/lib/supabase";
import { describeCatalogError, type CatalogCard } from "@/lib/catalog";
import type { HostedSeries } from "@/lib/data";

export const STATUS_LABEL: Record<string, string> = { ongoing: "Releasing", completed: "Completed", hiatus: "On hiatus", upcoming: "Upcoming", cancelled: "Cancelled" };

// ---------- Avatar ----------
export function Avatar({ name, hue = 24, size = 32 }: { name: string; hue?: number; size?: number }) {
  const initials = (name || "R").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 40) % 360} 70% 28%))` }} aria-hidden>
      {initials}
    </span>
  );
}

// ---------- Type badge ----------
export function TypeBadge({ type, className = "" }: { type: string | null | undefined; className?: string }) {
  if (!type) return null;
  const tone = type === "manga" ? "bg-primary text-primary-foreground" : type === "manhwa" ? "bg-[hsl(258_70%_58%)] text-white" : type === "webcomic" || type === "comic" ? "bg-[hsl(200_80%_40%)] text-white" : "bg-[hsl(158_60%_32%)] text-white";
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone} ${className}`}>{TYPE_LABEL[type] ?? type}</span>;
}

// ---------- Cover image with graceful failure ----------
export function Cover({ src, alt, className = "" }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return (
    <div className={`grid place-items-center bg-gradient-to-br from-muted to-card text-muted-foreground ${className}`} role="img" aria-label={alt}>
      <ImageOff className="h-6 w-6 opacity-50" />
    </div>
  );
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

// ---------- Poster card (catalogue or hosted) ----------
export type PosterItem = { href: string; id: string; title: string; cover: string | null; type: string | null; sub: string; score?: number | null; badge?: ReactNode };
export const fromCatalog = (m: CatalogCard): PosterItem => ({
  href: `/title/${m.id}`, id: String(m.id), title: m.title, cover: m.cover, type: m.format, score: m.score,
  sub: m.genres.slice(0, 2).join(" · ") || (m.status ? STATUS_LABEL[m.status] : ""),
});
export const fromHosted = (s: HostedSeries): PosterItem => ({
  href: `/series/${s.slug}`, id: s.id, title: s.title, cover: pageUrl(s.cover_path), type: s.kind,
  sub: `${s.chapters} chapter${s.chapters === 1 ? "" : "s"} · Read on MANGASALT`,
  badge: <span className="rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Readable</span>,
});

export function Poster({ m, index = 0, size = "md", rank }: { m: PosterItem; index?: number; size?: "sm" | "md"; rank?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 250, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-9, 9]), { stiffness: 250, damping: 20 });
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height);
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 10) * 0.04, ease: [0.16, 1, 0.3, 1] }} style={{ perspective: 800 }}>
      <Link href={m.href} ref={ref} onPointerMove={onMove} onPointerLeave={() => { mx.set(0.5); my.set(0.5); }} className="group block" data-testid={`card-${m.id}`}>
        <motion.div style={{ rotateX: rx, rotateY: ry }} whileTap={{ scale: 0.97 }}
          className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg ring-1 ring-white/5 transition-shadow duration-300 group-hover:shadow-2xl">
          <Cover src={m.cover} alt={`${m.title} cover`} className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1"><TypeBadge type={m.type} />{m.badge}</div>
          {rank && <span className="font-display absolute -left-1 bottom-0 text-6xl font-bold leading-none text-white/95 [text-shadow:0_4px_20px_rgba(0,0,0,.7)]">{rank}</span>}
          {m.score ? <span className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{(m.score / 10).toFixed(1)}</span> : null}
          <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
        </motion.div>
        <h3 className={`mt-2 line-clamp-2 font-semibold leading-tight transition-colors group-hover:text-primary ${size === "sm" ? "text-[13px]" : "text-sm"}`}>{m.title}</h3>
        {m.sub && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.sub}</p>}
      </Link>
    </motion.div>
  );
}

export function PosterSkel() {
  return <div><div className="shimmer relative aspect-[2/3] overflow-hidden rounded-xl bg-muted" /><div className="mt-2 h-3.5 w-4/5 rounded bg-muted" /><div className="mt-1.5 h-3 w-1/2 rounded bg-muted" /></div>;
}

export function PosterGrid({ items, loading, count = 12 }: { items?: PosterItem[]; loading?: boolean; count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {loading ? Array.from({ length: count }).map((_, i) => <PosterSkel key={i} />) : items?.map((m, i) => <Poster key={m.href} m={m} index={i} size="sm" />)}
    </div>
  );
}

/** Horizontal rail with snap scrolling and arrow buttons on desktop. */
export function Rail({ title, kicker, icon: Icon, items, loading, error, onRetry, ranked, action }: {
  title: string; kicker?: string; icon?: any; items?: PosterItem[]; loading?: boolean; error?: unknown; onRetry?: () => void; ranked?: boolean; action?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          {kicker && <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{Icon && <Icon className="h-3.5 w-3.5" />}{kicker}</p>}
          <h2 className="font-display mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {action}
          <button onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-accent md:grid"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-accent md:grid"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {error ? <InlineError error={error} onRetry={onRetry} /> : (
        <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
          {loading ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="w-[30%] shrink-0 snap-start sm:w-40"><PosterSkel /></div>)
            : items?.length ? items.map((m, i) => <div key={m.href} className="w-[30%] shrink-0 snap-start sm:w-40"><Poster m={m} index={i} size="sm" rank={ranked ? i + 1 : undefined} /></div>)
            : <EmptyBox>Nothing here yet.</EmptyBox>}
        </div>
      )}
    </section>
  );
}

// ---------- States ----------
export function PageHead({ icon: Icon, kicker, title, sub, action }: { icon?: any; kicker?: string; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">{Icon && <Icon className="h-3.5 w-3.5" />}{kicker}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyBox({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="w-full rounded-2xl border border-dashed border-border bg-card/60 px-5 py-6 text-sm text-muted-foreground" data-testid="empty-state">{children}{action && <div className="mt-3">{action}</div>}</div>;
}

export function InlineError({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { describe } = useErrorText(error);
  return (
    <div className="flex w-full flex-col items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm" role="alert" data-testid="error-state">
      <p className="flex items-center gap-2 font-semibold"><WifiOff className="h-4 w-4 text-destructive" />{title ?? describe.title}</p>
      <p className="text-muted-foreground">{describe.detail}</p>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry} className="gap-1.5 rounded-full" data-testid="button-retry"><RotateCw className="h-3.5 w-3.5" />Try again</Button>}
    </div>
  );
}

function useErrorText(error: unknown) { return { describe: describeCatalogError(error) }; }

export function SignInPrompt({ what }: { what: string }) {
  const { openAuth } = useApp();
  return (
    <EmptyBox action={<div className="flex gap-2"><Button className="rounded-full" onClick={() => openAuth("login")} data-testid="button-prompt-signin">Sign in</Button><Button variant="outline" className="rounded-full" onClick={() => openAuth("signup")} data-testid="button-prompt-signup">Create account</Button></div>}>
      Sign in to {what}.
    </EmptyBox>
  );
}

// ---------- Auth dialog (Supabase email + password) ----------
export function AuthDialog() {
  const { authOpen, closeAuth, openAuth } = useApp();
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<ReactNode>(null);
  const [pending, setPending] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const mode = authOpen || "login";
  useEffect(() => { setError(""); setNotice(null); setShowPw(false); }, [authOpen]);
  const redirect = window.location.origin + window.location.pathname;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(""); setNotice(null);
    const email = form.email.trim().toLowerCase();
    if (mode === "signup") {
      if (form.name.trim().length < 2) return setError("Display name must be at least 2 characters.");
      if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    }
    setPending(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (error) throw error;
        closeAuth(); setForm({ email: "", password: "", name: "" });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password: form.password, options: { data: { display_name: form.name.trim().slice(0, 40) }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) { closeAuth(); setForm({ email: "", password: "", name: "" }); }
        else if (data.user && (data.user.identities?.length ?? 0) === 0) setError("An account with this email already exists. Sign in instead.");
        else setNotice(<><MailCheck className="mb-1 h-5 w-5 text-primary" />Account created. We sent a confirmation link to <b className="text-foreground">{email}</b>. Open it, then come back and sign in.</>);
      } else {
        if (form.password) {
          const { error } = await supabase.auth.updateUser({ password: form.password });
          if (error) throw error;
          setNotice("Password updated. You're signed in.");
        } else {
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
          if (error) throw error;
          setNotice(<>If <b className="text-foreground">{email}</b> has an account, a reset link is on its way.</>);
        }
      }
    } catch (err: any) {
      const m = errMsg(err);
      setError(/Email not confirmed/i.test(m) ? "Your email isn't confirmed yet. Open the link we emailed you, or resend it below." : /Invalid login credentials/i.test(m) ? "Wrong email or password." : m);
    } finally { setPending(false); }
  };

  const resend = async () => {
    setPending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: form.email.trim().toLowerCase(), options: { emailRedirectTo: redirect } });
    setPending(false);
    if (error) setError(errMsg(error)); else { setError(""); setNotice("Confirmation email sent again. Check your inbox and spam folder."); }
  };

  const { session } = useApp();
  const recovering = mode === "reset" && !!session;
  return (
    <Dialog open={!!authOpen} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="max-w-md sm:rounded-2xl">
        <DialogTitle className="font-display text-2xl font-semibold">{mode === "signup" ? "Join MANGASALT" : mode === "reset" ? (recovering ? "Choose a new password" : "Reset password") : "Welcome back"}</DialogTitle>
        <DialogDescription>{mode === "signup" ? "Save series, keep your reading history and join the discussion." : mode === "reset" ? (recovering ? "Enter a new password for your account." : "We'll email you a link to set a new password.") : "Sign in with your email and password."}</DialogDescription>
        <form className="mt-2 flex flex-col gap-3" onSubmit={submit}>
          {mode === "signup" && <Input placeholder="Display name" autoComplete="nickname" maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-displayname" required />}
          {!recovering && <Input placeholder="Email" type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" required />}
          {(mode !== "reset" || recovering) && (
            <div className="relative">
              <Input placeholder={recovering ? "New password" : "Password"} type={showPw ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pr-11" minLength={mode === "login" ? 1 : 8} data-testid="input-password" required />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground" data-testid="button-toggle-password">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {mode !== "login" && form.password && form.password.length < 8 && <p className="mt-1 px-1 text-xs text-muted-foreground">{8 - form.password.length} more character{8 - form.password.length === 1 ? "" : "s"} needed</p>}
            </div>
          )}
          {error && <p className="text-sm text-destructive dark:text-red-400" role="alert" data-testid="text-auth-error">{error}</p>}
          {notice && <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-muted-foreground" data-testid="text-auth-notice">{notice}</div>}
          <Button type="submit" disabled={pending} className="mt-1 rounded-full" data-testid="button-auth-submit">
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === "signup" ? "Create account" : mode === "reset" ? (recovering ? "Update password" : "Send reset link") : "Sign in"}
          </Button>
          {/confirm/i.test(error) && form.email && <Button type="button" variant="outline" className="rounded-full" onClick={resend} disabled={pending} data-testid="button-resend">Resend confirmation email</Button>}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {mode === "login" && <button type="button" className="hover:text-foreground" onClick={() => openAuth("reset")} data-testid="button-auth-forgot">Forgot password?</button>}
            <span>
              {mode === "signup" ? "Already have an account?" : mode === "login" ? "New here?" : "Remembered it?"}{" "}
              <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => openAuth(mode === "login" ? "signup" : "login")} data-testid="button-auth-switch">
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Shell: top bar + bottom tab bar ----------
export const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/discussion", label: "Discuss", icon: MessagesSquare },
];
// Mobile tab bar: the last tab is Profile; Discussion is in the top nav (desktop) and the account menu.
export const BOTTOM_TABS = [...TABS.slice(0, 4), { href: "/profile", label: "Profile", icon: UserIcon }];

const isActive = (loc: string, href: string) => (href === "/" ? loc === "/" : loc === href || loc.startsWith(href + "/"));

export function TopBar() {
  const { user, openAuth, signOut } = useApp();
  const [loc, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 12); h(); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  return (
    <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? "border-b border-border/60 bg-background/70 backdrop-blur-2xl backdrop-saturate-150" : "bg-transparent"}`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="font-display text-lg font-bold tracking-tight sm:text-xl" data-testid="link-home" aria-label="MANGASALT home">MANGA<span className="text-primary">SALT</span></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} data-testid={`link-top-${t.label.toLowerCase()}`}
              className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive(loc, t.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {isActive(loc, t.href) && <motion.span layoutId="top-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{t.label === "Discuss" ? "Discussion" : t.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {(user?.role === "creator" || user?.role === "admin") && (
            <Link href="/studio" data-testid="link-top-studio" className={`mr-1 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition md:flex ${loc.startsWith("/studio") ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"}`}>
              <PenTool className="h-3.5 w-3.5" />Studio
            </Link>
          )}
          <ThemeSwitch />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Account menu" data-testid="button-account" className="grid h-9 w-9 place-items-center rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Avatar name={user.name} hue={user.hue} size={34} /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{user.name}<span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/profile")} data-testid="menu-profile"><UserIcon className="mr-2 h-4 w-4" />Profile</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/discussion")} data-testid="menu-discussion"><MessagesSquare className="mr-2 h-4 w-4" />Discussion</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/history")} data-testid="menu-history"><History className="mr-2 h-4 w-4" />Reading history</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/settings")} data-testid="menu-settings"><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
                {(user.role === "creator" || user.role === "admin") && <DropdownMenuItem onSelect={() => navigate("/studio")} data-testid="menu-studio"><PenTool className="mr-2 h-4 w-4" />Creator studio</DropdownMenuItem>}
                {user.role === "admin" && <DropdownMenuItem onSelect={() => navigate("/admin")} data-testid="menu-admin"><Shield className="mr-2 h-4 w-4" />Admin dashboard</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOut()} data-testid="menu-signout"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="rounded-full" onClick={() => openAuth("login")} data-testid="button-signin">Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const [loc] = useLocation();
  const tabs = BOTTOM_TABS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden" aria-label="Tabs">
      <div className="glass-nav mx-auto flex max-w-md items-center justify-between rounded-[22px] px-2 py-1.5">
        {tabs.map((t) => {
          const active = isActive(loc, t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} data-testid={`tab-${t.label.toLowerCase()}`} aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${active ? "text-primary" : "text-muted-foreground"}`}>
              {active && <motion.span layoutId="tab-glow" className="absolute inset-x-2 inset-y-0 rounded-xl bg-primary/15" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon className="relative h-5 w-5" />
              <span className="relative">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ---------- Theme switch (sun / moon) ----------
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useApp();
  const dark = theme === "dark";
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
        { duration: 600, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => {});
  };
  return (
    <button role="switch" aria-checked={dark} aria-label="Dark mode" onClick={onClick} data-testid="switch-theme"
      className={`relative flex h-8 w-[58px] shrink-0 items-center overflow-hidden rounded-full border p-0.5 transition-colors duration-700 ${dark ? "border-white/10 bg-gradient-to-br from-[hsl(232_45%_12%)] to-[hsl(260_40%_20%)]" : "border-sky-300/70 bg-gradient-to-br from-sky-300 to-amber-200"} ${className}`}>
      {[[10, 7, 0], [20, 18, 0.6], [30, 9, 1.2]].map(([l, t, d], i) => (
        <motion.span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-white" style={{ left: l, top: t }}
          animate={dark ? { opacity: [0.2, 1, 0.2] } : { opacity: 0 }} transition={dark ? { duration: 1.8, repeat: Infinity, delay: d } : { duration: 0.3 }} />
      ))}
      <motion.span layout transition={{ type: "spring", stiffness: 520, damping: 28 }}
        className={`relative z-10 grid h-6 w-6 place-items-center rounded-full ${dark ? "ml-auto bg-gradient-to-br from-slate-100 to-indigo-200" : "bg-gradient-to-br from-amber-300 to-orange-500"}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={dark ? "moon" : "sun"} className="block h-6 w-6" initial={{ rotate: -90, scale: 0.3 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0.3 }} />
        </AnimatePresence>
      </motion.span>
    </button>
  );
}
