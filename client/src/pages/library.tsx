import { useLocation, Link } from "wouter";
import type { WorldShelfItem } from "@shared/world";
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
  const [, navigate] = useLocation();
  const n = s.lastChapter?.number ?? 0;
  return (
    <button onClick={() => (s.lastChapter ? navigate(`/read/${s.lastChapter.id}`) : setOpenSeries(s))} data-testid={`card-continue-${s.id}`}
      className="group flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40">
      <img src={asset(s.cover)} alt="" className="h-20 w-14 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-primary">{s.title}</p>
        <p className="truncate text-xs text-muted-foreground">{s.lastChapter ? `Ep. ${n} of ${s.chapterCount} · ${s.lastChapter.title}` : `Not started · ${s.chapterCount} episodes`}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (n / Math.max(1, s.chapterCount)) * 100)}%` }} /></div>
      </div>
    </button>
  );
}

function ShelfCard({ m }: { m: WorldShelfItem }) {
  return (
    <Link href={m.chapter ? `/mp/${m.id}/${encodeURIComponent(m.chapter)}` : `/title/${m.id}`} data-testid={`card-world-continue-${m.id}`}
      className="group flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40">
      <img src={m.cover} alt="" className="h-20 w-14 rounded-md object-cover" />
      <div className="min-w-0 flex-1"><p className="truncate font-semibold group-hover:text-primary">{m.title}</p><p className="truncate text-xs text-muted-foreground">{m.chapter ? `Chapter ${m.chapter}` : "Not started"}</p></div>
    </Link>
  );
}
function ShelfPoster({ m, k }: { m: WorldShelfItem; k: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }}>
      <Link href={`/title/${m.id}`} className="group block" data-testid={`card-world-saved-${m.id}`}>
        <img src={m.cover} alt={`${m.title} cover`} className="aspect-[2/3] w-full rounded-xl object-cover transition duration-500 group-hover:-translate-y-1 group-hover:shadow-xl" />
        <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-primary">{m.title}</p>
      </Link>
    </motion.div>
  );
}

export default function Library() {
  const { user, openAuth, setOpenSeries } = useApp();
  const [, navigate] = useLocation();
  const lib = useQuery<LibraryData>({ queryKey: ["/api/me/library", { u: String(user?.id ?? "") }], enabled: !!user });
  const home = useQuery<HomeData>({ queryKey: ["/api/home", { u: String(user?.id ?? "") }] });
  const w = useQuery<{ saved: WorldShelfItem[]; reading: WorldShelfItem[] }>({ queryKey: ["/api/me/world"], enabled: !!user });
  const d = lib.data;
  const reading = w.data?.reading ?? [], wsaved = w.data?.saved ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 pb-10 pt-4 sm:px-6">
      <PageHead kicker="Your shelf" title="Library" />

      <section>
        <Head icon={Clock} title="Continue reading" />
        {!user ? <EmptyBox>Sign in to keep your place in every series. <button className="font-medium text-primary hover:underline" onClick={() => openAuth("login")} data-testid="button-library-signin">Sign in</button></EmptyBox>
          : !d?.continueReading.length && !reading.length ? <EmptyBox>Nothing in progress. Open any chapter and it will show up here.</EmptyBox>
          : <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 sm:scroll-px-6 gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">{reading.map((m) => <ShelfCard key={`w${m.id}`} m={m} />)}{d?.continueReading.map((s) => <ContinueCard key={s.id} s={s} />)}</div>}
      </section>

      <section>
        <Head icon={Bookmark} title="Saved" />
        {!user || (!d?.saved.length && !wsaved.length) ? <EmptyBox>No saved titles yet. Tap Save on any title page to keep it here.</EmptyBox>
          : <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{wsaved.map((m, k) => <ShelfPoster key={`w${m.id}`} m={m} k={k} />)}{d?.saved.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} size="sm" />)}</div>}
      </section>

      {user && !!d?.following.length && (
        <section>
          <Head icon={Heart} title="Following" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{d.following.map((s, k) => <SeriesPoster key={s.id} s={s} index={k} onOpen={setOpenSeries} size="sm" />)}</div>
        </section>
      )}

      <section>
        <Head icon={BookOpen} title="MANGASALT Library" />
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">Series hosted in full on MANGASALT by their creators or under an open license.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <motion.button whileHover={{ y: -3 }} onClick={() => navigate("/studio/new")} data-testid="button-publish-comic"
            className="flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary shadow-[0_0_30px_hsl(var(--primary)/0.35)]"><Upload className="h-5 w-5" /></span>
            <span className="font-semibold">Publish your comic</span>
            <span className="text-xs text-muted-foreground">Upload your own manga in Creator Studio</span>
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
