// MANGASALT catalogue gateway. Runs server-side so upstream configuration stays off the client,
// and so every response is validated and normalised before the app sees it.
import { browse, chapters, details, health, log, pages, UpstreamError, AUTHORIZED_SOURCES, INDEX_SOURCE } from "./dawghwa.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200, maxAge = 0, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS, "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : "no-store",
      ...extra,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed", code: "METHOD" }, 405);
  const url = new URL(req.url);
  // Path arrives as /catalog/<route>
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("catalog");
  const route = (i >= 0 ? parts.slice(i + 1) : parts).map(decodeURIComponent);
  const q = url.searchParams;
  const started = Date.now();
  try {
    if (route[0] === "health") {
      const d = await health();
      return json({ ok: d.ok, dawghwa: d, indexSource: INDEX_SOURCE, authorizedPageSources: [...AUTHORIZED_SOURCES] }, d.ok ? 200 : 503);
    }
    if (route[0] === "browse") {
      const data = await browse({
        q: q.get("q") ?? undefined, genre: q.get("genre") ?? undefined, format: q.get("format") ?? undefined,
        status: q.get("status") ?? undefined, sort: q.get("sort") ?? undefined, year: q.get("year") ?? undefined,
        page: Number(q.get("page") ?? 1) || 1, limit: Number(q.get("limit") ?? 24) || 24,
      });
      return json(data, 200, q.get("q") ? 120 : 600);
    }
    if (route[0] === "title" && /^\d{1,9}$/.test(route[1] ?? "")) {
      const id = Number(route[1]);
      if (route[2] === "chapters") {
        const order = q.get("order") === "desc" ? "desc" : "asc";
        return json(await chapters(id, order), 200, 900);
      }
      if (!route[2]) return json(await details(id), 200, 1800);
    }
    if (route[0] === "pages" && route[1] && route[2]) {
      return json(await pages(route[1], route[2]), 200, 300);
    }
    return json({ error: "Unknown catalogue route", code: "NOT_FOUND" }, 404);
  } catch (e) {
    if (e instanceof UpstreamError) {
      const status = e.status === 404 ? 404 : e.status === 403 ? 403 : e.status === 429 ? 429 : e.status === 504 ? 504 : 502;
      return json({ error: e.message, code: e.code, retryAfter: e.retryAfter ?? null, requestId: e.requestId ?? null }, status, 0,
        e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
    }
    log("error", "unhandled", { route: route.join("/"), ms: Date.now() - started, message: String((e as Error)?.message ?? e) });
    return json({ error: "Unexpected catalogue error", code: "INTERNAL" }, 500);
  }
});
