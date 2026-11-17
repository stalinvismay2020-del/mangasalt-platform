// Tapas (official English publisher for many Korean webtoons) allows its episode pages to be shown inside other sites.
// We list every episode of the official series and open it in Tapas's own reader inside MANGASALT. No images are copied.
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { t: number; v: any }>();

export type TapasEpisode = { key: string; number: string; title: string | null; publishedAt: string | null; access: "free" | "wait" | "coins"; src: string };

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return v;
}

async function seriesId(url: string): Promise<string | null> {
  return cached(`sid:${url}`, async () => {
    const r = await fetch(url.replace(/\/?$/, "").replace(/\/info$/, "") + "/info", { headers: UA, redirect: "follow" });
    if (!r.ok) return null;
    const m = (await r.text()).match(/series-id="(\d+)"/);
    return m ? m[1] : null;
  });
}

export async function tapasEpisodes(seriesUrl: string): Promise<TapasEpisode[]> {
  if (!/^https?:\/\/(www\.)?tapas\.io\/series\//.test(seriesUrl)) return [];
  return cached(`eps:${seriesUrl}`, async () => {
    const id = await seriesId(seriesUrl);
    if (!id) return [];
    const out: TapasEpisode[] = [];
    const getPage = async (page: number) => {
      const r = await fetch(`https://tapas.io/series/${id}/episodes?page=${page}&sort=OLDEST&max_limit=20`, { headers: { ...UA, Accept: "application/json" } });
      if (!r.ok) return null;
      return (await r.json()).data as any;
    };
    const first = await getPage(1);
    if (!first?.pagination) return [];
    const pages = Math.min(60, Math.ceil((first.pagination.total ?? 20) / 20));
    const bodies: string[] = [first.body];
    for (let p = 2; p <= pages; p += 6) {
      const batch = await Promise.all(Array.from({ length: Math.min(6, pages - p + 1) }, (_, k) => getPage(p + k).catch(() => null)));
      bodies.push(...batch.map((b) => b?.body ?? ""));
    }
    for (const li of bodies.join("").split("<li ").slice(1)) {
      const eid = li.match(/data-id="(\d+)"/)?.[1];
      if (!eid || out.some((e) => e.key === `t${eid}`)) continue;
      const label = li.match(/info__label">\s*([^<]*?)\s*</)?.[1] ?? "";
      const title = li.match(/info__title">\s*([^<]*?)\s*</)?.[1] ?? null;
      const named = title?.match(/^(?:episode|ep\.?|epiosde|chapter|ch\.?)\s*([\d.]+)\s*$/i)?.[1];
      const num = named ?? label.match(/[\d.]+/)?.[0] ?? String(out.length + 1);
      const locked = /thumb__overlay--locked|ico--lock/.test(li);
      const wait = /viewer-episode-list-wuf__wuf/.test(li);
      out.push({ key: `t${eid}`, number: num, title: title && !named && title !== label ? title : null, publishedAt: null, access: !locked ? "free" : wait ? "wait" : "coins", src: `https://tapas.io/episode/${eid}` });
    }
    return out;
  });
}
