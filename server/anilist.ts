// AniList GraphQL client: worldwide manga / manhwa / manhua catalogue (metadata only).
// Catalogue metadata only. Chapters of licensed titles are NOT hosted here; titles show which official English publisher (if any) carries them.
import { officialCache } from "./storage";
import { mangadexEnglish } from "./mangadex";
import { mdExtras, mdTitle, isMdId, anilistTwin } from "./catalogue-md";
const ENDPOINT = "https://graphql.anilist.co";
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { t: number; v: any }>();
let blockedUntil = 0;

async function gql(query: string, variables: Record<string, any>) {
  const key = JSON.stringify([query, variables]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  if (Date.now() < blockedUntil) {
    if (hit) return hit.v;
    throw Object.assign(new Error("AniList is busy, try again in a moment"), { status: 503 });
  }
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }) });
  if (res.status === 429) {
    blockedUntil = Date.now() + (Number(res.headers.get("retry-after")) || 30) * 1000;
    if (hit) return hit.v;
    throw Object.assign(new Error("AniList is busy, try again in a moment"), { status: 503 });
  }
  const json: any = await res.json();
  if (json.errors?.length) throw Object.assign(new Error(json.errors[0].message), { status: res.status === 404 ? 404 : 502 });
  cache.set(key, { t: Date.now(), v: json.data });
  if (cache.size > 800) cache.delete(cache.keys().next().value!);
  return json.data;
}

const CARD = `id title { english romaji } bannerImage description(asHtml:false) coverImage { extraLarge large color } countryOfOrigin format status chapters averageScore popularity genres startDate { year } externalLinks { site url type language }`;
const SAFE_GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
const SORTS: Record<string, string[]> = {
  trending: ["TRENDING_DESC", "POPULARITY_DESC"], popular: ["POPULARITY_DESC"], score: ["SCORE_DESC"], new: ["START_DATE_DESC"], match: ["SEARCH_MATCH"], az: ["TITLE_ENGLISH"],
  chapters: ["CHAPTERS_DESC"], best: ["SCORE_DESC", "POPULARITY_DESC"], top: ["FAVOURITES_DESC", "SCORE_DESC"],
};
const STATUS: Record<string, string> = { ongoing: "RELEASING", completed: "FINISHED", hiatus: "HIATUS", upcoming: "NOT_YET_RELEASED", cancelled: "CANCELLED" };
const COUNTRY: Record<string, string> = { manga: "JP", manhwa: "KR", manhua: "CN" };

