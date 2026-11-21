import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Eye, Heart, MessageSquare, ShieldCheck, Play, Flag, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, compact } from "@/lib/app-context";
import { getHosted, getHostedChapters, getProgress, readKeysFor, hostedKey } from "@/lib/data";
import { pageUrl } from "@/lib/supabase";
import { formatNumber } from "@/lib/chapter-search";
import { Cover, TypeBadge, InlineError } from "@/components/shared";
import { ChapterList, type ListChapter } from "@/components/chapter-list";
import { SaveButton, LikeButton } from "@/components/social";
import { Discussion, ReportDialog } from "@/components/discussion";
import NotFound from "@/pages/not-found";

export const RIGHTS_LABEL: Record<string, string> = {
  owner: "Published by its creator", licensed: "Licensed to MANGASALT", "cc-by": "Creative Commons BY", "cc-by-sa": "Creative Commons BY-SA", "public-domain": "Public domain",
};

export default function SeriesPage({ params }: { params: { slug: string } }) {
  const { user } = useApp();
  const [, nav] = useLocation();
  const [more, setMore] = useState(false);
  const [reporting, setReporting] = useState(false);
  const s = useQuery({ queryKey: ["hosted", params.slug], queryFn: () => getHosted(params.slug) });
  const ch = useQuery({ queryKey: ["hosted-chapters", s.data?.id], queryFn: () => getHostedChapters(s.data!.id), enabled: !!s.data });
  const key = hostedKey(params.slug);
  const prog = useQuery({ queryKey: ["progress", user?.id, key], queryFn: () => getProgress(user!.id, key), enabled: !!user });
  const reads = useQuery({ queryKey: ["reads", user?.id, key], queryFn: () => readKeysFor(user!.id, key), enabled: !!user });

  if (s.error) return <div className="mx-auto max-w-3xl px-4 py-10"><InlineError error={s.error} onRetry={() => s.refetch()} title="Couldn't load this series" /></div>;
  if (s.isLoading) return <div className="mx-auto max-w-5xl px-4 pt-6" aria-busy><div className="shimmer relative h-72 overflow-hidden rounded-2xl bg-muted" /></div>;
  if (!s.data) return <NotFound what="series" />;
  const d = s.data;
  const chapters = ch.data ?? [];
  const list: ListChapter[] = chapters.map((c) => ({
    key: String(c.number), number: c.number, title: c.title || null, label: `Chapter ${formatNumber(c.number)}`, publishedAt: c.published_at,
    pages: c.pages.length, readable: c.pages.length > 0, href: `/read/${d.slug}/${c.number}`, unavailableReason: c.pages.length ? undefined : "No pages uploaded",
  }));
  const resume = prog.data && chapters.some((c) => String(c.number) === prog.data!.chapter_key) ? prog.data : null;
  const first = chapters.find((c) => c.pages.length > 0);
  const cover = pageUrl(d.cover_path);

  return (
    <div className="pb-10">
      <div className="relative overflow-hidden">
        {cover && <img src={cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-3xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/75 to-background" />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-4 sm:px-6 sm:pt-8">
          <button onClick={() => (history.length > 1 ? history.back() : nav("/"))} className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur hover:text-foreground" data-testid="button-back"><ArrowLeft className="h-4 w-4" />Back</button>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto w-44 shrink-0 sm:mx-0 sm:w-56">
              <Cover src={cover} alt={`${d.title} cover`} className="aspect-[2/3] w-full rounded-xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10" />
            </motion.div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <TypeBadge type={d.kind} />
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" />{RIGHTS_LABEL[d.rights] ?? d.rights}</span>
              </div>
              <h1 className="font-display mt-2 text-balance text-3xl font-bold leading-tight sm:text-5xl" data-testid="text-series-title">{d.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">by <span className="font-medium text-foreground">{d.author}</span>{d.artist && d.artist !== d.author ? <> · art by {d.artist}</> : null} · <span className="capitalize">{d.status}</span></p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground sm:justify-start">
                <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" />{d.chapters} chapter{d.chapters === 1 ? "" : "s"}</span>
                <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{compact(d.views)} reads</span>
                <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{compact(d.likes)}</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{compact(d.comments)}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {resume ? (
                  <Button size="lg" className="glow-primary gap-2 rounded-full" onClick={() => nav(`/read/${d.slug}/${resume.chapter_key}?p=${resume.page + 1}`)} data-testid="button-resume">
                    <Play className="h-4 w-4 fill-current" />Resume {resume.chapter_label} · p.{resume.page + 1}
                  </Button>
                ) : first ? (
                  <Button size="lg" className="glow-primary gap-2 rounded-full" onClick={() => nav(`/read/${d.slug}/${first.number}`)} data-testid="button-start">
                    <BookOpen className="h-4 w-4" />Start reading
                  </Button>
                ) : null}
                <SaveButton meta={{ series_key: key, title: d.title, cover, kind: d.kind, href: `/series/${d.slug}`, series_id: d.id }} />
                <LikeButton seriesId={d.id} title={d.title} cover={cover} kind={d.kind} initialCount={d.likes} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {d.synopsis && (
          <div className="mt-2">
            <p className={`whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground ${more ? "" : "line-clamp-4"}`} data-testid="text-synopsis">{d.synopsis}</p>
            {d.synopsis.length > 260 && <button onClick={() => setMore(!more)} className="mt-1 text-sm font-medium text-primary">{more ? "Show less" : "Read more"}</button>}
          </div>
        )}
        {d.genres.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{d.genres.map((g) => <span key={g} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{g}</span>)}</div>}

        <section className="mt-8" aria-labelledby="ch">
          <h2 id="ch" className="font-display mb-3 text-xl font-semibold sm:text-2xl">Chapters</h2>
          {ch.error ? <InlineError error={ch.error} onRetry={() => ch.refetch()} title="Couldn't load chapters" />
            : ch.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="shimmer relative h-14 overflow-hidden rounded-xl bg-muted" />)}</div>
            : <ChapterList chapters={list} readKeys={reads.data} resumeKey={resume?.chapter_key ?? null} emptyText="No chapters have been published yet." />}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card/50 p-4 text-xs leading-relaxed text-muted-foreground" data-testid="section-attribution">
          <p className="flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" />Rights &amp; attribution</p>
          {d.attribution && <p className="mt-1.5">{d.attribution}</p>}
          {d.copyright_notice && <p className="mt-1">{d.copyright_notice}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {d.license_url && <a href={d.license_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Licence<ExternalLink className="h-3 w-3" /></a>}
            <Link href="/legal/copyright" className="inline-flex items-center gap-1 hover:text-foreground" data-testid="link-copyright"><Flag className="h-3 w-3" />Copyright &amp; takedown</Link>
            {user && <button onClick={() => setReporting(true)} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="button-report-series"><Flag className="h-3 w-3" />Report series</button>}
          </div>
        </section>

        <div className="mt-10"><Discussion target={{ seriesId: d.id, title: d.title, cover }} /></div>
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} type="series" id={d.id} />
    </div>
  );
}
