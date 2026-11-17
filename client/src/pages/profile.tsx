import { useQuery } from "@tanstack/react-query";
import { LogOut, Moon, Sun, Heart, BookOpen, MessageCircle, Users, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead, Avatar, EmptyBox, ThemeSwitch } from "@/components/shared";
import { useApp, compact } from "@/lib/app-context";
import type { LibraryData } from "@shared/schema";

export default function Profile() {
  const { user, openAuth, signOut, theme, toggleTheme } = useApp();
  const lib = useQuery<LibraryData>({ queryKey: ["/api/me/library", { u: String(user?.id ?? "") }], enabled: !!user });
  if (!user)
    return (
      <div className="mx-auto max-w-md px-4 pb-10 pt-10 text-center sm:px-6">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full border border-border bg-card shadow-[0_0_40px_hsl(var(--primary)/0.25)]"><Users className="h-8 w-8 text-primary" /></div>
        <h1 className="font-display text-2xl font-semibold">Your MANGASALT profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to like series, save titles, follow creators and join discussions.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button className="rounded-full px-6" onClick={() => openAuth("login")} data-testid="button-profile-signin">Sign in</Button>
          <Button variant="outline" className="rounded-full px-6" onClick={() => openAuth("signup")} data-testid="button-profile-signup">Create account</Button>
        </div>
        <div className="mx-auto mt-8 flex w-fit items-center gap-3 text-sm text-muted-foreground">Dark mode<ThemeSwitch /></div>
      </div>
    );
  const c = lib.data?.counts;
  const stats = [[Heart, "Likes", c?.likes], [BookOpen, "Series read", c?.read], [MessageCircle, "Comments", c?.comments], [Users, "Following", lib.data?.followedCreators.length]] as const;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `hsl(${user.avatarHue} 70% 45% / .45)` }} />
        <div className="relative flex items-center gap-4">
          <Avatar user={user} size={64} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold" data-testid="text-profile-name">{user.displayName}</h1>
            <p className="text-sm text-muted-foreground">@{user.username}{user.isCreator ? " · Creator" : " · Reader"}</p>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-4 gap-2">
          {stats.map(([Icon, l, v]) => (
            <div key={l} className="rounded-xl bg-background/60 p-3 text-center"><Icon className="mx-auto h-4 w-4 text-primary" /><p className="mt-1 font-display text-xl font-semibold tabular-nums">{compact(v ?? 0)}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
          ))}
        </div>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Creators you follow</h2>
        {!lib.data?.followedCreators.length ? <EmptyBox>You’re not following any creators yet. Follow them from the Home page.</EmptyBox> : (
          <div className="flex flex-wrap gap-2">{lib.data.followedCreators.map((u) => (
            <span key={u.id} className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm"><Avatar user={u} size={26} />{u.displayName}</span>
          ))}</div>
        )}
      </section>
      <section className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex w-full items-center gap-3 px-4 py-3 text-sm">
          {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}Dark mode<ThemeSwitch className="ml-auto" />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground"><PenTool className="h-4 w-4" />Creator Studio<span className="ml-auto text-xs">Next build</span></div>
        <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-primary hover:bg-accent/50" data-testid="button-signout"><LogOut className="h-4 w-4" />Sign out</button>
      </section>
    </div>
  );
}