export type WorldCard = {
  id: number; title: string; altTitle: string | null; cover: string; color: string | null; type: "manga" | "manhwa" | "manhua" | "comic";
  status: string; chapters: number | null; score: number | null; popularity: number; genres: string[]; year: number | null; banner: string | null; blurb: string;
  official: string[];
  /** Which catalogue the title comes from. AniList when missing. */
  source?: "anilist" | "mangadex" | "mangasalt"; href?: string;
};
/** English-language publisher / reading platforms AniList lists for a title. */
function englishSites(m: any): string[] {
  const out: string[] = [];
  for (const l of m.externalLinks ?? []) {
    if (l.type === "SOCIAL" || l.language !== "English") continue;
    const name = l.site === "Official Site" ? "Official English site" : l.site;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
const clean = (d: string | null) => (d ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\(Source:[^)]*\)/gi, "").replace(/\n{3,}/g, "\n\n").trim();
const typeOf = (c: string) => (c === "KR" ? "manhwa" : c === "CN" || c === "TW" ? "manhua" : c === "JP" ? "manga" : "comic") as WorldCard["type"];
const statusOf = (s: string) => ({ RELEASING: "ongoing", FINISHED: "completed", HIATUS: "hiatus", NOT_YET_RELEASED: "upcoming", CANCELLED: "cancelled" } as any)[s] ?? "ongoing";
function card(m: any): WorldCard {
  return {
    id: m.id, title: m.title.english || m.title.romaji, altTitle: m.title.english && m.title.romaji !== m.title.english ? m.title.romaji : null,
    cover: m.coverImage.extraLarge || m.coverImage.large, color: m.coverImage.color, type: typeOf(m.countryOfOrigin), status: statusOf(m.status),
    chapters: m.chapters, score: m.averageScore, popularity: m.popularity, genres: m.genres.filter((g: string) => SAFE_GENRES.includes(g)), year: m.startDate?.year ?? null,
    banner: m.bannerImage ?? null, blurb: clean(m.description).slice(0, 320), official: englishSites(m), source: "anilist",
  };
}

/** Keep only titles with an official English edition. AniList first; if it lists none, ask MangaDex before dropping the title. */
let mdQueue: Promise<any> = Promise.resolve();
async function verify(c: WorldCard): Promise<WorldCard | null> {
  if (c.official.length) { officialCache.set(c.id, c.official); return c; }
  const known = officialCache.get(c.id);
  if (known) return { ...c, official: known };
  if (known === null) return null;
  // serialise MangaDex lookups (rate limit ~5 req/s)
  const job = mdQueue.then(() => mangadexEnglish(c.id, [c.title, c.altTitle ?? ""]).catch(() => undefined));
  mdQueue = job.then(() => new Promise((r) => setTimeout(r, 220)));
  const site = await job;
  if (site === undefined) return null; // lookup failed: hide for now, retry next time
  officialCache.set(c.id, site ? [site] : null);
  return site ? { ...c, official: [site] } : null;
}
export async function onlyOfficial(cards: WorldCard[], waitMs = 3500): Promise<WorldCard[]> {
  const res = await Promise.all(cards.map((c) => Promise.race([verify(c), new Promise<null>((r) => setTimeout(() => r(null), waitMs))])));
  return res.filter((x): x is WorldCard => !!x);
}
/** Keep every title; fill in the official English publisher when AniList or the cache knows it. Never hides a title. */
let warming = 0;
export function annotate(cards: WorldCard[]): WorldCard[] {
  return cards.map((c) => {
    if (c.official.length) { officialCache.set(c.id, c.official); return c; }
    const known = officialCache.get(c.id);
    if (known === undefined && warming < 40) { warming++; verify(c).catch(() => {}).finally(() => warming--); } // warm the cache in the background
    return known ? { ...c, official: known } : c;
  });
}

export async function worldSearch(o: { extras?: boolean; official?: boolean; q?: string; genres?: string[]; type?: string; status?: string; sort?: string; period?: string; page?: number; perPage?: number }) {
  const sort = SORTS[o.sort ?? (o.q ? "match" : "trending")] ?? SORTS.trending;
  const vars: any = { page: o.page ?? 1, perPage: Math.min(o.perPage ?? 24, 50), sort: o.q || sort[0] !== "SEARCH_MATCH" ? sort : ["POPULARITY_DESC"] };
  if (o.q) vars.search = o.q;
  const g = (o.genres ?? []).filter((x) => SAFE_GENRES.includes(x));
  if (g.length) vars.genres = g;
  if (o.type && COUNTRY[o.type]) vars.country = COUNTRY[o.type];
  if (o.status && STATUS[o.status]) vars.status = STATUS[o.status];
  // "best" only counts well-known titles so a 3-vote 10/10 doesn't win
  if (o.sort === "best") vars.minPop = 5000;
  const y = new Date().getFullYear();
  const PERIODS: Record<string, [number?, number?]> = { year: [y * 10000], recent: [(y - 5) * 10000], "2010s": [20100000, 20200000], "2000s": [20000000, 20100000], classic: [undefined, 20000000] };
  const per = o.period ? PERIODS[o.period] : undefined;
  if (per?.[0]) vars.after = per[0];
  if (per?.[1]) vars.before = per[1];
  const q = `query ($page:Int,$perPage:Int,$search:String,$genres:[String],$country:CountryCode,$status:MediaStatus,$sort:[MediaSort],$minPop:Int,$after:FuzzyDateInt,$before:FuzzyDateInt) {
    Page(page:$page, perPage:$perPage) { pageInfo { hasNextPage total currentPage }
      media(type:MANGA, isAdult:false, search:$search, genre_in:$genres, genre_not_in:["Hentai","Ecchi"], countryOfOrigin:$country, status:$status, sort:$sort, popularity_greater:$minPop, startDate_greater:$after, startDate_lesser:$before, format_not:NOVEL) { ${CARD} } } }`;
  const d = await gql(q, vars);
  const cards: WorldCard[] = d.Page.media.map(card);
  const items = o.official ? await onlyOfficial(cards) : annotate(cards);
  // Second source: MangaDex titles AniList doesn't have (deduplicated, metadata only). Never blocks the page for long.
  let extra: WorldCard[] = [];
  if (o.extras !== false) {
    const names = d.Page.media.flatMap((m: any) => [m.title.english, m.title.romaji]).filter(Boolean);
    extra = await Promise.race([
      mdExtras(o, gql, names, o.q ? 12 : 6).catch(() => [] as WorldCard[]),
      new Promise<WorldCard[]>((r) => setTimeout(() => r([]), o.q ? 6000 : 3500)),
    ]);
  }
  return { items: [...items, ...extra], hasNext: d.Page.pageInfo.hasNextPage, page: d.Page.pageInfo.currentPage, total: d.Page.pageInfo.total + extra.length, extra: extra.length };
}

export async function worldTitle(id: number): Promise<any> {
  if (isMdId(id)) {
    const twin = anilistTwin(id);
    if (twin) return { ...(await worldTitle(twin)), movedTo: twin };
    return mdTitle(id);
  }
  const q = `query ($id:Int) { Media(id:$id, type:MANGA) { ${CARD} isAdult bannerImage description(asHtml:false) volumes synonyms
    tags { name rank isMediaSpoiler } siteUrl
    staff(perPage:4, sort:RELEVANCE) { edges { role node { name { full } } } }
    externalLinks { site url type language color icon }
    recommendations(perPage:10, sort:RATING_DESC) { nodes { mediaRecommendation { ${CARD} isAdult } } } } }`;
  const d = await gql(q, { id });
  const m = d.Media;
  if (!m || m.isAdult) throw Object.assign(new Error("Title not found"), { status: 404 });
  const base = (await onlyOfficial([card(m)], 6000))[0] ?? card(m);
  const tapasUrl = (m.externalLinks ?? []).find((l: any) => /tapas\.io\/series\//.test(l.url ?? "") && l.language === "English")?.url ?? null;
  return {
    ...base, tapasUrl,
    banner: m.bannerImage, volumes: m.volumes, siteUrl: m.siteUrl,
    description: clean(m.description),
    tags: (m.tags ?? []).filter((t: any) => !t.isMediaSpoiler).slice(0, 8).map((t: any) => t.name),
    staff: (m.staff?.edges ?? []).map((e: any) => ({ name: e.node.name.full, role: e.role })),
    readLinks: (() => {
      // publisher links AniList lists for the English edition (curated); only http(s) links, no social accounts
      const out: { site: string; url: string | null }[] = [];
      for (const l of m.externalLinks ?? []) if (l.type !== "SOCIAL" && l.language === "English" && /^https:\/\//.test(l.url ?? "") && !out.some((o) => o.site === l.site)) out.push({ site: l.site === "Official Site" ? "Official English site" : l.site, url: l.url });
      for (const site of base.official) if (!out.some((o) => o.site === site)) out.push({ site, url: null });
      return out;
    })(),
    recommendations: annotate((m.recommendations?.nodes ?? []).map((n: any) => n.mediaRecommendation).filter((x: any) => x && !x.isAdult).map(card)),
  };
}

export async function worldHome() {
  const sec = (vars: any) => worldSearch({ perPage: 20, extras: false, ...vars }).then((r) => r.items.slice(0, 15));
  const [trending, manhwa, manga, manhua, top] = await Promise.all([
    sec({ sort: "trending" }), sec({ sort: "trending", type: "manhwa" }), sec({ sort: "popular", type: "manga" }), sec({ sort: "trending", type: "manhua" }), sec({ sort: "score" }),
  ]);
  return { trending, manhwa, manga, manhua, top };
}

export const WORLD_GENRES = SAFE_GENRES;
