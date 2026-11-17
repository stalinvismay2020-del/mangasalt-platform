import { Switch, Route, Router } from "wouter";
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
import { TopBar, BottomNav, QuickView, AuthDialog, ToastBridge } from "@/components/shared";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import NotFound from "@/pages/not-found";

function ScrollTop() {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc]);
  return null;
}

function Shell() {
  const [loc] = useLocation();
  if (loc.startsWith("/read/")) return (
    <>
      <ScrollTop />
      <ToastBridge />
      <Switch>
        <Route path="/read/:id/:page" component={Reader} />
        <Route path="/read/:id" component={Reader} />
      </Switch>
      <AuthDialog />
    </>
  );
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <ScrollTop />
      <ToastBridge />
      <TopBar />
      <motion.main key={loc.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
        <AppRouter />
      </motion.main>
      <footer className="mt-10 hidden border-t border-border md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-8 text-sm text-muted-foreground">
          <span className="font-display text-lg font-bold text-foreground">MANGA<span className="text-primary">SALT</span></span>
          <p className="max-w-md text-right">Every series on MANGASALT is hosted here with the rights holder's permission or an open license. Report infringing content and we take it down.</p>
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
      <Route path="/library" component={Library} />
      <Route path="/profile" component={Profile} />
      <Route path="/series/:slug" component={SeriesPage} />
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
