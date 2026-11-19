import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Home, Search, RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Real 404: shown only for routes that don't exist, or when the server confirms
 * the requested title/series/chapter is missing (HTTP 404). Temporary problems
 * (network, rate limits, 5xx) use <LoadError /> instead, with a retry button.
 */
export default function NotFound({ what = "page" }: { what?: string }) {
  const [loc] = useLocation();
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center overflow-hidden px-4 py-20 text-center" data-testid="page-not-found">
      <motion.div aria-hidden initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="font-display pointer-events-none select-none text-[34vw] font-black leading-none tracking-tighter text-primary/10 sm:text-[200px]">
        404
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="-mt-10 sm:-mt-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Lost between panels</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-404-title">This {what} doesn't exist</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The link may be broken, or the {what} was removed.{what === "page" && loc ? <> We couldn't find <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{loc}</code>.</> : null}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/"><Button className="gap-2 rounded-full" data-testid="button-404-home"><Home className="h-4 w-4" />Go home</Button></Link>
          <Link href="/search"><Button variant="secondary" className="gap-2 rounded-full" data-testid="button-404-search"><Search className="h-4 w-4" />Search titles</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}

/** Temporary failure (not a 404): keep the user on the page and let them retry. */
export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center" data-testid="page-load-error">
      <WifiOff className="h-9 w-9 text-primary" />
      <h1 className="font-display mt-3 text-2xl font-semibold">Couldn't load this right now</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message || "The catalogue is busy or your connection dropped."} Nothing is wrong with the link.</p>
      <Button onClick={onRetry} className="mt-5 gap-2 rounded-full" data-testid="button-retry"><RotateCw className="h-4 w-4" />Try again</Button>
    </div>
  );
}

/** True only when the server confirmed the resource is missing. */
export const isNotFound = (e: unknown) => (e as any)?.status === 404;
