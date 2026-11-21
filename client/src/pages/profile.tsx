import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Float } from "@/components/motion";
import { UserRound, MessageSquare, Heart, Settings, Shield, PenTool, Bookmark, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, timeAgo, compact } from "@/lib/app-context";
import { profileSummary, userComments, listBookmarks, listReads } from "@/lib/data";
import { Avatar, EmptyBox, InlineError, SignInPrompt, PageHead } from "@/components/shared";
import NotFound from "@/pages/not-found";

export default function ProfilePage({ params }: { params?: { id?: string } }) {
  const { user, ready } = useApp();
  const id = params?.id ?? user?.id;
  const own = !!user && id === user.id;
  const sum = useQuery({ queryKey: ["profile-summary", id], queryFn: () => profileSummary(id!), enabled: !!id });
  const comments = useQuery({ queryKey: ["user-comments", id], queryFn: () => userComments(id!), enabled: !!id });
  const saved = useQuery({ queryKey: ["bookmarks", user?.id], queryFn: () => listBookmarks(user!.id), enabled: own });
  const reads = useQuery({ queryKey: ["history", user?.id, 60], queryFn: () => listReads(user!.id, 60), enabled: own });

  if (!ready) return null;
  if (!id) return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><PageHead icon={UserRound} kicker="Account" title="Profile" /><SignInPrompt what="see your profile" /></div>;
  if (sum.error) return <div className="mx-auto max-w-3xl px-4 py-10"><InlineError error={sum.error} onRetry={() => sum.refetch()} title="Couldn't load this profile" /></div>;
  if (sum.isLoading) return <div className="mx-auto max-w-3xl px-4 py-10"><div className="shimmer relative h-40 overflow-hidden rounded-3xl bg-muted" /></div>;
  if (!sum.data) return <NotFound what="profile" />;
  const p = sum.data;
  const name = own ? user!.name : p.name;
  const hue = own ? user!.hue : p.hue;
  const bio = own ? user!.bio : p.bio;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} className="relative isolate overflow-hidden rounded-3xl border border-border bg-card/60 p-5 backdrop-blur sm:p-7">
        <div className="absolute inset-0 -z-10 opacity-40" style={{ background: `radial-gradient(70% 90% at 0% 0%, hsl(${hue} 80% 50% / .35), transparent 70%)` }} />
        <div className="flex flex-wrap items-center gap-4">
          <Float amp={5} dur={4} className="relative shrink-0">
            <span aria-hidden className="spin-slow absolute -inset-1 rounded-full opacity-80 blur-[2px]" style={{ background: `conic-gradient(from 0deg, hsl(${hue} 85% 55%), transparent 40%, hsl(var(--primary)), transparent 80%, hsl(${hue} 85% 55%))` }} />
            <span className="relative block rounded-full ring-4 ring-background"><Avatar name={name} hue={hue} size={72} /></span>
          </Float>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl font-bold sm:text-3xl" data-testid="text-profile-name">{name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Joined {new Date(p.joined).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              {p.role === "admin" && <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"><Shield className="h-3 w-3" />Admin</span>}
              {p.role === "creator" && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-500"><PenTool className="h-3 w-3" />Creator</span>}
            </p>
            {own && user!.email && <p className="text-xs text-muted-foreground">{user!.email}</p>}
          </div>
          {own && <Link href="/settings" className="w-full sm:w-auto"><Button variant="outline" className="w-full gap-2 rounded-full bg-background/40 backdrop-blur sm:w-auto" data-testid="button-edit-profile"><Settings className="h-4 w-4" />Edit profile</Button></Link>}
        </div>
        {bio ? <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85" data-testid="text-profile-bio">{bio}</p> : own ? <p className="mt-4 text-sm text-muted-foreground">Add a short bio in settings.</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icon={MessageSquare} label="Comments" value={p.comments} />
          <Stat icon={Heart} label="Likes given" value={p.likes} />
          {own && <Stat icon={Bookmark} label="Saved" value={saved.data?.length} />}
          {own && <Stat icon={History} label="Chapters read" value={reads.data?.length} suffix={reads.data && reads.data.length >= 60 ? "+" : ""} />}
        </div>
        {own && (user!.role === "admin" || user!.role === "creator") && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/studio"><Button size="sm" variant="secondary" className="gap-1.5 rounded-full" data-testid="link-studio"><PenTool className="h-3.5 w-3.5" />Creator studio</Button></Link>
            {user!.role === "admin" && <Link href="/admin"><Button size="sm" variant="secondary" className="gap-1.5 rounded-full" data-testid="link-admin"><Shield className="h-3.5 w-3.5" />Admin</Button></Link>}
          </div>
        )}
      </motion.div>

      <section className="mt-8" aria-labelledby="recent">
        <h2 id="recent" className="font-display mb-3 text-lg font-semibold">Recent comments</h2>
        {comments.error ? <InlineError error={comments.error} onRetry={() => comments.refetch()} />
          : comments.isLoading ? <div className="shimmer relative h-20 overflow-hidden rounded-2xl bg-muted" />
          : !comments.data?.length ? <EmptyBox>No comments yet.</EmptyBox>
          : (
            <ul className="space-y-2" data-testid="list-user-comments">
              {comments.data.map((c) => {
                const href = c.media_id ? `/title/${c.media_id}` : c.series_key?.startsWith("ms-") ? `/series/${c.series_key.slice(3)}` : null;
                const body = c.spoiler ? "Spoiler hidden" : c.body;
                const inner = (<><p className="line-clamp-3 text-sm">{body}</p><p className="mt-1 text-xs text-muted-foreground">{c.target_title ? `On ${c.target_title}` : "Comment"}{c.chapter_key ? ` · chapter ${c.chapter_key}` : ""} · {timeAgo(c.created_at)}</p></>);
                return <li key={c.id} className="rounded-2xl border border-border bg-card/40 p-3">{href ? <Link href={href} className="block hover:text-primary">{inner}</Link> : inner}</li>;
              })}
            </ul>
          )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix = "" }: { icon: any; label: string; value: number | undefined; suffix?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.2 }} whileHover={{ y: -3 }} className="rounded-2xl border border-transparent bg-background/60 px-3 py-2.5 transition-colors hover:border-primary/40">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="font-display mt-0.5 text-xl font-semibold tabular-nums">{value === undefined ? "–" : `${compact(value)}${suffix}`}</p>
    </motion.div>
  );
}
