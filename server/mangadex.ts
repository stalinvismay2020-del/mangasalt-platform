// Official English chapter index via the MangaDex API.
// We ONLY keep chapters that point to an official publisher (externalUrl: MANGA Plus, VIZ, etc.).
// Fan scanlations are never listed or streamed.
const API = "https://api.mangadex.org";
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { t: number; v: any }>();
const UA = { "User-Agent": "MANGASALT/1.0 (official chapter index)" };

async function get(path: string) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const r = await fetch(API + path, { headers: UA });
  if (!r.ok) { if (hit) return hit.v; throw Object.assign(new Error(`Chapter index unavailable (${r.status})`), { status: 502 }); }
  const v = await r.json();
  cache.set(path, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}

export type OfficialChapter = { key: string; number: string; title: string | null; publishedAt: string; sources: { publisher: string; url: string; embeddable: boolean }[]; unavailable: boolean };

const mdIdCache = new Map<number, string | null>();
const mdEngCache = new Map<number, string | null>();
async function findMangaDexId(anilistId: number, titles: string[]): Promise<string | null> {
  if (mdIdCache.has(anilistId)) return mdIdCache.get(anilistId)!;
  for (const t of titles.filter(Boolean)) {
    const d = await get(`/manga?title=${encodeURIComponent(t)}&limit=10&contentRating[]=safe&contentRating[]=suggestive`);
    const m = (d.data ?? []).find((x: any) => String(x.attributes?.links?.al ?? "") === String(anilistId));
    if (m) { mdIdCache.set(anilistId, m.id); mdEngCache.set(anilistId, m.attributes?.links?.engtl ?? null); return m.id; }
  }
  mdIdCache.set(anilistId, null);
  return null;
}

function publisherName(group: string | undefined, url: string) {
  if (/mangaplus\.shueisha/.test(url)) return "MANGA Plus";
  if (/viz\.com/.test(url)) return "VIZ";
  if (/comikey/.test(url)) return "Comikey";
  if (/bilibilicomics|manga\.bilibili/.test(url)) return "Bilibili Comics";
  if (/azuki/.test(url)) return "Azuki";
  if (/webtoons\.com/.test(url)) return "WEBTOON";
  if (/kodansha|kmanga/.test(url)) return "K MANGA";
  return (group ?? new URL(url).hostname).replace(/\s*\(.*?\)\s*/g, "");
}

export async function officialChapters(anilistId: number, titles: string[]) {
  const md = await findMangaDexId(anilistId, titles);
  if (!md) return { found: false, chapters: [] as OfficialChapter[] };
  return officialChaptersByMd(md);
}

/** Official-publisher chapters (externalUrl only) of a MangaDex title. Scanlation chapters are skipped. */
export async function officialChaptersByMd(md: string) {
  const all: any[] = [];
  for (let offset = 0; offset < 3000; offset += 500) {
    const d = await get(`/manga/${md}/feed?translatedLanguage[]=en&limit=500&offset=${offset}&order[chapter]=asc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive`);
    all.push(...(d.data ?? []));
    if (offset + 500 >= (d.total ?? 0)) break;
  }
  const byNum = new Map<string, OfficialChapter>();
  for (const c of all) {
    const a = c.attributes;
    if (!a.externalUrl) continue; // official publisher links only
    const g = c.relationships?.find((r: any) => r.type === "scanlation_group")?.attributes?.name;
    const num = a.chapter ?? "Oneshot";
    const src = { publisher: publisherName(g, a.externalUrl), url: a.externalUrl, embeddable: /mangaplus\.shueisha\.co\.jp/.test(a.externalUrl) };
    const ex = byNum.get(num);
    if (ex) { if (!ex.sources.some((s) => s.url === src.url)) ex.sources.push(src); if (!ex.title && a.title) ex.title = a.title; if (!a.isUnavailable) ex.unavailable = false; }
    else byNum.set(num, { key: num, number: num, title: a.title || null, publishedAt: a.publishAt, sources: [src], unavailable: !!a.isUnavailable });
  }
  const chapters = Array.from(byNum.values()).sort((x, y) => (parseFloat(x.number) || 0) - (parseFloat(y.number) || 0));
  chapters.forEach((c) => c.sources.sort((a, b) => Number(b.embeddable) - Number(a.embeddable)));
  return { found: true, chapters };
}

/** Second check for titles AniList has no English publisher for: MangaDex's "official English" (engtl) link. */
export async function mangadexEnglish(anilistId: number, titles: string[]): Promise<string | null> {
  await findMangaDexId(anilistId, titles);
  const u = mdEngCache.get(anilistId);
  if (!u) return null;
  try { return publisherName(undefined, u.startsWith("http") ? u : `https://${u}`); } catch { return "Official publisher"; }
}
