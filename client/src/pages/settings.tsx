import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon, Accessibility, Bell, Globe2, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp, type A11y } from "@/lib/app-context";
import { PageHead } from "@/components/shared";
import { COUNTRIES, countryName, type NotifyPrefs } from "@shared/platform";

type Settings = { privateProfile: boolean; country: string | null; detectedCountry: string | null; bio: string; displayName: string; notify: NotifyPrefs };

function Row({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0"><label htmlFor={id} className="text-sm font-medium">{label}</label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      {children}
    </div>
  );
}

function AccessibilityCard() {
  const { a11y, setA11y } = useApp();
  const opts: [keyof A11y, string, string][] = [
    ["reduceMotion", "Reduce motion", "Turn off animations and page transitions"],
    ["largeText", "Larger text", "Increase text size across the app"],
    ["highContrast", "High contrast", "Stronger text and border colours"],
    ["underlineLinks", "Underline links", "Make links easy to spot without colour"],
    ["dyslexicSpacing", "Readable spacing", "Wider letter, word and line spacing"],
  ];
  return (
    <section aria-labelledby="h-a11y" className="rounded-2xl border border-border bg-card">
      <h2 id="h-a11y" className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold"><Accessibility className="h-4 w-4 text-primary" />Accessibility</h2>
      <div className="divide-y divide-border">
        {opts.map(([k, l, h]) => <Row key={k} id={`a11y-${k}`} label={l} hint={h}><Switch id={`a11y-${k}`} checked={a11y[k]} onCheckedChange={(c) => setA11y({ [k]: c })} data-testid={`switch-${k}`} /></Row>)}
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Saved on this device. MANGASALT works with screen readers (VoiceOver, TalkBack, NVDA, JAWS) and full keyboard navigation. Press Tab on any page to jump to the main content.</p>
    </section>
  );
}

export default function SettingsPage() {
  const { user, openAuth, updateUser } = useApp();
  const { toast } = useToast();
  const q = useQuery<Settings>({ queryKey: ["/api/me/settings", { u: String(user?.id ?? "") }], enabled: !!user, staleTime: 0 });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: async (b: Partial<Settings>) => (await apiRequest("PATCH", "/api/me/settings", b)).json(),
    onSuccess: (d: any) => { if (d.user) updateUser(d.user); invalidatePrefixes("/api/me/settings", "/api/readers", "/api/region", "/api/calendar", "/api/series"); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message }),
  });
  const setNotify = async (k: keyof NotifyPrefs, v: boolean) => {
    if (!form) return;
    if (k === "browser" && v) {
      if (typeof Notification === "undefined") { toast({ title: "Not supported", description: "This browser doesn't support notifications." }); return; }
      const p = await Notification.requestPermission();
      if (p !== "granted") { toast({ title: "Permission needed", description: "Allow notifications for this site in your browser settings." }); return; }
    }
    const notify = { ...form.notify, [k]: v };
    setForm({ ...form, notify }); save.mutate({ notify });
  };
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={SettingsIcon} kicker="Account" title="Settings" />
      {!user ? <div className="rounded-2xl border border-border bg-card p-4 text-sm">Sign in to change your profile, privacy and notifications. <button className="font-medium text-primary hover:underline" onClick={() => openAuth("login")}>Sign in</button></div> : !form ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : <>
        <section aria-labelledby="h-profile" className="rounded-2xl border border-border bg-card p-4">
          <h2 id="h-profile" className="mb-3 font-semibold">Profile</h2>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ displayName: form.displayName, bio: form.bio }, { onSuccess: () => toast({ title: "Profile saved" }) }); }}>
            <label className="block text-sm"><span className="mb-1 block font-medium">Display name</span><Input value={form.displayName} maxLength={40} onChange={(e) => setForm({ ...form, displayName: e.target.value })} data-testid="input-settings-name" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Bio</span><Textarea value={form.bio} maxLength={200} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save profile</Button>
          </form>
        </section>
        <section aria-labelledby="h-privacy" className="rounded-2xl border border-border bg-card">
          <h2 id="h-privacy" className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold"><Lock className="h-4 w-4 text-primary" />Privacy &amp; region</h2>
          <div className="divide-y divide-border">
            <Row id="s-private" label="Private profile" hint="Hide your shelves, badges and activity from other readers"><Switch id="s-private" checked={form.privateProfile} onCheckedChange={(c) => { setForm({ ...form, privateProfile: c }); save.mutate({ privateProfile: c }); }} data-testid="switch-private" /></Row>
            <Row id="s-country" label="Country" hint={`Used for regional availability and the release calendar${form.detectedCountry ? `. Detected: ${countryName(form.detectedCountry)}` : ""}`}>
              <select id="s-country" value={form.country ?? ""} onChange={(e) => { const c = e.target.value || null; setForm({ ...form, country: c }); save.mutate({ country: c }); }} className="max-w-[11rem] rounded-lg border border-border bg-background px-2 py-1.5 text-sm" data-testid="select-country">
                <option value="">Automatic</option>{COUNTRIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </Row>
          </div>
        </section>
        <section id="notifications" aria-labelledby="h-notify" className="rounded-2xl border border-border bg-card">
          <h2 id="h-notify" className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold"><Bell className="h-4 w-4 text-primary" />Notifications</h2>
          <div className="divide-y divide-border">
            {([["chapter", "New chapters", "From series and creators you follow"], ["reply", "Replies", "When someone replies to your comment"], ["follow", "New followers", ""], ["badge", "Achievements", "When you earn a badge"], ["system", "Announcements", "Platform news and account updates"], ["browser", "Browser notifications", "Show alerts on this device while MANGASALT is open in a tab"]] as const).map(([k, l, h]) => (
              <Row key={k} id={`n-${k}`} label={l} hint={h || undefined}><Switch id={`n-${k}`} checked={form.notify[k]} onCheckedChange={(c) => setNotify(k, c)} data-testid={`switch-notify-${k}`} /></Row>
            ))}
          </div>
        </section>
      </>}
      <AccessibilityCard />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Globe2 className="h-3.5 w-3.5" />Times on the calendar use your device's time zone unless you pick another one there.</p>
    </div>
  );
}
