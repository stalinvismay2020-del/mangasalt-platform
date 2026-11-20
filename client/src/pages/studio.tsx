import { useRef, useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { PenTool, Plus, Upload, ImagePlus, Trash2, GripVertical, ArrowUp, ArrowDown, Eye, Heart, MessageCircle, BookOpen, Loader2, ArrowLeft, Pencil, ShieldCheck, X, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHead, EmptyBox, asset, TypeBadge } from "@/components/shared";
import { useApp, compact } from "@/lib/app-context";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { prepareImage, uploadData } from "@/lib/upload";
import { useToast } from "@/hooks/use-toast";

type MySeries = { id: number; slug: string; title: string; type: string; cover: string; status: string; views: number; chapters: number; likes: number; comments: number };
type StudioChapter = { id: number; number: number; title: string; pages: string[]; createdAt: number };
type StudioSeries = { id: number; slug: string; title: string; type: string; genres: string[]; synopsis: string; cover: string; status: string; views: number; chapters: StudioChapter[] };

const TYPES = [["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"], ["comic", "Comic"]] as const;
const STATUSES = [["ongoing", "Ongoing"], ["completed", "Completed"], ["hiatus", "On hiatus"]] as const;
const EXTRA_GENRES = ["Martial Arts", "Isekai", "School", "Historical"];
const refresh = () => invalidatePrefixes("/api/studio", "/api/series", "/api/home", "/api/genres", "/api/me/library");

function SignInGate() {
  const { openAuth } = useApp();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <motion.div initial={{ scale: 0.6, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_40px_hsl(var(--primary)/0.4)]"><PenTool className="h-7 w-7" /></motion.div>
      <h1 className="font-display mt-5 text-3xl font-semibold">Creator Studio</h1>
      <p className="mt-2 text-muted-foreground">Publish your own manga, manhwa, manhua or comic on MANGASALT. Readers can like, follow, comment and read every chapter for free.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button className="rounded-full" onClick={() => openAuth("signup")} data-testid="button-studio-signup">Create an account</Button>
        <Button variant="outline" className="rounded-full" onClick={() => openAuth("login")} data-testid="button-studio-login">Sign in</Button>
      </div>
    </div>
  );
}

// ---------------- Dashboard ----------------
export function StudioHome() {
  const { user } = useApp();
  const { data, isLoading } = useQuery<{ series: MySeries[] }>({ queryKey: ["/api/studio", { u: String(user?.id ?? "") }], enabled: !!user });
  if (!user) return <SignInGate />;
  const list = data?.series ?? [];
  const tot = list.reduce((a, s) => ({ views: a.views + s.views, likes: a.likes + s.likes, chapters: a.chapters + s.chapters, comments: a.comments + s.comments }), { views: 0, likes: 0, chapters: 0, comments: 0 });
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHead icon={PenTool} kicker="Creator Studio" title={`Hi, ${user.displayName}`} sub="Publish series, upload chapters and watch your readers grow." />
        <Link href="/studio/new"><Button className="glow-primary mb-5 gap-2 rounded-full" data-testid="button-new-series"><Plus className="h-4 w-4" />New series</Button></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[BookOpen, "Chapters", tot.chapters], [Eye, "Views", tot.views], [Heart, "Likes", tot.likes], [MessageCircle, "Comments", tot.comments]].map(([Icon, l, v]: any, k) => (
          <motion.div key={l} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }} className="rounded-2xl border border-border bg-card p-4">
            <Icon className="h-4 w-4 text-primary" /><p className="font-display mt-2 text-2xl font-semibold tabular-nums">{compact(v)}</p><p className="text-xs text-muted-foreground">{l}</p>
          </motion.div>
        ))}
      </div>
      <h2 className="font-display mb-4 mt-10 text-xl font-semibold">Your series</h2>
      {isLoading ? <div className="shimmer relative h-40 overflow-hidden rounded-2xl bg-muted" />
        : !list.length ? (
          <Link href="/studio/new" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center transition hover:border-primary/60" data-testid="link-first-series">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary"><Upload className="h-5 w-5" /></span>
            <span className="font-semibold">Publish your first series</span><span className="max-w-sm text-sm text-muted-foreground">Add a cover, a synopsis and your first chapter. It goes live on MANGASALT right away.</span>
          </Link>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s, k) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.05 }} whileHover={{ y: -3 }}
                className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <img src={asset(s.cover)} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2"><TypeBadge type={s.type} /><span className="text-[11px] capitalize text-muted-foreground">{s.status}</span></div>
                  <p className="mt-1 line-clamp-2 font-semibold leading-tight">{s.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.chapters} ch · {compact(s.views)} views · {compact(s.likes)} likes</p>
                  <div className="mt-auto flex gap-2 pt-2">
                    <Link href={`/studio/series/${s.id}`}><Button size="sm" className="h-8 rounded-full" data-testid={`button-manage-${s.id}`}>Manage</Button></Link>
                    <Link href={`/series/${s.slug}`}><Button size="sm" variant="outline" className="h-8 rounded-full">View</Button></Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      <p className="mt-10 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Only upload work you created or have permission to publish. Uploads that infringe someone else's rights are removed when reported.</p>
    </div>
  );
}

