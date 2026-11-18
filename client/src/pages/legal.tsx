import { useState, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import { Scale, ShieldCheck, FileText, Lock, Copyright as CopyrightIcon, BadgeCheck, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

const UPDATED = "17 November 2026";
const TABS = [
  ["", "Overview", Scale],
  ["licenses", "Licenses & credits", BadgeCheck],
  ["terms", "Terms of use", FileText],
  ["privacy", "Privacy", Lock],
  ["copyright", "Copyright & takedown", CopyrightIcon],
] as const;

function H({ children }: { children: ReactNode }) { return <h2 className="font-display mt-8 text-lg font-semibold first:mt-0">{children}</h2>; }
function P({ children }: { children: ReactNode }) { return <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>; }
function A({ href, children }: { href: string; children: ReactNode }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{children}</a>; }
function Li({ children }: { children: ReactNode }) { return <li className="flex gap-2 text-[15px] leading-relaxed text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" /><span>{children}</span></li>; }
function No({ children }: { children: ReactNode }) { return <li className="flex gap-2 text-[15px] leading-relaxed text-muted-foreground"><XCircle className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{children}</span></li>; }

function Overview() {
  return (
    <>
      <H>How MANGASALT stays legal</H>
      <P>MANGASALT is a discovery and community app. It does not copy, store or redistribute anyone else's manga. Every chapter you read comes from one of three places:</P>
      <ul className="mt-3 space-y-2">
        <Li><b className="text-foreground">Official publishers' own readers</b> (MANGA Plus by Shueisha, Tapas), shown inside the app exactly as the publisher serves them, with their ads, locks and coins intact.</Li>
        <Li><b className="text-foreground">Openly licensed comics</b> such as Pepper&amp;Carrot (CC BY 4.0), hosted with full credit.</Li>
        <Li><b className="text-foreground">Creators' own work</b>, uploaded through Creator Studio by people who confirm they own the rights.</Li>
      </ul>
      <H>What we never do</H>
      <ul className="mt-3 space-y-2">
        <No>Show fan scanlations or images taken from unofficial manga sites.</No>
        <No>Remove publisher paywalls, ads or "wait-free" timers.</No>
        <No>Show a chapter as readable here unless MANGASALT hosts it with the rights to distribute it.</No>
        <No>Sell access to catalogue data from AniList or MangaDex.</No>
      </ul>
      <H>Rights holders</H>
      <P>If you own a work and something on MANGASALT shouldn't be here, send a <Link href="/legal/copyright" className="font-medium text-primary hover:underline">takedown request</Link>. We remove it promptly.</P>
    </>
  );
}

function Licenses() {
  return (
    <>
      <H>The MANGASALT app</H>
      <P>The MANGASALT name, logo, design and source code are © 2026 MANGASALT. All rights reserved. They may not be copied or redistributed without written permission.</P>
      <H>Catalogue data · AniList</H>
      <P>Titles, covers, descriptions, genres and scores come from the <A href="https://anilist.co">AniList</A> API, used under the <A href="https://docs.anilist.co/guide/terms-of-use">AniList API Terms of Use</A>. Use is free for non-commercial apps and for commercial apps earning under $150 a month; above that, MANGASALT needs a commercial license from AniList. MANGASALT is not affiliated with AniList. Cover art and descriptions belong to their respective publishers and authors and are shown only to identify each title.</P>
      <H>Official chapter index · MangaDex</H>
      <P>Links to official publisher chapters (for example MANGA Plus) are found with the <A href="https://api.mangadex.org/docs/">MangaDex API</A>. Thanks to MangaDex. Under its policy MANGASALT runs no ads or paid services on top of MangaDex data. No MangaDex-hosted scans are shown.</P>
      <H>Publisher readers</H>
      <P>MANGA Plus chapters are © Shueisha and their creators. Tapas episodes are © their creators and Tapas Entertainment. Both are shown in each publisher's own reader. MANGASALT does not host their pages, and every view counts for the publisher.</P>
      <H>Pepper&amp;Carrot</H>
      <P>Pepper&amp;Carrot by <A href="https://www.peppercarrot.com">David Revoy</A> is licensed under <A href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</A>. It is hosted on MANGASALT unchanged apart from format conversion.</P>
      <H>Creator originals</H>
      <P>Creators keep full ownership of what they publish. By publishing, a creator gives MANGASALT a non-exclusive, worldwide, royalty-free license to host and display that work in the app until they delete it.</P>
      <H>Fonts &amp; libraries</H>
      <P>Clash Display and Switzer by <A href="https://www.fontshare.com">Indian Type Foundry (Fontshare)</A>, free for commercial use. Open-source libraries (React, Express, Tailwind CSS, Framer Motion, Lucide and others) are used under their MIT/ISC licenses.</P>
    </>
  );
}

function Terms() {
  return (
    <>
      <H>1. Using MANGASALT</H>
      <P>MANGASALT is free to use. You must be at least 13 years old (or the minimum age in your country) to create an account. Keep your password private. You're responsible for activity on your account.</P>
      <H>2. Your content</H>
      <P>You own the comments and comics you post. Only upload work you created or have written permission to publish. You may not upload anyone else's manga, scans, raws or translations, or any sexual content involving minors. Breaking this rule removes the content and can close your account.</P>
      <H>3. Community rules</H>
      <P>Be respectful. No harassment, hate speech, spam, or unmarked spoilers. Use the spoiler toggle and the report button. Moderators may remove comments that break these rules.</P>
      <H>4. Third-party readers</H>
      <P>Chapters from MANGA Plus and Tapas are provided by those publishers under their own terms. Unlocking paid or wait-free episodes happens with the publisher, not MANGASALT.</P>
      <H>5. Repeat infringers</H>
      <P>Accounts that receive repeated valid copyright complaints are closed.</P>
      <H>6. No warranty</H>
      <P>MANGASALT is provided "as is". Catalogue data and chapter availability come from third parties and may change or be wrong.</P>
      <H>7. Changes</H>
      <P>We may update these terms. Material changes will be shown in the app before they take effect.</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <H>What we store</H>
      <ul className="mt-3 space-y-2">
        <Li>Your account: display name, username and a salted password hash (never your plain password).</Li>
        <Li>Your activity: likes, saves, follows, comments, reading history and reading lists, so the app can show them back to you.</Li>
        <Li>Files you upload in Creator Studio.</Li>
      </ul>
      <H>What we don't do</H>
      <ul className="mt-3 space-y-2">
        <No>Sell or share your data with advertisers.</No>
        <No>Use tracking cookies of our own.</No>
      </ul>
      <H>Publisher readers</H>
      <P>When you open a chapter from MANGA Plus or Tapas, that publisher's page loads inside the app and may set its own cookies under its own privacy policy.</P>
      <H>Your choices</H>
      <P>You can delete your comments and creator uploads at any time. To delete your account and all its data, send a request through the <Link href="/legal/copyright" className="font-medium text-primary hover:underline">contact form</Link> using "Account deletion" as the work.</P>
    </>
  );
}

function Copyright() {
  const [f, setF] = useState({ name: "", email: "", ownerOf: "", target: "", details: "" });
  const [goodFaith, setGoodFaith] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setState("sending");
    try {
      await apiRequest("POST", "/api/legal/takedown", { ...f, goodFaith, accurate });
      setState("sent");
    } catch (x: any) { setErr(String(x?.message ?? "Something went wrong").replace(/^\d+:\s*/, "").replace(/^\{"message":"|"\}$/g, "")); setState("idle"); }
  };
  if (state === "sent") return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center" data-testid="text-takedown-sent">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
      <p className="mt-2 font-semibold">Request received</p>
      <p className="mt-1 text-sm text-muted-foreground">We'll review it and reply to {f.email}. Infringing content is removed as soon as it's confirmed.</p>
    </motion.div>
  );
  return (
    <>
      <H>Copyright policy</H>
      <P>MANGASALT respects creators' rights and responds to notices under the U.S. DMCA, India's Copyright Act 1957 and IT Rules 2021, and similar laws. Send a notice below if content on MANGASALT (a creator upload, a comment or a cover) infringes your copyright.</P>
      <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Full name<Input value={f.name} onChange={set("name")} required className="mt-1" data-testid="input-td-name" /></label>
          <label className="text-sm font-medium">Email<Input type="email" value={f.email} onChange={set("email")} required className="mt-1" data-testid="input-td-email" /></label>
        </div>
        <label className="block text-sm font-medium">Your copyrighted work<Input value={f.ownerOf} onChange={set("ownerOf")} required placeholder="e.g. My comic “Skybound”, chapters 1–4" className="mt-1" data-testid="input-td-work" /></label>
        <label className="block text-sm font-medium">Where it appears on MANGASALT<Input value={f.target} onChange={set("target")} required placeholder="Page link or series name" className="mt-1" data-testid="input-td-target" /></label>
        <label className="block text-sm font-medium">Details<Textarea value={f.details} onChange={set("details")} required rows={4} placeholder="Explain what is infringing and how you own the rights." className="mt-1" data-testid="input-td-details" /></label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-td-goodfaith" />I believe in good faith that this use is not authorised by the copyright owner, its agent, or the law.</label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-td-accurate" />The information in this notice is accurate, and I am the owner or authorised to act for the owner.</label>
        {err && <p className="text-sm text-destructive" data-testid="text-td-error">{err}</p>}
        <Button type="submit" disabled={state === "sending"} className="w-full rounded-full sm:w-auto" data-testid="button-td-submit">{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send takedown request"}</Button>
      </form>
    </>
  );
}

export default function Legal() {
  const { section = "" } = useParams<{ section?: string }>();
  const body = { "": <Overview />, licenses: <Licenses />, terms: <Terms />, privacy: <Privacy />, copyright: <Copyright /> }[section] ?? <Overview />;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-4 sm:px-6">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="h-3.5 w-3.5" />Legal</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Licenses &amp; policies</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated {UPDATED}</p>
      <nav className="no-scrollbar -mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Legal sections">
        {TABS.map(([k, l, Icon]) => (
          <Link key={k} href={k ? `/legal/${k}` : "/legal"} data-testid={`tab-legal-${k || "overview"}`}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${section === k ? "border-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {section === k && <motion.span layoutId="legal-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon className="relative h-3.5 w-3.5" /><span className="relative">{l}</span>
          </Link>
        ))}
      </nav>
      <motion.article key={section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6">{body}</motion.article>
    </div>
  );
}
