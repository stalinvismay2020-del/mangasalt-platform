import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, storage, errMsg } from "./supabase";
import { queryClient } from "./queryClient";

export type Theme = "dark" | "light";
export type ReaderMode = "vertical" | "paged";
export type ReaderDir = "ltr" | "rtl";
export type ReaderFit = "width" | "height" | "original";
export type ReaderPrefs = { mode: ReaderMode; dir: ReaderDir; fit: ReaderFit; gap: boolean };
export type Profile = { id: string; name: string; bio: string; hue: number; email: string | null; role: "admin" | "creator" | null; banned: boolean };

type Ctx = {
  ready: boolean;
  session: Session | null;
  user: Profile | null;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  prefs: ReaderPrefs;
  setPrefs: (p: Partial<ReaderPrefs>) => void;
  authOpen: false | "login" | "signup" | "reset";
  openAuth: (mode?: "login" | "signup" | "reset") => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);
const PREFS_KEY = "mangasalt.reader";
const THEME_KEY = "mangasalt.theme";
const DEFAULT_PREFS: ReaderPrefs = { mode: "vertical", dir: "ltr", fit: "width", gap: false };

function readJSON<T>(k: string, fallback: T): T {
  try { const v = storage.getItem(k); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}

async function loadProfile(session: Session): Promise<Profile> {
  const uid = session.user.id;
  const [p, r, b] = await Promise.all([
    supabase.from("profiles").select("display_name,bio,avatar_hue").eq("visitor_id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("user_bans").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);
  if (p.error) console.error("[profile] load failed", p.error);
  const roles = (r.data ?? []).map((x: any) => x.role as string);
  return {
    id: uid,
    name: p.data?.display_name || (session.user.user_metadata?.display_name as string) || session.user.email?.split("@")[0] || "Reader",
    bio: p.data?.bio ?? "",
    hue: p.data?.avatar_hue ?? 24,
    email: session.user.email ?? null,
    role: roles.includes("admin") ? "admin" : roles.includes("creator") ? "creator" : null,
    banned: !!b.data,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = (() => { try { return storage.getItem(THEME_KEY); } catch { return null; } })();
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [prefs, setPrefsState] = useState<ReaderPrefs>(() => readJSON(PREFS_KEY, DEFAULT_PREFS));
  const [authOpen, setAuthOpen] = useState<Ctx["authOpen"]>(false);

  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);

  const applySession = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setUser(null); return; }
    try { setUser(await loadProfile(s)); } catch (e) { console.error("[auth] profile", errMsg(e)); }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) console.error("[auth] getSession", error);
      if (alive) await applySession(data.session);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION") return;
      // Defer Supabase calls out of the callback (recommended by supabase-js).
      setTimeout(() => { applySession(s); queryClient.invalidateQueries(); }, 0);
      if (event === "PASSWORD_RECOVERY") setAuthOpen("reset");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [applySession]);

  const setTheme = (t: Theme) => { setThemeState(t); try { storage.setItem(THEME_KEY, t); } catch { /* ignore */ } };
  const setPrefs = (p: Partial<ReaderPrefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...p }; try { storage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next;
  });

  const value = useMemo<Ctx>(() => ({
    ready, session, user, theme, prefs, authOpen,
    setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"), setPrefs,
    openAuth: (m = "login") => setAuthOpen(m), closeAuth: () => setAuthOpen(false),
    signOut: async () => { const { error } = await supabase.auth.signOut(); if (error) console.error("[auth] signOut", error); queryClient.clear(); setUser(null); setSession(null); },
    refreshProfile: async () => { if (session) setUser(await loadProfile(session)); },
  }), [ready, session, user, theme, prefs, authOpen]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export const TYPE_LABEL: Record<string, string> = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua", comic: "Comic", webcomic: "Webcomic", novel: "Novel" };
export function compact(n: number | null | undefined) {
  const v = n ?? 0;
  return v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(v);
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24; if (d < 30) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
