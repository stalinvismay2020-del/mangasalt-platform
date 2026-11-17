import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, queryClient, setAuthToken } from "./queryClient";
import type { PublicUser } from "@shared/schema";

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
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [authOpen, setAuthOpen] = useState<Ctx["authOpen"]>(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const refreshPersonal = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/home"] });
    queryClient.invalidateQueries({ queryKey: ["/api/series"] });
  };

  const value: Ctx = {
    user,
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
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
    searchOpen,
    setSearchOpen,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export const TYPE_LABEL: Record<string, string> = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua" };
export const TYPE_ORIGIN: Record<string, string> = { manga: "Japan", manhwa: "Korea", manhua: "China" };

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
