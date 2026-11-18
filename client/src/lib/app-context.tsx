import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, queryClient, setAuthToken, invalidatePrefixes, API_BASE } from "./queryClient";
import { MotionConfig } from "framer-motion";
import type { PublicUser, SeriesCard } from "@shared/schema";

type Theme = "dark" | "light";
export type A11y = { reduceMotion: boolean; largeText: boolean; highContrast: boolean; underlineLinks: boolean; dyslexicSpacing: boolean };
const A11Y_DEFAULT: A11y = { reduceMotion: false, largeText: false, highContrast: false, underlineLinks: false, dyslexicSpacing: false };
const store = {
  get<T>(k: string, d: T): T { try { const v = window.localStorage?.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } },
  set(k: string, v: unknown) { try { window.localStorage?.setItem(k, JSON.stringify(v)); } catch {} },
};
type Ctx = {
  user: PublicUser | null;
  theme: Theme;
  toggleTheme: () => void;
  authOpen: false | "login" | "signup";
  openAuth: (mode?: "login" | "signup") => void;
  closeAuth: () => void;
  signIn: (token: string, user: PublicUser) => void;
  signOut: () => void;
  openSeries: SeriesCard | null;
  setOpenSeries: (s: SeriesCard | null) => void;
  updateUser: (u: PublicUser) => void;
  a11y: A11y;
  setA11y: (p: Partial<A11y>) => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const sys = () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const [theme, setTheme] = useState<Theme>(sys);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (manual) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const on = () => setTheme(mq.matches ? "light" : "dark");
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [manual]);
  const [authOpen, setAuthOpen] = useState<Ctx["authOpen"]>(false);
  const [openSeries, setOpenSeries] = useState<SeriesCard | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // accessibility preferences live on this device
  const [a11y, setA11yState] = useState<A11y>(() => {
    const saved = store.get("ms-a11y", A11Y_DEFAULT);
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return saved;
    return { ...saved, reduceMotion: true };
  });
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle("a11y-reduce-motion", a11y.reduceMotion);
    c.toggle("a11y-large-text", a11y.largeText);
    c.toggle("a11y-contrast", a11y.highContrast);
    c.toggle("a11y-underline", a11y.underlineLinks);
    c.toggle("a11y-spacing", a11y.dyslexicSpacing);
  }, [a11y]);

  // restore the signed-in session after a refresh
  useEffect(() => {
    const saved = store.get<{ t: string | null }>("ms-session", { t: null }).t;
    if (!saved) return;
    setAuthToken(saved);
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${saved}` } }).then((r) => r.json()).then((d) => {
      if (d.user) { setUser(d.user); refreshPersonal(); } else { setAuthToken(null); store.set("ms-session", { t: null }); }
    }).catch(() => {});
  }, []);

  const refreshPersonal = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/home"] });
    invalidatePrefixes("/api/series");
    queryClient.invalidateQueries({ queryKey: ["/api/me/library"] });
  };

  const value: Ctx = {
    user,
    theme,
    toggleTheme: () => { setManual(true); setTheme((t) => (t === "dark" ? "light" : "dark")); },
    authOpen,
    openAuth: (mode = "login") => setAuthOpen(mode),
    closeAuth: () => setAuthOpen(false),
    signIn: (token, u) => {
      setAuthToken(token);
      store.set("ms-session", { t: token });
      setUser(u);
      setAuthOpen(false);
      refreshPersonal();
    },
    signOut: () => {
      apiRequest("POST", "/api/auth/logout").catch(() => {});
      setAuthToken(null);
      store.set("ms-session", { t: null });
      setUser(null);
      refreshPersonal();
    },
    openSeries,
    setOpenSeries,
    updateUser: (u) => setUser((prev) => (prev ? { ...prev, ...u } : prev)),
    a11y,
    setA11y: (p) => setA11yState((prev) => { const next = { ...prev, ...p }; store.set("ms-a11y", next); return next; }),
  };
  return <AppCtx.Provider value={value}><MotionConfig reducedMotion={a11y.reduceMotion ? "always" : "user"}>{children}</MotionConfig></AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export const TYPE_LABEL: Record<string, string> = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua", comic: "Comic" };
export const TYPE_ORIGIN: Record<string, string> = { manga: "Japan", manhwa: "Korea", manhua: "China", comic: "Webcomic" };
export function rightsLabel(s: { rights: string; readable?: boolean }) {
  if (s.rights === "cc-by-4.0") return "Free · Official EN · CC BY 4.0";
  return s.readable === false ? "Original · Pages coming soon" : "Original · Official EN";
}

export function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
export function timeAgo(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
