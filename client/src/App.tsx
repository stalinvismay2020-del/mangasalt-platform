import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
// Route on the path only, so links like #/search?q=solo still match /search
const useHashPath = (): [string, (to: string, opts?: any) => void] => { const [loc, nav] = useHashLocation(); return [loc.split("?")[0] || "/", nav]; };
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
import OfficialReader from "@/pages/official-reader";
import { StudioHome, StudioNew, StudioSeries } from "@/pages/studio";
import { TopBar, BottomNav, QuickView, AuthDialog, ToastBridge } from "@/components/shared";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";
import Legal from "@/pages/legal";
import { Link } from "wouter";

function ScrollTop() {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc]);
  return null;
}

function Shell() {
  const [loc] = useLocation();
  if (loc.startsWith("/read/") || loc.startsWith("/mp/")) return (
    <>
      <ScrollTop />
      <ToastBridge />
      <ErrorBoundary resetKey={loc}><Switch>
        <Route path="/read/:id/:page" component={Reader} />
        <Route path="/read/:id" component={Reader} />
        <Route path="/mp/:id/:key" component={OfficialReader} />
        <Route><NotFound /></Route>
      </Switch></ErrorBoundary>
      <AuthDialog />
    </>
  );
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <ScrollTop />
      <ToastBridge />
      <TopBar />
      <motion.main key={loc.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
        <ErrorBoundary resetKey={loc}><AppRouter /></ErrorBoundary>
      </motion.main>
      <footer className="mt-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-display text-lg font-bold text-foreground">MANGA<span className="text-primary">SALT</span></span>
            <p className="mt-1 max-w-md text-xs">© 2026 MANGASALT. Catalogue data from AniList. Chapters only from official publishers, open licenses, or their own creators. No unofficial scans, ever.</p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Legal">
            <Link href="/legal/licenses" className="hover:text-foreground" data-testid="link-footer-licenses">Licenses &amp; credits</Link>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/legal/copyright" className="hover:text-foreground">Copyright &amp; takedown</Link>
          </nav>
        </div>
      </footer>
      <BottomNav />
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
      <Route path="/legal" component={Legal} />
      <Route path="/legal/:section" component={Legal} />
      <Route><NotFound /></Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashPath as any}>
            <Shell />
          </Router>
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
