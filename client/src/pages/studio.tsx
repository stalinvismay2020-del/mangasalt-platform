import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PenTool, Plus, Loader2, Upload, Trash2, ArrowUp, ArrowDown, ImagePlus, Eye, EyeOff, ArrowLeft, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useApp, timeAgo } from "@/lib/app-context";
import { supabase, pageUrl, errMsg } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { prepareImage, uploadData } from "@/lib/upload";
import { formatNumber } from "@/lib/chapter-search";
import { PageHead, Cover, EmptyBox, InlineError, SignInPrompt } from "@/components/shared";
import { RIGHTS_LABEL } from "@/pages/series";

type SeriesRow = {
  id: string; slug: string; title: string; kind: string; synopsis: string; author: string; artist: string; genres: string[]; status: string;
  rights: string; attribution: string; license_url: string | null; copyright_notice: string; cover_path: string | null; published: boolean; taken_down: boolean; takedown_reason: string; updated_at: string;
};
type ChapterRow = { id: string; series_id: string; number: number; title: string; pages: string[]; published: boolean; published_at: string | null; updated_at: string };

const KINDS = ["manga", "manhwa", "manhua", "webcomic"];
const STATUSES = ["ongoing", "completed", "hiatus"];
const RIGHTS = ["owner", "licensed", "cc-by", "cc-by-sa", "public-domain"];
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);
const refresh = () => ["studio", "hosted", "hosted-chapters", "admin"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

function check<T>(r: { data: T; error: any }): T { if (r.error) throw new Error(errMsg(r.error)); return r.data; }

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useApp();
  const { toast } = useToast();
  const [msg, setMsg] = useState("");
  const req = useQuery({ queryKey: ["studio", "request", user?.id], queryFn: async () => check(await supabase.from("creator_requests").select("*").eq("user_id", user!.id).maybeSingle()), enabled: !!user && !user.role });
  const send = useMutation({
    mutationFn: async () => check(await supabase.rpc("request_creator", { p_message: msg.trim().slice(0, 1000) })),
    onSuccess: () => { req.refetch(); toast({ title: "Request sent", description: "An admin will review it." }); },
    onError: (e) => toast({ title: "Request not sent", description: errMsg(e), variant: "destructive" }),
  });
  if (!ready) return null;
  if (!user) return <div className="mx-auto max-w-3xl px-4 py-6"><PageHead icon={PenTool} kicker="Creators" title="Creator studio" /><SignInPrompt what="publish your own series on MANGASALT" /></div>;
  if (user.banned) return <div className="mx-auto max-w-3xl px-4 py-6"><EmptyBox>Your account is suspended from publishing.</EmptyBox></div>;
  if (user.role) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageHead icon={PenTool} kicker="Creators" title="Publish on MANGASALT" sub="Creator accounts can upload series they own or are licensed to publish." />
      {req.isLoading ? <div className="shimmer relative h-24 overflow-hidden rounded-2xl bg-muted" /> : req.data?.status === "pending" ? (
        <EmptyBox>Your creator request was sent {timeAgo(req.data.created_at)} and is waiting for review.</EmptyBox>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-3 rounded-3xl border border-border bg-card/50 p-4">
          {req.data?.status === "rejected" && <p className="text-sm text-destructive">Your previous request wasn't approved. You can send a new one.</p>}
          <label htmlFor="cr" className="text-sm font-medium">Tell us about your work and your rights to publish it</label>
          <Textarea id="cr" value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="e.g. I'm the author of … and want to publish it here." data-testid="input-creator-request" />
          <Button type="submit" className="rounded-full" disabled={send.isPending || msg.trim().length < 10} data-testid="button-request-creator">{send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request creator access</Button>
        </form>
      )}
    </div>
  );
}

export function StudioHome() {
  const { user } = useApp();
  const q = useQuery({
    queryKey: ["studio", "mine", user?.id],
    queryFn: async () => check(await supabase.from("hosted_series").select("id,slug,title,kind,cover_path,published,taken_down,updated_at,hosted_chapters(count)").eq("owner_visitor", user!.id).order("updated_at", { ascending: false })) as any[],
    enabled: !!user?.role,
  });
  return (
    <Gate>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <PageHead icon={PenTool} kicker="Creators" title="Creator studio" sub="Your series, drafts and chapters." action={<Link href="/studio/new"><Button className="gap-2 rounded-full" data-testid="button-new-series"><Plus className="h-4 w-4" />New series</Button></Link>} />
        {q.error ? <InlineError error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <div className="shimmer relative h-28 overflow-hidden rounded-2xl bg-muted" />
          : !q.data?.length ? <EmptyBox action={<Link href="/studio/new" className="text-sm font-medium text-primary">Create your first series</Link>}>You haven't created a series yet.</EmptyBox>
          : (
            <ul className="grid gap-3 sm:grid-cols-2" data-testid="list-my-series">
              {q.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/studio/series/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-3 hover:border-primary/50" data-testid={`link-studio-${s.slug}`}>
                    <Cover src={pageUrl(s.cover_path)} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.hosted_chapters?.[0]?.count ?? 0} chapters · updated {timeAgo(s.updated_at)}</p>
                      <p className="mt-1 text-xs">{s.taken_down ? <span className="text-destructive">Taken down</span> : s.published ? <span className="text-emerald-500">Published</span> : <span className="text-muted-foreground">Draft</span>}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Gate>
  );
}

type Fields = Omit<SeriesRow, "id" | "taken_down" | "takedown_reason" | "updated_at"> & { genresText: string };
const EMPTY: Fields = { slug: "", title: "", kind: "manhwa", synopsis: "", author: "", artist: "", genres: [], genresText: "", status: "ongoing", rights: "owner", attribution: "", license_url: "", copyright_notice: "", cover_path: null, published: false };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="text-xs font-semibold text-muted-foreground">{label}</span><div className="mt-1">{children}</div>{hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}</label>;
}
function Select({ value, onChange, options, labels, testid }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>; testid: string }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid={testid}>{options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
}

function SeriesForm({ v, set }: { v: Fields; set: (p: Partial<Fields>) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const [d] = await prepareImage(f, { maxW: 800, split: false }); set({ cover_path: await uploadData(d, "covers") }); }
    catch (e) { toast({ title: "Cover not uploaded", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
      <div>
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-dashed border-border bg-muted">
          {v.cover_path ? <img src={pageUrl(v.cover_path)!} alt="Cover preview" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">No cover</div>}
          {busy && <div className="absolute inset-0 grid place-items-center bg-background/70"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        </div>
        <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent" data-testid="button-upload-cover"><ImagePlus className="h-3.5 w-3.5" />{v.cover_path ? "Change cover" : "Upload cover"}<input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} /></label>
      </div>
      <div className="grid gap-3">
        <Field label="Title"><Input value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} data-testid="input-series-title" /></Field>
        <Field label="URL slug" hint={`mangasalt…/#/series/${v.slug || "your-series"}`}><Input value={v.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} data-testid="input-series-slug" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format"><Select value={v.kind} onChange={(kind) => set({ kind })} options={KINDS} testid="select-kind" /></Field>
          <Field label="Status"><Select value={v.status} onChange={(status) => set({ status })} options={STATUSES} testid="select-status" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Author"><Input value={v.author} onChange={(e) => set({ author: e.target.value })} data-testid="input-author" /></Field>
          <Field label="Artist"><Input value={v.artist} onChange={(e) => set({ artist: e.target.value })} data-testid="input-artist" /></Field>
        </div>
        <Field label="Synopsis"><Textarea value={v.synopsis} onChange={(e) => set({ synopsis: e.target.value })} rows={4} data-testid="input-synopsis" /></Field>
        <Field label="Genres" hint="Comma separated, e.g. Fantasy, Comedy"><Input value={v.genresText} onChange={(e) => set({ genresText: e.target.value })} data-testid="input-genres" /></Field>
        <Field label="Your rights to publish"><Select value={v.rights} onChange={(rights) => set({ rights })} options={RIGHTS} labels={RIGHTS_LABEL} testid="select-rights" /></Field>
        <Field label="Attribution / credits"><Input value={v.attribution} onChange={(e) => set({ attribution: e.target.value })} data-testid="input-attribution" /></Field>
        {v.rights !== "owner" && <Field label="Licence URL"><Input value={v.license_url ?? ""} onChange={(e) => set({ license_url: e.target.value })} type="url" data-testid="input-license" /></Field>}
        <Field label="Copyright notice"><Input value={v.copyright_notice} onChange={(e) => set({ copyright_notice: e.target.value })} data-testid="input-copyright" /></Field>
        <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm"><span><span className="font-medium">Published</span><span className="block text-xs text-muted-foreground">Visible to everyone when on.</span></span><Switch checked={v.published} onCheckedChange={(published) => set({ published })} data-testid="switch-published" /></label>
      </div>
    </div>
  );
}

const toRow = (v: Fields) => ({
  slug: v.slug, title: v.title.trim(), kind: v.kind, synopsis: v.synopsis.trim(), author: v.author.trim(), artist: v.artist.trim(),
  genres: v.genresText.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12), status: v.status, rights: v.rights, attribution: v.attribution.trim(),
  license_url: v.license_url?.trim() || null, copyright_notice: v.copyright_notice.trim(), cover_path: v.cover_path, published: v.published,
});
const validate = (v: Fields) => {
  if (v.title.trim().length < 2) throw new Error("Add a title.");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) throw new Error("The URL slug can use lowercase letters, numbers and dashes.");
  if (!v.author.trim()) throw new Error("Add the author's name.");
};

export function StudioNew() {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const { user } = useApp();
  const [v, setV] = useState<Fields>(EMPTY);
  const set = (p: Partial<Fields>) => setV((cur) => { const n = { ...cur, ...p }; if (p.title !== undefined && (!cur.slug || cur.slug === slugify(cur.title))) n.slug = slugify(p.title); return n; });
  const m = useMutation({
    mutationFn: async () => { validate(v); return check(await supabase.from("hosted_series").insert({ ...toRow(v), owner_visitor: user!.id }).select("id").single()) as { id: string }; },
    onSuccess: (r) => { refresh(); toast({ title: "Series created" }); nav(`/studio/series/${r.id}`); },
    onError: (e) => toast({ title: "Series not created", description: /duplicate|unique/i.test(errMsg(e)) ? "That URL slug is taken. Pick another." : errMsg(e), variant: "destructive" }),
  });
  return (
    <Gate>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link href="/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Studio</Link>
        <PageHead icon={Plus} kicker="Creators" title="New series" />
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="rounded-3xl border border-border bg-card/50 p-4 sm:p-5">
          <SeriesForm v={v} set={set} />
          <Button type="submit" className="mt-5 rounded-full" disabled={m.isPending} data-testid="button-create-series">{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create series</Button>
        </form>
      </div>
    </Gate>
  );
}

export function StudioSeries({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const s = useQuery({ queryKey: ["studio", "series", params.id], queryFn: async () => check(await supabase.from("hosted_series").select("*").eq("id", params.id).maybeSingle()) as SeriesRow | null });
  const ch = useQuery({ queryKey: ["studio", "chapters", params.id], queryFn: async () => (check(await supabase.from("hosted_chapters").select("*").eq("series_id", params.id).order("number")) as any[]).map((c) => ({ ...c, number: Number(c.number) })) as ChapterRow[] });
  const [v, setV] = useState<Fields | null>(null);
  const [editing, setEditing] = useState<ChapterRow | "new" | null>(null);
  const [confirmCh, setConfirmCh] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { if (s.data) setV({ ...s.data, license_url: s.data.license_url ?? "", genresText: s.data.genres.join(", ") }); }, [s.data]);
  const save = useMutation({
    mutationFn: async () => { validate(v!); check(await supabase.from("hosted_series").update(toRow(v!)).eq("id", params.id)); },
    onSuccess: () => { refresh(); toast({ title: "Series saved" }); },
    onError: (e) => toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async () => { check(await supabase.from("hosted_series").delete().eq("id", params.id)); },
    onSuccess: () => { refresh(); toast({ title: "Series deleted" }); nav("/studio"); },
    onError: (e) => toast({ title: "Not deleted", description: errMsg(e), variant: "destructive" }),
  });
  const delCh = useMutation({
    mutationFn: async (id: string) => { check(await supabase.from("hosted_chapters").delete().eq("id", id)); },
    onSuccess: () => { refresh(); ch.refetch(); }, onError: (e) => toast({ title: "Chapter not deleted", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <Gate>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Link href="/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Studio</Link>
        {s.error ? <InlineError error={s.error} onRetry={() => s.refetch()} /> : s.isLoading || (s.data && !v) ? <div className="shimmer relative h-60 overflow-hidden rounded-2xl bg-muted" /> : !s.data ? <EmptyBox>This series doesn't exist or you can't manage it.</EmptyBox> : (
          <>
            <PageHead icon={PenTool} kicker="Edit series" title={s.data.title} action={s.data.published && !s.data.taken_down ? <Link href={`/series/${s.data.slug}`} className="text-sm font-medium text-primary hover:underline">View public page</Link> : undefined} />
            {s.data.taken_down && <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">Taken down by MANGASALT{s.data.takedown_reason ? `: ${s.data.takedown_reason}` : ""}. It's hidden from readers.</div>}
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="rounded-3xl border border-border bg-card/50 p-4 sm:p-5">
              <SeriesForm v={v!} set={(p) => setV((c) => ({ ...c!, ...p }))} />
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="submit" className="gap-2 rounded-full" disabled={save.isPending} data-testid="button-save-series">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</Button>
                <Button type="button" variant={confirmDel ? "destructive" : "ghost"} className="gap-2 rounded-full" onClick={() => (confirmDel ? del.mutate() : setConfirmDel(true))} onBlur={() => setConfirmDel(false)} data-testid="button-delete-series"><Trash2 className="h-4 w-4" />{confirmDel ? "Tap again to delete series" : "Delete series"}</Button>
              </div>
            </form>

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Chapters</h2><Button className="gap-2 rounded-full" onClick={() => setEditing("new")} data-testid="button-add-chapter"><Plus className="h-4 w-4" />Add chapter</Button></div>
              {ch.error ? <InlineError error={ch.error} onRetry={() => ch.refetch()} /> : !ch.data?.length ? <EmptyBox>No chapters yet.</EmptyBox> : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {ch.data.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`studio-chapter-${c.number}`}>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Chapter {formatNumber(c.number)}{c.title ? ` · ${c.title}` : ""}</p><p className="text-xs text-muted-foreground">{c.pages.length} pages · {c.published ? "published" : "draft"}</p></div>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(c)} data-testid={`button-edit-chapter-${c.number}`}>Edit</Button>
                      <Button size="sm" variant={confirmCh === c.id ? "destructive" : "ghost"} className="h-8 gap-1 rounded-full px-2" disabled={delCh.isPending} onClick={() => (confirmCh === c.id ? (delCh.mutate(c.id), setConfirmCh(null)) : setConfirmCh(c.id))} onBlur={() => setConfirmCh((x) => (x === c.id ? null : x))} aria-label={confirmCh === c.id ? `Confirm deleting chapter ${c.number}` : `Delete chapter ${c.number}`} data-testid={`button-delete-chapter-${c.number}`}><Trash2 className="h-4 w-4" />{confirmCh === c.id && <span className="text-xs">Delete?</span>}</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {editing && <ChapterEditor seriesId={params.id} chapter={editing === "new" ? undefined : editing} nextNumber={(ch.data?.at(-1)?.number ?? 0) + 1} onClose={() => { setEditing(null); ch.refetch(); refresh(); }} />}
          </>
        )}
      </div>
    </Gate>
  );
}

function ChapterEditor({ seriesId, chapter, nextNumber, onClose }: { seriesId: string; chapter?: ChapterRow; nextNumber: number; onClose: () => void }) {
  const { toast } = useToast();
  const [num, setNum] = useState(String(chapter?.number ?? nextNumber));
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [pages, setPages] = useState<string[]>(chapter?.pages ?? []);
  const [published, setPublished] = useState(chapter?.published ?? true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setProgress({ done: 0, total: list.length });
    try {
      for (let i = 0; i < list.length; i++) {
        const prepared = await prepareImage(list[i]);
        const paths: string[] = [];
        for (const d of prepared) paths.push(await uploadData(d, seriesId));
        setPages((p) => [...p, ...paths]);
        setProgress({ done: i + 1, total: list.length });
      }
    } catch (e) { toast({ title: "Upload stopped", description: errMsg(e), variant: "destructive" }); }
    finally { setProgress(null); if (input.current) input.current.value = ""; }
  };
  const move = (i: number, d: number) => setPages((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = useMutation({
    mutationFn: async () => {
      const number = Number(num);
      if (!Number.isFinite(number) || number < 0) throw new Error("Chapter number must be a number, e.g. 12 or 12.5.");
      if (published && !pages.length) throw new Error("Add at least one page before publishing.");
      const row = { series_id: seriesId, number, title: title.trim(), pages, published };
      check(chapter ? await supabase.from("hosted_chapters").update(row).eq("id", chapter.id) : await supabase.from("hosted_chapters").insert(row));
    },
    onSuccess: () => { toast({ title: chapter ? "Chapter saved" : "Chapter added" }); onClose(); },
    onError: (e) => toast({ title: "Chapter not saved", description: /duplicate|unique/i.test(errMsg(e)) ? "A chapter with that number already exists." : errMsg(e), variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal aria-label="Chapter editor">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-4 sm:rounded-3xl sm:p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">{chapter ? `Edit chapter ${formatNumber(chapter.number)}` : "New chapter"}</h2><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Number"><Input value={num} onChange={(e) => setNum(e.target.value)} inputMode="decimal" data-testid="input-chapter-number" /></Field>
          <Field label="Title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-chapter-title" /></Field>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">{pages.length} page{pages.length === 1 ? "" : "s"}</p>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent" data-testid="button-upload-pages">{progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{progress ? `Uploading ${progress.done}/${progress.total}` : "Add pages"}<input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={!!progress} onChange={(e) => add(e.target.files)} /></label>
          </div>
          {pages.length ? (
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {pages.map((p, i) => (
                <li key={p} className="group relative overflow-hidden rounded-lg border border-border bg-muted">
                  <img src={pageUrl(p)!} alt={`Page ${i + 1}`} loading="lazy" className="aspect-[2/3] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{i + 1}</span>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-0.5">
                    <button onClick={() => move(i, -1)} className="p-1 text-white" aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
                    <button onClick={() => setPages((ps) => ps.filter((_, k) => k !== i))} className="p-1 text-white" aria-label="Remove page"><Trash2 className="h-3 w-3" /></button>
                    <button onClick={() => move(i, 1)} className="p-1 text-white" aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyBox>Add images in reading order. Tall vertical strips are split automatically.</EmptyBox>}
        </div>
        <label className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm"><span className="flex items-center gap-2">{published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}Published</span><Switch checked={published} onCheckedChange={setPublished} data-testid="switch-chapter-published" /></label>
        <Button className="mt-4 w-full rounded-full" onClick={() => save.mutate()} disabled={save.isPending || !!progress} data-testid="button-save-chapter">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{chapter ? "Save chapter" : "Add chapter"}</Button>
      </div>
    </div>
  );
}
