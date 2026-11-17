export type WorldCard = {
  id: number; title: string; altTitle: string | null; cover: string; color: string | null; type: "manga" | "manhwa" | "manhua" | "comic";
  status: string; chapters: number | null; score: number | null; popularity: number; genres: string[]; year: number | null; banner: string | null; blurb: string;
};
export type WorldPage = { items: WorldCard[]; hasNext: boolean; page: number; total: number };
export type WorldHome = { trending: WorldCard[]; manhwa: WorldCard[]; manga: WorldCard[]; manhua: WorldCard[]; top: WorldCard[] };
export type WorldDetail = WorldCard & {
  volumes: number | null; siteUrl: string; description: string; tags: string[]; staff: { name: string; role: string }[];
  readLinks: { site: string }[]; recommendations: WorldCard[];
  likes: number; likedByMe: boolean; savedByMe: boolean; lastChapter: string | null; readChapters: string[];
};
export type WorldChapter = { key: string; number: string; title: string | null; publishedAt: string; inApp: boolean; publisher: string | null; src: string | null };
export type WorldChapters = { found: boolean; total: number; inApp: number; chapters: WorldChapter[] };
export type WorldShelfItem = { id: number; title: string; cover: string; type: string; color: string | null; chapter: string | null };
