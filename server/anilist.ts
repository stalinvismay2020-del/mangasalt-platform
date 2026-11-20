// AniList GraphQL client: worldwide manga / manhwa / manhua catalogue (metadata only).
// Chapters of licensed titles are NOT hosted here. Every title is listed; `official` names its verified English publishers (empty = none found yet).
import { officialCache } from "./storage";
import { mangadexEnglish } from "./mangadex";
import { backupSearch } from "./dawghwa";
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
  let res: Response | undefined, json: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }) });
      if (res.status === 429) break;
      json = await res.json();
      break;
    } catch {
      // network hiccup or empty body: retry with a short backoff
      json = undefined;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (!res || (res.status !== 429 && !json)) {
    if (hit) return hit.v;
    throw Object.assign(new Error("Catalogue is temporarily unavailable, try again"), { status: 503 });
  }
  if (res.status === 429) {
    blockedUntil = Date.now() + (Number(res.headers.get("retry-after")) || 30) * 1000;
    if (hit) return hit.v;
    throw Object.assign(new Error("AniList is busy, try again in a moment"), { status: 503 });
  }
  if (json.errors?.length) throw Object.assign(new Error(json.errors[0].message), { status: res.status === 404 ? 404 : 502 });
  cache.set(key, { t: Date.now(), v: json.data });
  if (cache.size > 800) cache.delete(cache.keys().next().value!);
  return json.data;
}

const CARD = `id title { english romaji } bannerImage description(asHtml:false) coverImage { extraLarge large color } countryOfOrigin format status chapters averageScore popularity genres startDate { year } externalLinks { site url type language }`;
const SAFE_GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
const SORTS: Record<string, string[]> = {
  trending: ["TRENDING_DESC", "POPULARITY_DESC"], popular: ["POPULARITY_DESC"], score: ["SCORE_DESC"], new: ["START_DATE_DESC"], match: ["SEARCH_MATCH"], az: ["TITLE_ENGLISH"],
  chapters: ["CHAPTERS_DESC"],
};
const STATUS: Record<string, string> = { ongoing: "RELEASING", completed: "FINISHED", hiatus: "HIATUS", upcoming: "NOT_YET_RELEASED", cancelled: "CANCELLED" };
const COUNTRY: Record<string, string> = { manga: "JP", manhwa: "KR", manhua: "CN" };

export type WorldCard = {
  id: number; title: string; altTitle: string | null; cover: string; color: string | null; type: "manga" | "manhwa" | "manhua" | "comic";
  status: string; chapters: number | null; score: number | null; popularity: number; genres: string[]; year: number | null; banner: string | null; blurb: string;
  official: string[];
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
    banner: m.bannerImage ?? null, blurb: clean(m.description).slice(0, 320), official: englishSites(m),
  };
}

/** Look up official English publishers. AniList first; if it lists none, ask MangaDex in the background. Titles are never hidden. */
let mdQueue: Promise<any> = Promise.resolve();
const pending = new Map<number, Promise<string[] | null | undefined>>();
function lookup(c: WorldCard): Promise<string[] | null | undefined> {
  if (pending.has(c.id)) return pending.get(c.id)!;
  // serialise MangaDex lookups (rate limit ~5 req/s)
  const job = mdQueue.then(() => mangadexEnglish(c.id, [c.title, c.altTitle ?? ""]).catch(() => undefined)).then((site) => {
    if (site !== undefined) officialCache.set(c.id, site ? [site] : null);
    pending.delete(c.id);
    return site === undefined ? undefined : site ? [site] : null;
  });
  mdQueue = job.then(() => new Promise((r) => setTimeout(r, 220)));
  pending.set(c.id, job);
  return job;
}
async function annotate(c: WorldCard, waitMs: number): Promise<WorldCard> {
  if (c.official.length) { officialCache.set(c.id, c.official); return c; }
  const known = officialCache.get(c.id);
  if (known) return { ...c, official: known };
  if (known === null) return c;
  const found = await Promise.race([lookup(c), new Promise<undefined>((r) => setTimeout(() => r(undefined), waitMs))]);
  return found ? { ...c, official: found } : c;
}
export async function withOfficial(cards: WorldCard[], waitMs = 1200): Promise<WorldCard[]> {
  return Promise.all(cards.map((c) => annotate(c, waitMs)));
}

