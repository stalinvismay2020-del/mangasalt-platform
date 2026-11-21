import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Settings as SettingsIcon, Moon, Sun, Loader2, LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useApp, type ReaderPrefs } from "@/lib/app-context";
import { updateProfile } from "@/lib/data";
import { supabase, errMsg } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { Avatar, PageHead } from "@/components/shared";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-border bg-card/50 p-4 sm:p-5"><h2 className="font-display mb-3 text-lg font-semibold">{title}</h2>{children}</section>;
}

export default function SettingsPage() {
  const { user, theme, setTheme, prefs, setPrefs, signOut, refreshProfile, openAuth } = useApp();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", bio: "", hue: 24 });
  const [pw, setPw] = useState({ a: "", b: "" });
  useEffect(() => { if (user) setForm({ name: user.name, bio: user.bio, hue: user.hue }); }, [user?.id]); // eslint-disable-line

  const saveProfile = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2 || name.length > 40) throw new Error("Display name must be 2–40 characters.");
      await updateProfile(user!.id, { display_name: name, bio: form.bio.trim().slice(0, 300), avatar_hue: Math.round(form.hue) });
    },
    onSuccess: async () => { await refreshProfile(); queryClient.invalidateQueries({ queryKey: ["profile-summary"] }); queryClient.invalidateQueries({ queryKey: ["thread"] }); toast({ title: "Profile saved" }); },
    onError: (e) => toast({ title: "Profile not saved", description: errMsg(e), variant: "destructive" }),
  });
  const changePw = useMutation({
    mutationFn: async () => {
      if (pw.a.length < 8) throw new Error("Use at least 8 characters.");
      if (pw.a !== pw.b) throw new Error("The passwords don't match.");
      const { error } = await supabase.auth.updateUser({ password: pw.a });
      if (error) throw error;
    },
    onSuccess: () => { setPw({ a: "", b: "" }); toast({ title: "Password updated" }); },
    onError: (e) => toast({ title: "Password not changed", description: errMsg(e), variant: "destructive" }),
  });

  const Opt = <K extends keyof ReaderPrefs>({ k, v, children }: { k: K; v: ReaderPrefs[K]; children: React.ReactNode }) => (
    <button onClick={() => setPrefs({ [k]: v } as Partial<ReaderPrefs>)} aria-pressed={prefs[k] === v} data-testid={`setting-${String(k)}-${String(v)}`}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${prefs[k] === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{children}</button>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <PageHead icon={SettingsIcon} kicker="Preferences" title="Settings" />
      <Card title="Appearance">
        <div className="flex gap-2">
          <button onClick={() => setTheme("dark")} aria-pressed={theme === "dark"} data-testid="setting-theme-dark" className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${theme === "dark" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Moon className="h-4 w-4" />Dark</button>
          <button onClick={() => setTheme("light")} aria-pressed={theme === "light"} data-testid="setting-theme-light" className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${theme === "light" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Sun className="h-4 w-4" />Light</button>
        </div>
      </Card>
      <Card title="Reader">
        <div className="space-y-3">
          <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Layout</p><div className="flex gap-2"><Opt k="mode" v="vertical">Vertical scroll</Opt><Opt k="mode" v="paged">Page by page</Opt></div></div>
          <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Direction (page mode)</p><div className="flex gap-2"><Opt k="dir" v="ltr">Left → right</Opt><Opt k="dir" v="rtl">Right → left</Opt></div></div>
          <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">Fit</p><div className="flex gap-2"><Opt k="fit" v="width">Width</Opt><Opt k="fit" v="height">Height</Opt><Opt k="fit" v="original">Original</Opt></div></div>
        </div>
      </Card>
      {user ? (
        <>
          <Card title="Profile">
            <form onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }} className="space-y-3">
              <div className="flex items-center gap-3"><Avatar name={form.name || "?"} hue={form.hue} size={52} /><div className="flex-1"><label className="text-xs font-semibold text-muted-foreground" htmlFor="hue">Avatar colour</label><Slider id="hue" value={[form.hue]} min={0} max={359} step={1} onValueChange={([v]) => setForm((f) => ({ ...f, hue: v }))} className="mt-2" data-testid="slider-hue" /></div></div>
              <div><label htmlFor="dn" className="text-xs font-semibold text-muted-foreground">Display name</label><Input id="dn" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={40} className="mt-1" data-testid="input-display-name" /></div>
              <div><label htmlFor="bio" className="text-xs font-semibold text-muted-foreground">Bio</label><Textarea id="bio" value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, 300) }))} rows={3} className="mt-1" data-testid="input-bio" /><p className="mt-1 text-right text-[11px] text-muted-foreground">{form.bio.length}/300</p></div>
              <Button type="submit" className="rounded-full" disabled={saveProfile.isPending} data-testid="button-save-profile">{saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save profile</Button>
            </form>
          </Card>
          <Card title="Account">
            <p className="mb-3 text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{user.email}</span></p>
            <form onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }} className="space-y-2">
              <Input type="password" autoComplete="new-password" placeholder="New password" value={pw.a} onChange={(e) => setPw((p) => ({ ...p, a: e.target.value }))} data-testid="input-new-password" />
              <Input type="password" autoComplete="new-password" placeholder="Repeat new password" value={pw.b} onChange={(e) => setPw((p) => ({ ...p, b: e.target.value }))} data-testid="input-new-password-2" />
              <Button type="submit" variant="outline" className="gap-2 rounded-full" disabled={changePw.isPending || !pw.a} data-testid="button-change-password">{changePw.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Change password</Button>
            </form>
            <Button variant="ghost" className="mt-4 gap-2 rounded-full text-destructive hover:text-destructive" onClick={() => signOut()} data-testid="button-sign-out"><LogOut className="h-4 w-4" />Sign out</Button>
          </Card>
        </>
      ) : (
        <Card title="Account"><p className="mb-3 text-sm text-muted-foreground">Sign in to edit your profile and sync your library across devices.</p><div className="flex gap-2"><Button className="rounded-full" onClick={() => openAuth("login")} data-testid="button-settings-signin">Sign in</Button><Button variant="outline" className="rounded-full" onClick={() => openAuth("signup")}>Create account</Button></div></Card>
      )}
    </div>
  );
}
