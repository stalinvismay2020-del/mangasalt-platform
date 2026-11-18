import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Search, ArrowLeft, RotateCw, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Floating "lost page" illustration, shared by the 404 and error screens. */
function LostPage({ code, tone = "primary" }: { code: string; tone?: "primary" | "danger" }) {
  const reduce = useReducedMotion();
  const color = tone === "danger" ? "hsl(0 80% 60%)" : "hsl(var(--primary))";
  return (
    <div className="relative mx-auto h-48 w-64 select-none" aria-hidden>
      <motion.div className="absolute inset-0 rounded-full blur-3xl" style={{ background: color, opacity: 0.18 }} animate={reduce ? undefined : { scale: [1, 1.15, 1] }} transition={{ duration: 5, repeat: Infinity }} />
      {[-1, 1].map((side) => (
        <motion.div key={side} className="absolute top-6 h-36 w-24 rounded-xl border border-white/15 bg-card shadow-2xl"
          style={{ left: side < 0 ? 28 : 140, transformOrigin: side < 0 ? "right center" : "left center" }}
          animate={reduce ? undefined : { y: [0, -14, 0], rotate: [side * 8, side * 14, side * 8] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: side > 0 ? 0.4 : 0 }}>
          <div className="space-y-2 p-3">{[70, 90, 55, 80, 40].map((w, i) => <div key={i} className="h-1.5 rounded-full bg-muted-foreground/20" style={{ width: `${w}%` }} />)}</div>
        </motion.div>
      ))}
      <motion.p className="font-display absolute inset-x-0 top-12 text-center text-7xl font-bold" style={{ color: "transparent", WebkitTextStroke: `2px ${color}`, textShadow: `0 0 40px ${color}` }}
        animate={reduce ? undefined : { y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>{code}</motion.p>
    </div>
  );
}

/** Custom 404: shown for unknown routes and for content that truly doesn't exist. */
export function NotFoundView({ title = "This page wandered off", message = "The page you're looking for doesn't exist, was moved, or the link is incomplete.", embedded = false }: { title?: string; message?: string; embedded?: boolean }) {
  const [loc] = useLocation();
  return (
    <div className={`flex w-full items-center justify-center px-4 ${embedded ? "py-16" : "min-h-[75vh] py-12"}`} data-testid="page-not-found">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-md text-center">
        <LostPage code="404" />
        <h1 className="font-display mt-4 text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {!embedded && <p className="mt-2 break-all font-mono text-xs text-muted-foreground/70">{loc}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/"><Button className="glow-primary gap-2 rounded-full"><Home className="h-4 w-4" />Go home</Button></Link>
          <Link href="/search"><Button variant="outline" className="glass-btn gap-2 rounded-full"><Search className="h-4 w-4" />Search titles</Button></Link>
          {window.history.length > 1 && <Button variant="ghost" className="gap-2 rounded-full" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4" />Go back</Button>}
        </div>
      </motion.div>
    </div>
  );
}

export default function NotFound() { return <NotFoundView />; }

/** Error screen for real crashes only (render errors / failed app code loads), never for normal "not found" or signed-out states. */
function CrashView({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const chunk = /Loading chunk|dynamically imported module|Failed to fetch dynamically/i.test(error.message);
  return (
    <div className="flex min-h-[75vh] w-full items-center justify-center px-4 py-12" role="alert" data-testid="page-error">
      <div className="max-w-md text-center">
        <LostPage code="!" tone="danger" />
        <h1 className="font-display mt-4 text-2xl font-semibold sm:text-3xl">{chunk ? "A new version is available" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{chunk ? "MANGASALT was updated while you were reading. Reload to get the latest version." : "This screen hit an unexpected problem. Your library and reading progress are safe."}</p>
        <details className="mx-auto mt-3 max-w-sm text-left text-xs text-muted-foreground/80"><summary className="cursor-pointer text-center">Technical details</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2">{error.message}</pre></details>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button className="gap-2 rounded-full" onClick={() => (chunk ? window.location.reload() : onRetry())} data-testid="button-error-retry"><RotateCw className="h-4 w-4" />{chunk ? "Reload" : "Try again"}</Button>
          <Button variant="outline" className="glass-btn gap-2 rounded-full" onClick={() => { window.location.hash = "#/library"; onRetry(); }}><BookOpen className="h-4 w-4" />My library</Button>
          <Button variant="ghost" className="gap-2 rounded-full" onClick={() => { window.location.hash = "#/"; onRetry(); }}><Home className="h-4 w-4" />Home</Button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[MANGASALT] UI error", error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() { return this.state.error ? <CrashView error={this.state.error} onRetry={() => this.setState({ error: null })} /> : this.props.children; }
}
