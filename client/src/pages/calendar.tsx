import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Globe2, List, LayoutGrid, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead, EmptyBox, asset } from "@/components/shared";
import { useApp, TYPE_LABEL } from "@/lib/app-context";
import { countryName, type CalendarEvent } from "@shared/platform";

const ZONES: [string, string][] = [["Asia/Kolkata", "India (IST)"], ["Asia/Tokyo", "Tokyo (JST)"], ["Asia/Seoul", "Seoul (KST)"], ["Asia/Shanghai", "Shanghai (CST)"], ["America/New_York", "New York (ET)"], ["Europe/London", "London (UK)"], ["UTC", "UTC"]];
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
const ymd = (t: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

export default function CalendarPage() {
  const { user } = useApp();
  const [tz, setTz] = useState(() => (ZONES.some(([z]) => z === localZone()) ? localZone() : "Asia/Kolkata"));
  const [view, setView] = useState<"list" | "month">("list");
  const [mine, setMine] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });
  const m0 = new Date(month);
  const from = new Date(m0.getFullYear(), m0.getMonth(), 1).getTime() - 7 * 864e5;
  const to = new Date(m0.getFullYear(), m0.getMonth() + 1, 1).getTime() + 7 * 864e5;
  const q = useQuery<CalendarEvent[]>({ queryKey: ["/api/calendar", { from: String(from), to: String(to), u: String(user?.id ?? "") }] });
  const region = useQuery<{ country: string | null }>({ queryKey: ["/api/region", { u: String(user?.id ?? "") }] });
  const events = (q.data ?? []).filter((e) => !mine || e.mine);
  const byDay = useMemo(() => { const m = new Map<string, CalendarEvent[]>(); for (const e of events) { const k = ymd(e.at, tz); m.set(k, [...(m.get(k) ?? []), e]); } return m; }, [events, tz]);
  const fmtTime = (t: number) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(t));
  const fmtDay = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const today = ymd(Date.now(), tz);
  const monthLabel = m0.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth(new Date(m0.getFullYear(), m0.getMonth() + n, 1).getTime());
  // month grid
  const first = new Date(m0.getFullYear(), m0.getMonth(), 1), days = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + days) / 7) * 7 }, (_, i) => { const d = i - first.getDay() + 1; return d >= 1 && d <= days ? `${m0.getFullYear()}-${String(m0.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; });
  const monthKeys = Array.from(byDay.keys()).filter((k) => k.startsWith(`${m0.getFullYear()}-${String(m0.getMonth() + 1).padStart(2, "0")}`)).sort();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-6">
      <PageHead icon={CalendarDays} kicker="Releases" title="International release calendar" sub="New and scheduled chapters from MANGASALT creators and official English publishers, shown in your time zone." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          <button onClick={() => shift(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[9rem] text-center text-sm font-semibold" aria-live="polite">{monthLabel}</span>
          <button onClick={() => shift(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex rounded-full border border-border bg-card p-1" role="group" aria-label="View">
          <button aria-pressed={view === "list"} onClick={() => setView("list")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${view === "list" ? "bg-primary text-primary-foreground" : ""}`}><List className="h-3.5 w-3.5" />List</button>
          <button aria-pressed={view === "month"} onClick={() => setView("month")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${view === "month" ? "bg-primary text-primary-foreground" : ""}`}><LayoutGrid className="h-3.5 w-3.5" />Month</button>
        </div>
        {user && <button aria-pressed={mine} onClick={() => setMine(!mine)} className={`rounded-full border px-3 py-1.5 text-sm ${mine ? "border-primary bg-primary/15 text-primary" : "border-border"}`} data-testid="button-calendar-mine">My titles</button>}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"><Globe2 className="h-4 w-4" /><span className="sr-only">Time zone</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground" data-testid="select-timezone">
            {!ZONES.some(([z]) => z === tz) && <option value={tz}>{tz}</option>}
            {ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
          </select>
        </label>
      </div>
      {region.data?.country && <p className="mb-4 text-xs text-muted-foreground">Showing what's available in {countryName(region.data.country)}. <Link href="/settings" className="text-primary hover:underline">Change country</Link></p>}

      {q.isLoading ? <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : q.error ? <EmptyBox>The calendar couldn't load right now. Try again in a minute.</EmptyBox>
        : view === "month" ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-7 bg-card text-center text-[11px] font-semibold uppercase text-muted-foreground" aria-hidden>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((k, i) => { const ev = k ? byDay.get(k) ?? [] : []; return (
                <div key={i} className={`min-h-[84px] border-t border-border p-1.5 ${i % 7 ? "border-l" : ""} ${k === today ? "bg-primary/[0.07]" : ""}`} aria-label={k ? `${fmtDay(k)}, ${ev.length} releases` : undefined}>
                  {k && <span className={`text-xs ${k === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{Number(k.slice(8))}</span>}
                  <ul className="mt-1 space-y-0.5">{ev.slice(0, 3).map((e) => <li key={e.id}><Link href={e.href} className={`block truncate rounded px-1 py-0.5 text-[11px] ${e.source === "mangasalt" ? "bg-primary/15 text-primary" : "bg-secondary"} ${e.upcoming ? "italic" : ""}`} title={`${e.title} · ${e.chapter}`}>{e.title}</Link></li>)}{ev.length > 3 && <li className="px-1 text-[10px] text-muted-foreground">+{ev.length - 3} more</li>}</ul>
                </div>
              ); })}
            </div>
          </div>
        ) : !monthKeys.length ? <EmptyBox>No releases {mine ? "for your titles " : ""}this month.</EmptyBox> : (
          <div className="space-y-6">
            {monthKeys.map((k) => (
              <section key={k} aria-label={fmtDay(k)}>
                <h2 className={`mb-2 text-sm font-semibold ${k === today ? "text-primary" : ""}`}>{k === today ? "Today · " : ""}{fmtDay(k)}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {byDay.get(k)!.sort((a, b) => a.at - b.at).map((e) => (
                    <li key={e.id}><Link href={e.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 transition hover:border-primary/40" data-testid={`row-release-${e.id}`}>
                      <img src={asset(e.cover)} alt="" className="h-16 w-11 shrink-0 rounded-md object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.chapter} · {TYPE_LABEL[e.type] ?? e.type} · {e.origin}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{e.publisher} · {e.regions}</p>
                      </div>
                      <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{fmtTime(e.at)}</p><p className={`text-[10px] font-semibold uppercase ${e.upcoming ? "text-primary" : "text-emerald-500"}`}>{e.upcoming ? "Upcoming" : "Out now"}</p></div>
                    </Link></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
