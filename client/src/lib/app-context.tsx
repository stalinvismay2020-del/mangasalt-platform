import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, queryClient, setAuthToken, invalidatePrefixes } from "./queryClient";
import type { PublicUser, SeriesCard } from "@shared/schema";

type Theme = "dark" | "light";
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
  // Restore the sign-in this device used last time, before showing the app.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setReady(true); } };
    const timer = setTimeout(finish, 5000);
    apiRequest("GET", "/api/auth/restore")
      .then((r) => r.json())
      .then((d: { token: string | null; user: PublicUser | null }) => {
        if (!done && d.token && d.user) { setAuthToken(d.token); setUser(d.user); queryClient.clear(); }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); finish(); });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

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
      setUser(u);
      setAuthOpen(false);
      refreshPersonal();
    },
    signOut: () => {
      apiRequest("POST", "/api/auth/logout").catch(() => {});
      setAuthToken(null);
      setUser(null);
      refreshPersonal();
    },
    openSeries,
    setOpenSeries,
  };
  if (!ready) return (
    <div className="grid min-h-dvh place-items-center bg-background" aria-busy="true" data-testid="splash-restoring">
      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-2xl font-semibold tracking-tight">MANGA<span className="text-primary">SALT</span></span>
        <span className="h-1 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" /></span>
      </div>
    </div>
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
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
