export type WorldCard = {
  id: number; title: string; altTitle: string | null; cover: string; color: string | null; type: "manga" | "manhwa" | "manhua" | "comic";
  status: string; chapters: number | null; score: number | null; popularity: number; genres: string[]; year: number | null; banner: string | null; blurb: string;
  official: string[];
};
export type WorldPage = { items: WorldCard[]; hasNext: boolean; page: number; total: number };
export type WorldHome = { trending: WorldCard[]; manhwa: WorldCard[]; manga: WorldCard[]; manhua: WorldCard[]; top: WorldCard[] };
export type WorldDetail = WorldCard & {
  volumes: number | null; siteUrl: string; description: string; tags: string[]; staff: { name: string; role: string }[];
  readLinks: { site: string }[]; recommendations: WorldCard[];
  likes: number; likedByMe: boolean; savedByMe: boolean; lastChapter: string | null; readChapters: string[];
};
export type WorldChapter = { key: string; number: string; title: string | null; publishedAt: string | null; inApp: boolean; publisher: string | null; src: string | null; access: "free" | "wait" | "coins" | null };
export type WorldChapters = { found: boolean; total: number; inApp: number; chapters: WorldChapter[]; publishers: string[] };
export type ReadingStats = { chapters: number; titles: number; streak: number; activeDays: number; week: { day: number; count: number }[] };
export type WorldShelfItem = { id: number; title: string; cover: string; type: string; color: string | null; chapter: string | null };
