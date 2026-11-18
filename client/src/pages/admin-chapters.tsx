// Admin: chapter management for hosted (authorised) series.
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Eye, Trash2, Search, Upload, EyeOff, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { useApp } from "@/lib/app-context";
import { asset } from "@/components/shared";
import { isAdmin } from "@shared/platform";
import { CHAPTER_KINDS, KIND_LABEL, chapterLabel, fmtNum, type ChapterKind } from "@shared/chapters";
import { PageUploader, type Pg } from "@/pages/studio";
import { ImportChaptersDialog } from "@/components/import-chapters";
import { Switch } from "@/components/ui/switch";
import { queryClient } from "@/lib/queryClient";

type AdminSeries = { id: number; slug: string; title: string; type: string; cover: string; rights: string; rightsNote: string; anilistId: number | null; approval: string; removed: boolean; creator: string; chapters: number; published: number };
type AdminChapter = { id: number; seriesId: number; number: number; numbered: boolean; kind: ChapterKind; title: string; language: string; releaseAt: number; published: boolean; approval: string; status: string; pageCount: number; pages: string[]; updatedAt: number };

const LANGS: [string, string][] = [["en", "English"], ["es", "Spanish"], ["fr", "French"], ["pt", "Portuguese"], ["de", "German"], ["id", "Indonesian"], ["it", "Italian"], ["hi", "Hindi"], ["ta", "Tamil"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"]];
const STATUS_TONE: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  draft: "bg-secondary text-muted-foreground", no_pages: "bg-amber-500/15 text-amber-700 dark:text-amber-300", pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300", rejected: "bg-primary/15 text-primary",
};
const STATUS_TEXT: Record<string, string> = { published: "Published", scheduled: "Scheduled", draft: "Draft", no_pages: "No pages", pending: "In review", rejected: "Rejected" };
const RIGHTS: [string, string][] = [["original", "Creator's own work"], ["licensed", "Licensed to MANGASALT"], ["open", "Open licence (e.g. CC BY)"]];
const toLocal = (t: number) => { const d = new Date(t - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export default function ChaptersTab() {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const list = useQuery<AdminSeries[]>({ queryKey: ["/api/admin/content/series", { q }], staleTime: 0 });
  useEffect(() => { if (sel == null && list.data?.length) setSel(list.data[0].id); }, [list.data, sel]);
  return (
    <div className="space-y-4">
    <ReadingMode canEdit={isAdmin(user)} />
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <section className="rounded-2xl border border-border bg-card p-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find hosted series" aria-label="Find hosted series" className="rounded-full pl-9" data-testid="input-content-search" /></div>
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
          {list.isLoading && <li className="p-3 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading</li>}
          {list.data?.map((s) => (
            <li key={s.id}><button onClick={() => setSel(s.id)} className={`flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm ${sel === s.id ? "bg-primary/15" : "hover:bg-accent"}`} data-testid={`button-content-series-${s.id}`}>
              <img src={asset(s.cover)} alt="" className="h-10 w-7 rounded object-cover" />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.title}</span><span className="text-xs text-muted-foreground">{s.published}/{s.chapters} readable{s.removed ? " · taken down" : ""}</span></span>
            </button></li>
          ))}
          {list.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No hosted series match.</li>}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">New hosted series are created in <Link href="/studio/new" className="text-primary underline-offset-2 hover:underline">Creator Studio</Link>, then managed here.</p>
      </section>
      {sel != null ? <SeriesChapters id={sel} canEdit={isAdmin(user)} /> : <p className="p-6 text-sm text-muted-foreground">Pick a series.</p>}
    </div>
    </div>
  );
}

/** In-app only reading mode: list only titles MANGASALT hosts, with no outside reading links. */
function ReadingMode({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const q = useQuery<{ inAppOnly: boolean }>({ queryKey: ["/api/admin/settings/reading"], staleTime: 0 });
  const m = useMutation({
    mutationFn: async (on: boolean) => (await apiRequest("PUT", "/api/admin/settings/reading", { inAppOnly: on })).json(),
    onSuccess: (d: { inAppOnly: boolean }) => {
      queryClient.invalidateQueries(); toast({ title: d.inAppOnly ? "In-app only reading is on" : "Worldwide catalogue is on" });
    },
    onError: (e: Error) => toast({ title: "Couldn't change reading mode", description: e.message }),
  });
  const on = q.data?.inAppOnly ?? true;
  return (
    <section className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-4" data-testid="card-reading-mode">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">In-app only reading</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{on
          ? "On. Home, search, trending and title pages show only series hosted on MANGASALT. No publisher links or outside readers are shown."
          : "Off. The worldwide catalogue (AniList and MangaDex) is listed too, with links to official publishers for chapters MANGASALT doesn't host."}</p>
      </div>
      <Switch checked={on} disabled={!canEdit || q.isLoading || m.isPending} onCheckedChange={(v) => m.mutate(v)} aria-label="In-app only reading" data-testid="switch-in-app-only" />
    </section>
  );
}

function SeriesChapters({ id, canEdit }: { id: number; canEdit: boolean }) {
  const { toast } = useToast();
  const q = useQuery<{ series: AdminSeries; chapters: AdminChapter[] }>({ queryKey: [`/api/admin/content/series/${id}/chapters`], staleTime: 0 });
  const [edit, setEdit] = useState<AdminChapter | "new" | null>(null);
  const [del, setDel] = useState<AdminChapter | null>(null);
  const [imp, setImp] = useState(false);
  const act = useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: any; ok?: string }) => (await apiRequest(method, url, body)).json(),
    onSuccess: (_d, v) => { invalidatePrefixes("/api/admin/content", "/api/series", "/api/world/title", "/api/chapters"); if (v.ok) toast({ title: v.ok }); },
    onError: (e: Error) => toast({ title: "Action failed", description: e.message }),
  });
  if (q.isLoading || !q.data) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const { series: s, chapters } = q.data;
  return (
    <div className="min-w-0 space-y-4">
      <SeriesRights s={s} canEdit={canEdit} />
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Chapters · {chapters.length}</h3>
          {canEdit && <div className="flex gap-2"><Button size="sm" variant="secondary" className="gap-1 rounded-full" onClick={() => setImp(true)} data-testid="button-import-chapters"><Upload className="h-4 w-4" />Import ZIP / PDF</Button><Button size="sm" className="gap-1 rounded-full" onClick={() => setEdit("new")} data-testid="button-new-chapter"><Plus className="h-4 w-4" />New chapter</Button></div>}
        </div>
        {!chapters.length ? <p className="py-6 text-center text-sm text-muted-foreground">No chapters yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 pr-2">Chapter</th><th className="pr-2">Title</th><th className="pr-2">Lang</th><th className="pr-2">Status</th><th className="pr-2">Pages</th><th className="pr-2">Release</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {chapters.map((c) => (
                  <tr key={c.id} className="border-t border-border/60" data-testid={`row-admin-chapter-${c.id}`}>
                    <td className="py-2 pr-2 font-medium">{chapterLabel({ kind: c.kind, number: c.numbered ? fmtNum(c.number) : null })}{!c.numbered && <span className="ml-1 text-xs text-muted-foreground">(#{fmtNum(c.number)})</span>}</td>
                    <td className="max-w-[180px] truncate pr-2">{c.title || <span className="text-muted-foreground">–</span>}</td>
                    <td className="pr-2 uppercase">{c.language}</td>
                    <td className="pr-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[c.status] ?? STATUS_TONE.draft}`} data-testid={`status-admin-chapter-${c.id}`}>{STATUS_TEXT[c.status] ?? c.status}</span></td>
                    <td className="pr-2 tabular-nums">{c.pageCount}</td>
                    <td className="pr-2 text-xs text-muted-foreground">{c.releaseAt > 0 ? new Date(c.releaseAt).toLocaleDateString() : "Immediately"}</td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/read/${c.id}`} className="inline-grid h-8 w-8 place-items-center rounded-full hover:bg-accent" aria-label="Preview" data-testid={`button-preview-${c.id}`}><Eye className="h-4 w-4" /></Link>
                      {canEdit && <>
                        <button className="inline-grid h-8 w-8 place-items-center rounded-full hover:bg-accent" aria-label="Edit" onClick={() => setEdit(c)} data-testid={`button-edit-chapter-${c.id}`}><Pencil className="h-4 w-4" /></button>
                        {c.published
                          ? <button className="inline-grid h-8 w-8 place-items-center rounded-full hover:bg-accent" aria-label="Unpublish" onClick={() => act.mutate({ method: "PATCH", url: `/api/admin/content/chapters/${c.id}`, body: { published: false }, ok: "Chapter unpublished" })} data-testid={`button-unpublish-${c.id}`}><EyeOff className="h-4 w-4" /></button>
                          : <button className="inline-grid h-8 w-8 place-items-center rounded-full text-primary hover:bg-accent disabled:opacity-30" disabled={!c.pageCount} aria-label="Publish" onClick={() => setEdit(c)} data-testid={`button-publish-${c.id}`}><Upload className="h-4 w-4" /></button>}
                        <button className="inline-grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive" aria-label="Delete" onClick={() => setDel(c)} data-testid={`button-delete-chapter-${c.id}`}><Trash2 className="h-4 w-4" /></button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {edit && <ChapterEditor seriesId={s.id} c={edit === "new" ? null : edit} nextNumber={Math.floor(Math.max(0, ...chapters.filter((c) => c.kind === "regular").map((c) => c.number))) + 1} onClose={() => setEdit(null)} />}
      {imp && <ImportChaptersDialog endpoint={`/api/admin/content/series/${s.id}/import`} mode="admin" onClose={() => setImp(false)} />}
      <DeleteDialog c={del} onClose={() => setDel(null)} onDelete={(c, confirm) => act.mutate({ method: "DELETE", url: `/api/admin/content/chapters/${c.id}`, body: { confirm }, ok: "Chapter deleted" }, { onSuccess: () => setDel(null) })} />
    </div>
  );
}

function SeriesRights({ s, canEdit }: { s: AdminSeries; canEdit: boolean }) {
  const { toast } = useToast();
  const [v, setV] = useState({ anilistId: s.anilistId ? String(s.anilistId) : "", rights: s.rights, rightsNote: s.rightsNote });
  useEffect(() => setV({ anilistId: s.anilistId ? String(s.anilistId) : "", rights: s.rights, rightsNote: s.rightsNote }), [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/admin/content/series/${s.id}`, { anilistId: v.anilistId.trim() || null, rights: v.rights, rightsNote: v.rightsNote })).json(),
    onSuccess: () => { invalidatePrefixes("/api/admin/content", "/api/world/title"); toast({ title: "Distribution details saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message }),
  });
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <img src={asset(s.cover)} alt="" className="h-20 w-14 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold">{s.title}</h3>
          <p className="text-xs text-muted-foreground">by @{s.creator} · {s.approval}{s.removed ? " · taken down" : ""} · <Link href={`/series/${s.slug}`} className="text-primary hover:underline">View page</Link></p>
        </div>
      </div>
      <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="text-xs font-medium">Distribution rights
          <select disabled={!canEdit} value={v.rights} onChange={(e) => setV({ ...v, rights: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" data-testid="select-series-rights">{RIGHTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-xs font-medium"><span className="flex items-center gap-1"><Link2 className="h-3 w-3" />Catalogue (AniList) ID</span>
          <Input disabled={!canEdit} inputMode="numeric" value={v.anilistId} onChange={(e) => setV({ ...v, anilistId: e.target.value.replace(/\D/g, "") })} placeholder="Optional, e.g. 30013" className="mt-1 h-9" data-testid="input-series-anilist" /></label>
        <label className="text-xs font-medium sm:col-span-2">Permission evidence (staff only)
          <Textarea disabled={!canEdit} value={v.rightsNote} onChange={(e) => setV({ ...v, rightsNote: e.target.value })} maxLength={1000} placeholder="Licence, contract reference or URL proving MANGASALT may distribute this work" className="mt-1 min-h-[60px]" /></label>
        {canEdit && <div className="sm:col-span-2"><Button type="submit" size="sm" className="rounded-full" disabled={save.isPending}>Save distribution details</Button></div>}
      </form>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />Linking an AniList ID makes this series' published chapters readable from that catalogue title's page.</p>
    </section>
  );
}

function ChapterEditor({ seriesId, c, nextNumber, onClose }: { seriesId: number; c: AdminChapter | null; nextNumber: number; onClose: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ number: c ? fmtNum(c.number) : String(nextNumber), kind: (c?.kind ?? "regular") as ChapterKind, numbered: c?.numbered ?? true, title: c?.title ?? "", language: c?.language ?? "en", releaseAt: toLocal(c?.releaseAt || Date.now()) });
  const [pages, setPages] = useState<Pg[]>(() => (c?.pages ?? []).map((p, i) => ({ key: `e${i}-${p}`, path: p, preview: asset(p), status: "done" as const })));
  const [rights, setRights] = useState(false);
  const uploading = pages.some((p) => p.status === "uploading"), failed = pages.some((p) => p.status === "error");
  const m = useMutation({
    mutationFn: async (publish: boolean) => {
      const body: any = { number: f.number, kind: f.kind, numbered: f.kind === "regular" ? true : f.numbered, title: f.title, language: f.language, releaseAt: new Date(f.releaseAt).getTime(), pages: pages.map((p) => p.path), rightsConfirmed: rights };
      if (c) { if (publish || c.published) body.published = publish ? true : c.published; return (await apiRequest("PATCH", `/api/admin/content/chapters/${c.id}`, body)).json(); }
      return (await apiRequest("POST", `/api/admin/content/series/${seriesId}/chapters`, { ...body, publish })).json();
    },
    onSuccess: (_d, publish) => { invalidatePrefixes("/api/admin/content", "/api/series", "/api/world/title", "/api/chapters"); toast({ title: publish ? "Chapter published" : "Chapter saved" }); onClose(); },
    onError: (e: Error) => toast({ title: "Couldn't save chapter", description: e.message }),
  });
  const needsRights = !c || !c.published;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>{c ? `Edit ${chapterLabel({ kind: c.kind, number: c.numbered ? fmtNum(c.number) : null })}` : "New chapter"}</DialogTitle>
        <DialogDescription>Only upload pages MANGASALT has permission to distribute. Drafts stay hidden until published.</DialogDescription>
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs font-medium">Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ChapterKind })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" data-testid="select-chapter-kind">{CHAPTER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
            <label className="text-xs font-medium">{f.kind === "regular" || f.numbered ? "Number" : "Reading order"}<Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="e.g. 12 or 12.5" className="mt-1 h-9" data-testid="input-chapter-number" /></label>
            <label className="text-xs font-medium">Language<select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" data-testid="select-chapter-lang">{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          {f.kind !== "regular" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.numbered} onChange={(e) => setF({ ...f, numbered: e.target.checked })} />Show the number in the label ({KIND_LABEL[f.kind]} {f.number || "1"})</label>}
          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <label className="text-xs font-medium">Title<Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} placeholder="Optional" className="mt-1 h-9" data-testid="input-chapter-title" /></label>
            <label className="text-xs font-medium">Release date<Input type="datetime-local" value={f.releaseAt} onChange={(e) => setF({ ...f, releaseAt: e.target.value })} className="mt-1 h-9" data-testid="input-chapter-release" /></label>
          </div>
          <div><p className="mb-1 text-xs font-medium">Pages · {pages.length}</p><PageUploader pages={pages} setPages={setPages} /></div>
          {needsRights && <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" data-testid="checkbox-chapter-rights" />I confirm MANGASALT has the right to distribute these pages (creator's own work, a licence, or an open licence recorded on the series).</label>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="secondary" className="rounded-full" disabled={m.isPending || uploading || failed || (!c && !rights)} onClick={() => m.mutate(false)} data-testid="button-save-chapter">{c?.published ? "Save changes" : "Save draft"}</Button>
            {!c?.published && <Button type="button" className="rounded-full" disabled={m.isPending || uploading || failed || !pages.length || !rights} onClick={() => m.mutate(true)} data-testid="button-publish-chapter">Save and publish</Button>}
          </div>
          {(uploading || failed) && <p className="text-right text-xs text-muted-foreground">{uploading ? "Waiting for uploads to finish…" : "Remove the pages that failed to upload first."}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ c, onClose, onDelete }: { c: AdminChapter | null; onClose: () => void; onDelete: (c: AdminChapter, confirm: string) => void }) {
  const [t, setT] = useState("");
  useEffect(() => setT(""), [c]);
  const want = c ? `delete ${fmtNum(c.number)}` : "";
  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Delete this chapter?</DialogTitle>
        <DialogDescription>This removes its pages, bookmarks and reading positions. Readers' history keeps the series. This can't be undone.</DialogDescription>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (c && t === want) onDelete(c, t); }}>
          <label className="text-sm">Type <code className="rounded bg-muted px-1">{want}</code> to confirm<Input autoFocus value={t} onChange={(e) => setT(e.target.value)} className="mt-1" data-testid="input-delete-confirm" /></label>
          <Button type="submit" variant="destructive" className="w-full rounded-full" disabled={t !== want} data-testid="button-confirm-delete">Delete chapter</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
