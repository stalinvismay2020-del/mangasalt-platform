import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, Bookmark, BookOpen, Upload, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead, EmptyBox, SeriesPoster, asset } from "@/components/shared";
import { useApp, compact } from "@/lib/app-context";
import type { LibraryData, HomeData, SeriesCard } from "@shared/schema";

function Head({ icon: Icon, title }: { icon: any; title: string }) {
  return <h2 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</h2>;
}

function ContinueCard({ s }: { s: SeriesCard }) {
  const { setOpenSeries } = useApp();
  return (
    <button onClick={() => setOpenSeries(s)} data-testid={`card-continue-${s.id}`}
      className="group flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40">
      <img src={asset(s.cover)} alt="" className="h-20 w-14 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-primary">{s.title}</p>
        <p className="text-xs text-muted-foreground">Chapter 1 of {s.chapterCount}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, 100 / s.chapterCount)}%` }} /></div>
      </div>
    </button>
  );
}

export default function Library() {
  const { user, openAuth, setOpenSeries } = useApp();
  const lib = useQuery<LibraryData>({ queryKey: ["/api/me/library", { u: String(user?.id ?? "") }], enabled: !!user });
  const home = useQuery<HomeData>({ queryKey: ["/api/home", { u: String(user?.id ?? "") }] });
  const d = lib.data;
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 pb-10 pt-4 sm:px-6">
      <PageHead kicker="Your shelf" title="Library" />

      <section>
        <Head icon={Clock} title="Continue reading" />
        {!user ? <EmptyBox>Sign in to keep your place in every series. <button className="font-medium text-primary hover:underline" onClick={() => openAuth("login")} data-testid="button-library-signin">Sign in</button></EmptyBox>
          : !d?.continueReading.length ? <EmptyBox>Nothing in progress. Open any official chapter below and it will show up here.</EmptyBox>
          : <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">{d.continueReading.map((s) => <ContinueCard key={s.id} s={s} />)}</div>}
      </section>

      <section>
        <Head icon={Bookmark} title="Saved" />
        {!user || !d?.saved.length ? <EmptyBox>No saved titles yet. Tap Save on any title page to keep it here.</EmptyBox>
          : <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{d.saved.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} size="sm" />)}</div>}
      </section>

      {user && !!d?.following.length && (
        <section>
          <Head icon={Heart} title="Following" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{d.following.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} size="sm" />)}</div>
        </section>
      )}

      <section>
        <Head icon={BookOpen} title="MANGASALT Library" />
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">Every official series on the platform, published by its creator.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <motion.button whileHover={{ y: -3 }} onClick={() => (user ? null : openAuth("signup"))} data-testid="button-publish-comic"
            className="flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary shadow-[0_0_30px_hsl(var(--primary)/0.35)]"><Upload className="h-5 w-5" /></span>
            <span className="font-semibold">Publish your comic</span>
            <span className="text-xs text-muted-foreground">{user ? "Creator Studio opens in the next build" : "Join as a creator to upload chapters"}</span>
          </motion.button>
          {home.data?.topLiked.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} />)}
        </div>
      </section>

      {user && d && (
        <p className="text-xs text-muted-foreground">{compact(d.counts.likes)} likes given · {compact(d.counts.read)} series opened · {compact(d.counts.comments)} comments</p>
      )}
    </div>
  );
}
