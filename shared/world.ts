export type WorldCard = {
  id: number; title: string; altTitle: string | null; cover: string; color: string | null; type: "manga" | "manhwa" | "manhua" | "comic";
  status: string; chapters: number | null; score: number | null; popularity: number; genres: string[]; year: number | null; banner: string | null; blurb: string;
  official: string[];
  /** Which catalogue the title comes from. AniList when missing. */
  source?: "anilist" | "mangadex" | "mangasalt";
  /** in-app page for titles hosted by MANGASALT (overrides /title/:id) */
  href?: string;
};
export type WorldPage = { items: WorldCard[]; hasNext: boolean; page: number; total: number; /** how many items came from MangaDex */ extra?: number };
export type WorldHome = { trending: WorldCard[]; manhwa: WorldCard[]; manga: WorldCard[]; manhua: WorldCard[]; top: WorldCard[] };
export type WorldDetail = WorldCard & {
  volumes: number | null; siteUrl: string; mangadexId?: string; /** set when a MangaDex id turned out to be an AniList title */ movedTo?: number; description: string; tags: string[]; staff: { name: string; role: string }[];
  readLinks: { site: string; url: string | null }[]; recommendations: WorldCard[];
  likes: number; likedByMe: boolean; savedByMe: boolean; lastChapter: string | null; readChapters: string[];
};
export type ReadingStats = { chapters: number; titles: number; streak: number; activeDays: number; week: { day: number; count: number }[] };
export type WorldShelfItem = { id: number; title: string; cover: string; type: string; color: string | null; chapter: string | null; href?: string };