export async function worldSearch(o: { q?: string; genres?: string[]; type?: string; status?: string; sort?: string; page?: number; perPage?: number }) {
  const sort = SORTS[o.sort ?? (o.q ? "match" : "trending")] ?? SORTS.trending;
  const vars: any = { page: o.page ?? 1, perPage: Math.min(o.perPage ?? 24, 50), sort: o.q || sort[0] !== "SEARCH_MATCH" ? sort : ["POPULARITY_DESC"] };
  if (o.q) vars.search = o.q;
  const g = (o.genres ?? []).filter((x) => SAFE_GENRES.includes(x));
  if (g.length) vars.genres = g;
  if (o.type && COUNTRY[o.type]) vars.country = COUNTRY[o.type];
  if (o.status && STATUS[o.status]) vars.status = STATUS[o.status];
  const q = `query ($page:Int,$perPage:Int,$search:String,$genres:[String],$country:CountryCode,$status:MediaStatus,$sort:[MediaSort]) {
    Page(page:$page, perPage:$perPage) { pageInfo { hasNextPage total currentPage }
      media(type:MANGA, isAdult:false, search:$search, genre_in:$genres, genre_not_in:["Hentai","Ecchi"], countryOfOrigin:$country, status:$status, sort:$sort, format_not:NOVEL) { ${CARD} } } }`;
  let d: any;
  try { d = await gql(q, vars); }
  catch (e: any) {
    // AniList busy or down: fall back to the Dawghwa catalogue (same AniList ids) so the app keeps working
    if (e?.status === 404) throw e;
    try { return await backupSearch(o); } catch { throw e; }
  }
  return { items: await withOfficial(d.Page.media.map(card)), hasNext: d.Page.pageInfo.hasNextPage, page: d.Page.pageInfo.currentPage, total: d.Page.pageInfo.total };
}

export async function worldTitle(id: number) {
  const q = `query ($id:Int) { Media(id:$id, type:MANGA) { ${CARD} isAdult bannerImage description(asHtml:false) volumes synonyms
    tags { name rank isMediaSpoiler } siteUrl
    staff(perPage:4, sort:RELEVANCE) { edges { role node { name { full } } } }
    externalLinks { site url type language color icon }
    recommendations(perPage:10, sort:RATING_DESC) { nodes { mediaRecommendation { ${CARD} isAdult } } } } }`;
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error("Title not found"), { status: 404 });
  const d = await gql(q, { id }).catch((e: any) => { if (/not found/i.test(e.message)) e.status = 404; throw e; });
  const m = d?.Media;
  if (!m || m.isAdult) throw Object.assign(new Error("Title not found"), { status: 404 });
  const base = (await withOfficial([card(m)], 4000))[0];
  const tapasUrl = (m.externalLinks ?? []).find((l: any) => /tapas\.io\/series\//.test(l.url ?? "") && l.language === "English")?.url ?? null;
  return {
    ...base, tapasUrl,
    banner: m.bannerImage, volumes: m.volumes, siteUrl: m.siteUrl,
    description: clean(m.description),
    tags: (m.tags ?? []).filter((t: any) => !t.isMediaSpoiler).slice(0, 8).map((t: any) => t.name),
    staff: (m.staff?.edges ?? []).map((e: any) => ({ name: e.node.name.full, role: e.role })),
    readLinks: base.official.map((site) => ({ site })),
    recommendations: await withOfficial((m.recommendations?.nodes ?? []).map((n: any) => n.mediaRecommendation).filter((x: any) => x && !x.isAdult).map(card), 800),
  };
}

export async function worldHome() {
  const sec = (vars: any) => worldSearch({ perPage: 20, ...vars }).then((r) => r.items.slice(0, 15));
  const [trending, manhwa, manga, manhua, top] = await Promise.all([
    sec({ sort: "trending" }), sec({ sort: "trending", type: "manhwa" }), sec({ sort: "popular", type: "manga" }), sec({ sort: "trending", type: "manhua" }), sec({ sort: "score" }),
  ]);
  return { trending, manhwa, manga, manhua, top };
}

export const WORLD_GENRES = SAFE_GENRES;
