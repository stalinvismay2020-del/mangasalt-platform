import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/app-context";
import Home from "@/pages/home";
import Trending from "@/pages/trending";
import Search from "@/pages/search";
import Library from "@/pages/library";
import Profile from "@/pages/profile";
import SeriesPage from "@/pages/series";
import Reader from "@/pages/reader";
import TitlePage from "@/pages/title";
import { StudioHome, StudioNew, StudioSeries } from "@/pages/studio";
import { TopBar, BottomNav, QuickView, AuthDialog, ToastBridge, AmbientBackdrop, BackToTop } from "@/components/shared";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import NotFound, { ErrorBoundary } from "@/pages/not-found";
import Legal from "@/pages/legal";
import { Link } from "wouter";
import { ShelfPage, StatsPage, TimelinePage, ReadersPage, ReaderProfilePage, NotificationsPage } from "@/pages/reader-pages";
import CalendarPage from "@/pages/calendar";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import { useRef, useState } from "react";

/** Announce page changes to screen readers and move focus to the new page. */
function RouteAnnouncer() {
  const [loc] = useLocation();
  const [msg, setMsg] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const h = document.querySelector("main h1") as HTMLElement | null;
      setMsg(`${h?.textContent || "Page"} loaded`);
      const main = document.getElementById("main");
      main?.focus({ preventScroll: true });
    }, 400);
    return () => clearTimeout(t);
  }, [loc]);
  return <div className="sr-only" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function ScrollTop() {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc]);
  return null;
}

function Shell() {
  const [loc] = useLocation();
  // old links to the removed embedded publisher reader go to the title's chapter list instead
  const mp = loc.match(/^\/mp\/(\d+)/);
  if (mp) return <Redirect to={`/title/${mp[1]}`} />;
  if (loc.startsWith("/read/")) return (
    <>
      <ScrollTop />
      <ToastBridge />
      <ErrorBoundary resetKey={loc}>
        <div>
          <Switch>
            <Route path="/read/:id/:page" component={Reader} />
            <Route path="/read/:id" component={Reader} />
          </Switch>
        </div>
      </ErrorBoundary>
      <AuthDialog />
    </>
  );
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to main content</a>
      <ScrollTop />
      <RouteAnnouncer />
      <ToastBridge />
      <AmbientBackdrop />
      <TopBar />
      <motion.main id="main" tabIndex={-1} className="outline-none" key={loc.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 14, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <ErrorBoundary resetKey={loc}><AppRouter /></ErrorBoundary>
      </motion.main>
      <footer className="mt-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-display text-lg font-bold text-foreground">MANGA<span className="text-primary">SALT</span></span>
            <p className="mt-1 max-w-md text-xs">© 2026 MANGASALT. Catalogue data from AniList and MangaDex. Chapters only from official publishers, open licenses, or their own creators. No unofficial scans, ever.</p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Legal">
            <Link href="/settings" className="hover:text-foreground">Accessibility</Link>
            <Link href="/legal/licenses" className="hover:text-foreground" data-testid="link-footer-licenses">Licenses &amp; credits</Link>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/legal/copyright" className="hover:text-foreground">Copyright &amp; takedown</Link>
          </nav>
        </div>
      </footer>
      <BottomNav />
      <BackToTop />
      <QuickView />
      <AuthDialog />
    </div>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/trending" component={Trending} />
      <Route path="/search" component={Search} />
      <Route path="/search/genre/:genre" component={Search} />
      <Route path="/search/type/:type" component={Search} />
      <Route path="/title/:id" component={TitlePage} />
      <Route path="/studio" component={StudioHome} />
      <Route path="/studio/new" component={StudioNew} />
      <Route path="/studio/series/:id" component={StudioSeries} />
      <Route path="/library" component={Library} />
      <Route path="/profile" component={Profile} />
      <Route path="/series/:slug" component={SeriesPage} />
      <Route path="/shelf/:id" component={ShelfPage} />
      <Route path="/stats" component={StatsPage} />
      <Route path="/timeline" component={TimelinePage} />
      <Route path="/readers" component={ReadersPage} />
      <Route path="/u/:username" component={ReaderProfilePage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/:tab" component={AdminPage} />
      <Route path="/legal" component={Legal} />
      <Route path="/legal/:section" component={Legal} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <Shell />
          </Router>
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