// ---------------- Shared form bits ----------------
function CoverPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const [d] = await prepareImage(f, { maxW: 800, split: false }); onChange(await uploadData(d)); }
    catch (e: any) { toast({ title: "Cover upload failed", description: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={() => ref.current?.click()} data-testid="button-pick-cover"
      className="group relative aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-2xl border border-dashed border-border bg-card transition hover:border-primary sm:w-44">
      {value ? <img src={asset(value)} alt="Cover" className="h-full w-full object-cover" />
        : <span className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground"><ImagePlus className="h-6 w-6 text-primary" />Upload cover<br />(2:3 portrait)</span>}
      {value && <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">Change cover</span>}
      {busy && <span className="absolute inset-0 grid place-items-center bg-black/60"><Loader2 className="h-6 w-6 animate-spin text-primary" /></span>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-cover-file" />
    </button>
  );
}

type Fields = { title: string; type: string; status: string; synopsis: string; genres: string[]; cover: string };
function SeriesFields({ v, set }: { v: Fields; set: (p: Partial<Fields>) => void }) {
  const g = useQuery<string[]>({ queryKey: ["/api/world/genres"] });
  const all = [...(g.data ?? []), ...EXTRA_GENRES];
  const toggle = (x: string) => set({ genres: v.genres.includes(x) ? v.genres.filter((y) => y !== x) : v.genres.length >= 6 ? v.genres : [...v.genres, x] });
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <CoverPicker value={v.cover} onChange={(cover) => set({ cover })} />
      <div className="min-w-0 flex-1 space-y-4">
        <label className="block"><span className="text-sm font-medium">Title</span>
          <Input value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} placeholder="Your series title" className="mt-1.5" data-testid="input-series-title" /></label>
        <div><span className="text-sm font-medium">Format</span>
          <div className="mt-1.5 flex flex-wrap gap-2">{TYPES.map(([k, l]) => (
            <button type="button" key={k} onClick={() => set({ type: k })} data-testid={`chip-format-${k}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${v.type === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{l}</button>))}</div></div>
        <div><span className="text-sm font-medium">Status</span>
          <div className="mt-1.5 flex flex-wrap gap-2">{STATUSES.map(([k, l]) => (
            <button type="button" key={k} onClick={() => set({ status: k })} data-testid={`chip-status-${k}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${v.status === k ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{l}</button>))}</div></div>
        <div><span className="text-sm font-medium">Genres <span className="font-normal text-muted-foreground">(up to 6)</span></span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{all.map((x) => {
            const on = v.genres.includes(x);
            return <button type="button" key={x} onClick={() => toggle(x)} data-testid={`chip-studio-genre-${x}`}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{on && <Check className="h-3 w-3" />}{x}</button>;
          })}</div></div>
        <label className="block"><span className="text-sm font-medium">Synopsis</span>
          <Textarea value={v.synopsis} onChange={(e) => set({ synopsis: e.target.value })} maxLength={1500} rows={5} placeholder="What is your story about?" className="mt-1.5" data-testid="input-series-synopsis" />
          <span className="mt-1 block text-right text-xs text-muted-foreground">{v.synopsis.length}/1500</span></label>
      </div>
    </div>
  );
}

// ---------------- Page uploader ----------------
type Pg = { key: string; path?: string; preview: string; status: "uploading" | "done" | "error" };
function PageUploader({ pages, setPages }: { pages: Pg[]; setPages: (f: (p: Pg[]) => Pg[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { toast } = useToast();
  const add = async (files: File[]) => {
    files = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of files) {
      let slices: string[];
      try { slices = await prepareImage(f); } catch (e: any) { toast({ title: "Skipped a file", description: e.message }); continue; }
      const items = slices.map((d) => ({ key: Math.random().toString(36).slice(2), preview: d, status: "uploading" as const }));
      setPages((p) => [...p, ...items]);
      await Promise.all(items.map(async (it, i) => {
        try { const path = await uploadData(slices[i]); setPages((p) => p.map((x) => (x.key === it.key ? { ...x, path, status: "done" } : x))); }
        catch (e: any) { setPages((p) => p.map((x) => (x.key === it.key ? { ...x, status: "error" } : x))); toast({ title: "A page didn't upload", description: e?.message ?? "Try again" }); }
      }));
    }
  };
  const retry = async (key: string, data: string) => {
    setPages((p) => p.map((x) => (x.key === key ? { ...x, status: "uploading" } : x)));
    try { const path = await uploadData(data); setPages((p) => p.map((x) => (x.key === key ? { ...x, path, status: "done" } : x))); }
    catch (e: any) { setPages((p) => p.map((x) => (x.key === key ? { ...x, status: "error" } : x))); toast({ title: "Still couldn't upload", description: e?.message }); }
  };
  const move = (i: number, d: number) => setPages((p) => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  return (
    <div>
      <div onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(Array.from(e.dataTransfer.files)); }} data-testid="dropzone-pages"
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${drag ? "scale-[1.01] border-primary bg-primary/10" : "border-border bg-card/50 hover:border-primary/60"}`}>
        <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity }} className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary"><Upload className="h-5 w-5" /></motion.span>
        <p className="font-semibold">Drop pages here or tap to choose</p>
        <p className="max-w-sm text-xs text-muted-foreground">Photos from your gallery (JPEG, PNG or WebP). Files are sorted by name. Long webtoon strips are split into pages automatically.</p>
        <input ref={ref} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} data-testid="input-page-files" />
      </div>
      {pages.length > 0 && (
        <Reorder.Group axis="y" values={pages} onReorder={(v) => setPages(() => v)} className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {pages.map((p, i) => (
              <Reorder.Item key={p.key} value={p} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-2" data-testid={`row-page-${i + 1}`}>
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                <img src={p.preview} alt="" className="h-14 w-10 shrink-0 rounded object-cover" draggable={false} />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">Page {i + 1}</p>
                  <p className={`text-xs ${p.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Upload failed" : "Ready"}</p></div>
                {p.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {p.status === "error" && <button type="button" onClick={() => retry(p.key, p.preview)} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground" data-testid={`button-retry-page-${i + 1}`}>Retry</button>}
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === pages.length - 1} className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPages((a) => a.filter((x) => x.key !== p.key))} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive" aria-label="Remove page" data-testid={`button-remove-page-${i + 1}`}><Trash2 className="h-4 w-4" /></button>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </div>
  );
}

// ---------------- New series ----------------
export function StudioNew() {
  const { user } = useApp();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [v, setV] = useState<Fields>({ title: "", type: "manga", status: "ongoing", synopsis: "", genres: [], cover: "" });
  const [rights, setRights] = useState(false);
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/studio/series", { ...v, rights })).json(),
    onSuccess: (d: any) => { refresh(); toast({ title: "Series created", description: "Now add your first chapter." }); nav(`/studio/series/${d.id}`); },
    onError: (e: Error) => toast({ title: "Couldn't create series", description: e.message }),
  });
  if (!user) return <SignInGate />;
  const ok = v.title.trim().length >= 2 && v.cover && v.genres.length && v.synopsis.trim().length >= 10 && rights;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-4 sm:px-6">
      <Link href="/studio" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Studio</Link>
      <PageHead kicker="New series" title="Publish a series" sub="Readers will see this page before they start chapter 1." />
      <form onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }} className="space-y-6">
        <SeriesFields v={v} set={(p) => setV((o) => ({ ...o, ...p }))} />
        <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <Checkbox checked={rights} onCheckedChange={(c) => setRights(!!c)} className="mt-0.5" data-testid="checkbox-rights" />
          <span>I created this work or have the rights holder's permission to publish it on MANGASALT, and it contains no sexual content involving minors.</span>
        </label>
        <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" disabled={!ok || m.isPending} data-testid="button-create-series">
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create series
        </Button>
        {!ok && <p className="text-xs text-muted-foreground">Add a cover, title, at least one genre and a synopsis, then confirm the rights to continue.</p>}
      </form>
    </div>
  );
}

// ---------------- Manage series ----------------
function ChapterEditor({ seriesId, chapter, nextNumber, onClose }: { seriesId: number; chapter?: StudioChapter; nextNumber: number; onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [pages, setPagesRaw] = useState<Pg[]>(() => (chapter?.pages ?? []).map((p) => ({ key: p, path: p, preview: asset(p), status: "done" })));
  const setPages = (f: (p: Pg[]) => Pg[]) => setPagesRaw(f);
  const busy = pages.some((p) => p.status === "uploading");
  const ready = pages.filter((p) => p.status === "done" && p.path);
  const m = useMutation({
    mutationFn: async () => {
      const body = { title, pages: ready.map((p) => p.path) };
      return chapter ? apiRequest("PATCH", `/api/studio/chapters/${chapter.id}`, body) : apiRequest("POST", `/api/studio/series/${seriesId}/chapters`, body);
    },
    onSuccess: () => { refresh(); toast({ title: chapter ? "Chapter updated" : "Chapter published", description: chapter ? undefined : "It's live for readers now." }); onClose(); },
    onError: (e: Error) => toast({ title: "Couldn't save chapter", description: e.message }),
  });
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="rounded-2xl border border-primary/40 bg-card p-4 sm:p-5" data-testid="panel-chapter-editor">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{chapter ? `Edit chapter ${chapter.number}` : `New chapter ${nextNumber}`}</h3>
        <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><X className="h-4 w-4" /></button></div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Chapter title (optional)" className="mb-4" data-testid="input-chapter-title" />
      <PageUploader pages={pages} setPages={setPages} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{ready.length} page{ready.length === 1 ? "" : "s"} ready</p>
        <Button className="rounded-full" disabled={!ready.length || busy || m.isPending} onClick={() => m.mutate()} data-testid="button-publish-chapter">
          {(busy || m.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{chapter ? "Save chapter" : "Publish chapter"}
        </Button>
      </div>
    </motion.div>
  );
}

export function StudioSeries() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const { data: s, isLoading, isError } = useQuery<StudioSeries>({ queryKey: [`/api/studio/series/${id}`], enabled: !!user });
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<Fields | null>(null);
  const [editor, setEditor] = useState<"new" | number | null>(null);
  useEffect(() => { if (s && !s.chapters.length && editor === null) setEditor("new"); }, [s?.id]);
  useEffect(() => { if (s) setV({ title: s.title, type: s.type, status: s.status, synopsis: s.synopsis, genres: s.genres, cover: s.cover }); }, [s]);
  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/studio/series/${id}`, v),
    onSuccess: () => { refresh(); setEdit(false); toast({ title: "Series updated" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message }),
  });
  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/studio/series/${id}`),
    onSuccess: () => { refresh(); toast({ title: "Series deleted" }); nav("/studio"); },
  });
  const delCh = useMutation({
    mutationFn: async (cid: number) => apiRequest("DELETE", `/api/studio/chapters/${cid}`),
    onSuccess: () => { refresh(); toast({ title: "Chapter deleted" }); },
  });
  if (!user) return <SignInGate />;
  if (isError) return <div className="mx-auto max-w-lg px-4 py-20 text-center"><p className="font-display text-2xl">Series not found</p><Link href="/studio" className="mt-3 inline-block text-primary">Back to Studio</Link></div>;
  if (isLoading || !s || !v) return <div className="mx-auto max-w-4xl px-4 pt-8"><div className="shimmer relative h-64 overflow-hidden rounded-2xl bg-muted" /></div>;
  const next = (s.chapters.at(-1)?.number ?? 0) + 1;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-4 sm:px-6">
      <Link href="/studio" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Studio</Link>
      {!edit ? (
        <div className="flex flex-col gap-5 sm:flex-row">
          <img src={asset(s.cover)} alt="" className="mx-auto aspect-[2/3] w-36 rounded-2xl object-cover shadow-xl sm:mx-0 sm:w-40" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><TypeBadge type={s.type} /><span className="text-xs capitalize text-muted-foreground">{s.status}</span></div>
            <h1 className="font-display mt-2 text-3xl font-semibold" data-testid="text-studio-title">{s.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{s.genres.join(" · ")} · {compact(s.views)} views</p>
            <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-foreground/80">{s.synopsis}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1.5 rounded-full" onClick={() => setEdit(true)} data-testid="button-edit-series"><Pencil className="h-4 w-4" />Edit details</Button>
              <Link href={`/series/${s.slug}`}><Button variant="outline" className="gap-1.5 rounded-full" data-testid="button-view-public"><ExternalLink className="h-4 w-4" />View public page</Button></Link>
              <Button variant="ghost" className="gap-1.5 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => confirm(`Delete "${s.title}" and all its chapters? This can't be undone.`) && del.mutate()} data-testid="button-delete-series"><Trash2 className="h-4 w-4" />Delete</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
          <SeriesFields v={v} set={(p) => setV((o) => ({ ...o!, ...p }))} />
          <div className="flex gap-2"><Button className="rounded-full" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-series">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
            <Button variant="ghost" className="rounded-full" onClick={() => setEdit(false)}>Cancel</Button></div>
        </div>
      )}

      <div className="mb-4 mt-10 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Chapters <span className="text-muted-foreground">({s.chapters.length})</span></h2>
        {editor === null && <Button className="gap-1.5 rounded-full" onClick={() => setEditor("new")} data-testid="button-add-chapter"><Plus className="h-4 w-4" />Add chapter</Button>}
      </div>
      <AnimatePresence mode="wait">
        {editor !== null && (
          <div className="mb-4">
            <ChapterEditor key={String(editor)} seriesId={s.id} nextNumber={next} chapter={editor === "new" ? undefined : s.chapters.find((c) => c.id === editor)} onClose={() => setEditor(null)} />
          </div>
        )}
      </AnimatePresence>
      {!s.chapters.length && editor === null && <EmptyBox>No chapters yet. Add chapter 1 so readers can start.</EmptyBox>}
      <ul className="space-y-2">
        {s.chapters.map((c, k) => (
          <motion.li key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.03 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3" data-testid={`row-studio-chapter-${c.number}`}>
            <img src={asset(c.pages[0])} alt="" className="h-14 w-10 rounded object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Ch. {c.number} · {c.title}</p><p className="text-xs text-muted-foreground">{c.pages.length} pages · {new Date(c.createdAt).toLocaleDateString()}</p></div>
            <Link href={`/read/${c.id}`}><Button size="sm" variant="ghost" className="h-8 rounded-full">Read</Button></Link>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setEditor(c.id)} data-testid={`button-edit-chapter-${c.number}`}>Edit</Button>
            <button onClick={() => confirm(`Delete chapter ${c.number}?`) && delCh.mutate(c.id)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive" aria-label="Delete chapter" data-testid={`button-delete-chapter-${c.number}`}><Trash2 className="h-4 w-4" /></button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
