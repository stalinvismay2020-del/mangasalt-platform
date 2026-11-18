// Bulk chapter import: upload a ZIP / CBZ / PDF and turn it into chapters.
// Used by the admin chapter manager and by creators in the studio.
import { useRef, useState } from "react";
import { FileArchive, Loader2, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { API_BASE, getAuthToken, invalidatePrefixes } from "@/lib/queryClient";
import { CHAPTER_KINDS, KIND_LABEL, type ChapterKind } from "@shared/chapters";

const LANGS: [string, string][] = [["en", "English"], ["es", "Spanish"], ["fr", "French"], ["pt", "Portuguese"], ["de", "German"], ["id", "Indonesian"], ["it", "Italian"], ["hi", "Hindi"], ["ta", "Tamil"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"]];
const MAX = 450 * 1024 * 1024;

type Result = { created: { id: number; number: number; title?: string; approval?: string; pageCount?: number }[]; skipped: { name: string; reason: string }[]; message?: string };

function send(url: string, file: File, onProgress: (p: number) => void): Promise<Result> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${API_BASE}${url}`);
    const t = getAuthToken(); if (t) x.setRequestHeader("Authorization", `Bearer ${t}`);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let body: any = null; try { body = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) resolve(body);
      else if (body?.created) resolve(body);
      else reject(new Error(body?.message ?? (x.status === 413 ? "That file is too large" : `Import failed (${x.status})`)));
    };
    x.onerror = () => reject(new Error("Connection lost during upload. Try again, or split the archive."));
    x.send(file);
  });
}

export function ImportChaptersDialog({ endpoint, mode, onClose }: { endpoint: string; mode: "admin" | "creator"; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ language: "en", kind: "regular" as ChapterKind, publish: false, number: "", title: "" });
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<null | "upload" | "process">(null);
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = (fl: File | undefined) => {
    setErr(null); setRes(null);
    if (!fl) return;
    if (!/\.(zip|cbz|pdf)$/i.test(fl.name)) return setErr("Choose a .zip, .cbz or .pdf file");
    if (fl.size > MAX) return setErr("That file is over 450 MB. Split it into smaller archives.");
    setFile(fl);
  };
  const go = async () => {
    if (!file) return;
    setBusy("upload"); setErr(null); setProgress(0);
    const q = new URLSearchParams({ name: file.name, rightsConfirmed: "1", language: f.language, kind: f.kind, ...(f.publish ? { publish: "1" } : {}), ...(f.number ? { number: f.number } : {}), ...(f.title ? { title: f.title } : {}) });
    try {
      const r = await send(`${endpoint}?${q}`, file, (p) => { setProgress(p); if (p >= 1) setBusy("process"); });
      setRes(r);
      invalidatePrefixes("/api/admin/content", "/api/studio", "/api/series", "/api/world", "/api/chapters");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogTitle>Import chapters</DialogTitle>
        <DialogDescription>
          Upload a ZIP, CBZ or PDF. Images at the top level become one chapter. A folder per chapter (for example "Chapter 12/001.jpg") becomes one chapter per folder, numbered from the folder name. Each PDF becomes one chapter.
        </DialogDescription>
        {res ? (
          <div className="space-y-3" data-testid="import-result">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-500" />{res.created.length} chapter{res.created.length === 1 ? "" : "s"} imported</p>
            {res.created.length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2 text-sm">{res.created.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">#{c.number}{c.title ? ` · ${c.title}` : ""}</span><span className="shrink-0 text-xs text-muted-foreground">{c.approval === "pending" ? "Waiting for review" : mode === "admin" ? (f.publish ? "Published" : "Draft") : "Published"}</span></li>)}</ul>}
            {res.skipped.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-sm"><p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" />Skipped {res.skipped.length}</p><ul className="space-y-0.5 text-xs">{res.skipped.slice(0, 20).map((s, i) => <li key={i} className="break-words"><b>{s.name}</b>: {s.reason}</li>)}</ul></div>}
            {mode === "admin" && !f.publish && res.created.length > 0 && <p className="text-xs text-muted-foreground">Imported chapters are drafts. Check them with the preview button, then publish.</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" className="rounded-full" onClick={() => { setRes(null); setFile(null); }}>Import another</Button><Button className="rounded-full" onClick={onClose}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
            <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center transition hover:border-primary/60 hover:bg-accent/40" data-testid="button-pick-archive">
              <FileArchive className="h-8 w-8 text-primary" />
              {file ? <span className="break-all text-sm font-medium">{file.name} · {(file.size / 1048576).toFixed(1)} MB</span> : <span className="text-sm text-muted-foreground">Choose or drop a .zip, .cbz or .pdf (up to 450 MB)</span>}
            </button>
            <input ref={input} type="file" accept=".zip,.cbz,.pdf,application/zip,application/pdf,application/x-cbz" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-archive" />
            {mode === "admin" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium">Language<select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">{LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs font-medium">Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ChapterKind })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">{CHAPTER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
              </div>
            )}
            <details className="rounded-xl border border-border p-2 text-sm"><summary className="cursor-pointer text-xs font-medium">Single chapter? Set its number and title</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-[110px_1fr]">
                <Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Number" inputMode="decimal" className="h-9" />
                <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title (optional)" maxLength={120} className="h-9" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Leave empty to read numbers from file and folder names.</p>
            </details>
            {mode === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />Publish right away (otherwise saved as drafts)</label>}
            <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" data-testid="checkbox-import-rights" />
              {mode === "admin" ? "I confirm MANGASALT owns, licenses, or has open-licence permission to distribute every page in this file." : "I confirm this is my own work, or I have the rights to publish every page in this file."}</label>
            {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
            {busy && <div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div><p className="text-xs text-muted-foreground">{busy === "upload" ? `Uploading… ${Math.round(progress * 100)}%` : "Reading pages and creating chapters… large PDFs can take a few minutes."}</p></div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={!!busy}>Cancel</Button>
              <Button type="submit" className="gap-1.5 rounded-full" disabled={!file || !rights || !!busy} data-testid="button-start-import">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
