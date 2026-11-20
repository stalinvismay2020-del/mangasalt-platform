import { Component, type ReactNode } from "react";

/** Catches render crashes so users see a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) { console.error("UI crash:", error, info?.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center" data-testid="page-crash">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Something broke</p>
        <h1 className="font-display mt-2 text-2xl font-semibold">This page hit an error</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your account and library are safe. Try again, or go back home.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-crash-retry">Try again</button>
          <a href="#/" onClick={() => this.setState({ error: null })} className="rounded-full bg-secondary px-5 py-2 text-sm font-semibold">Go home</a>
        </div>
      </div>
    );
  }
}
