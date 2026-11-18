// Shared types and definitions for shelves, social, stats, achievements, calendar, notifications and admin.
import type { PublicUser } from "./schema";

export type Role = "user" | "moderator" | "admin";
export const isStaff = (u?: { role?: string } | null) => u?.role === "admin" || u?.role === "moderator";
export const isAdmin = (u?: { role?: string } | null) => u?.role === "admin";

// ---------- Shelves, collections and favourites ----------
export type ShelfKind = "favourites" | "status" | "custom" | "collection";
export type ShelfItem = { key: string; kind: "local" | "world"; id: number; title: string; cover: string; type: string; href: string; addedAt: number };
export type Shelf = {
  id: number; name: string; description: string; kind: ShelfKind; visibility: "private" | "public";
  count: number; covers: string[]; updatedAt: number; owner?: PublicUser; items?: ShelfItem[]; isMine?: boolean;
};
export const STATUS_SHELVES = ["Reading", "Plan to read", "Completed", "Dropped"] as const;

// ---------- Reading stats ----------
export type FullStats = {
  chapters: number; titles: number; streak: number; bestStreak: number; activeDays: number;
  thisWeek: number; thisMonth: number; thisYear: number;
  week: { day: number; count: number }[];
  last30: { day: number; count: number }[];
  byType: { type: string; count: number }[];
  topTitles: { key: string; title: string; cover: string; href: string; chapters: number }[];
  byHour: number[];
};

// ---------- Timeline ----------
export type TimelineEvent = {
  id: string; at: number;
  kind: "read" | "saved" | "liked" | "favourite" | "comment" | "badge" | "follow" | "published";
  title: string; detail?: string; cover?: string; href?: string; count?: number;
};

// ---------- Achievements ----------
export type BadgeStats = { chapters: number; titles: number; bestStreak: number; shelves: number; publicShelves: number; favourites: number; comments: number; followers: number; following: number; published: number; days: number; types: number };
export type BadgeDef = { id: string; name: string; description: string; icon: string; tier: "bronze" | "silver" | "gold" | "special"; test: (s: BadgeStats) => boolean; progress?: (s: BadgeStats) => [number, number] };
export const BADGES: BadgeDef[] = [
  { id: "first-chapter", name: "First page", description: "Read your first chapter", icon: "BookOpen", tier: "bronze", test: (s) => s.chapters >= 1, progress: (s) => [Math.min(s.chapters, 1), 1] },
  { id: "chapters-25", name: "Page turner", description: "Read 25 chapters", icon: "BookOpen", tier: "bronze", test: (s) => s.chapters >= 25, progress: (s) => [Math.min(s.chapters, 25), 25] },
  { id: "chapters-100", name: "Bookworm", description: "Read 100 chapters", icon: "BookMarked", tier: "silver", test: (s) => s.chapters >= 100, progress: (s) => [Math.min(s.chapters, 100), 100] },
  { id: "chapters-500", name: "Binge master", description: "Read 500 chapters", icon: "Library", tier: "gold", test: (s) => s.chapters >= 500, progress: (s) => [Math.min(s.chapters, 500), 500] },
  { id: "titles-10", name: "Explorer", description: "Start 10 different titles", icon: "Compass", tier: "silver", test: (s) => s.titles >= 10, progress: (s) => [Math.min(s.titles, 10), 10] },
  { id: "all-types", name: "World reader", description: "Read manga, manhwa and manhua", icon: "Globe2", tier: "silver", test: (s) => s.types >= 3, progress: (s) => [Math.min(s.types, 3), 3] },
  { id: "streak-3", name: "Warming up", description: "Keep a 3-day reading streak", icon: "Flame", tier: "bronze", test: (s) => s.bestStreak >= 3, progress: (s) => [Math.min(s.bestStreak, 3), 3] },
  { id: "streak-7", name: "On fire", description: "Keep a 7-day reading streak", icon: "Flame", tier: "silver", test: (s) => s.bestStreak >= 7, progress: (s) => [Math.min(s.bestStreak, 7), 7] },
  { id: "streak-30", name: "Unstoppable", description: "Keep a 30-day reading streak", icon: "Flame", tier: "gold", test: (s) => s.bestStreak >= 30, progress: (s) => [Math.min(s.bestStreak, 30), 30] },
  { id: "curator", name: "Curator", description: "Create your own shelf or collection", icon: "FolderHeart", tier: "bronze", test: (s) => s.shelves >= 1, progress: (s) => [Math.min(s.shelves, 1), 1] },
  { id: "tastemaker", name: "Tastemaker", description: "Share a public reading list", icon: "Share2", tier: "silver", test: (s) => s.publicShelves >= 1, progress: (s) => [Math.min(s.publicShelves, 1), 1] },
  { id: "favourites-10", name: "Heart collector", description: "Add 10 favourites", icon: "Star", tier: "bronze", test: (s) => s.favourites >= 10, progress: (s) => [Math.min(s.favourites, 10), 10] },
  { id: "first-comment", name: "Voice", description: "Post your first comment", icon: "MessageCircle", tier: "bronze", test: (s) => s.comments >= 1, progress: (s) => [Math.min(s.comments, 1), 1] },
  { id: "social", name: "Social reader", description: "Follow 5 readers", icon: "Users", tier: "bronze", test: (s) => s.following >= 5, progress: (s) => [Math.min(s.following, 5), 5] },
  { id: "followers-10", name: "Rising star", description: "Get 10 followers", icon: "Sparkles", tier: "silver", test: (s) => s.followers >= 10, progress: (s) => [Math.min(s.followers, 10), 10] },
  { id: "creator", name: "Creator", description: "Publish an approved series", icon: "PenTool", tier: "special", test: (s) => s.published >= 1, progress: (s) => [Math.min(s.published, 1), 1] },
  { id: "veteran", name: "Veteran", description: "Be a member for a year", icon: "Award", tier: "gold", test: (s) => s.days >= 365, progress: (s) => [Math.min(s.days, 365), 365] },
];
export type EarnedBadge = { id: string; name: string; description: string; icon: string; tier: BadgeDef["tier"]; earned: boolean; earnedAt: number | null; progress: [number, number] };

// ---------- Reader profiles ----------
export type ReaderProfile = {
  user: PublicUser & { createdAt: number; country: string | null };
  followers: number; following: number; followedByMe: boolean; isMe: boolean; isPrivate: boolean;
  shelves: Shelf[]; badges: EarnedBadge[];
  stats: { chapters: number; titles: number; streak: number } | null;
  timeline: TimelineEvent[] | null;
};
export type ReaderCard = PublicUser & { followers: number; chapters: number; followedByMe: boolean };

// ---------- Release calendar ----------
export type CalendarEvent = {
  id: string; at: number; title: string; chapter: string; cover: string; href: string;
  source: "mangasalt" | "official"; publisher: string; origin: string; type: string;
  upcoming: boolean; regions: string; mine: boolean;
};

// ---------- Regions ----------
export const COUNTRIES: [string, string][] = [
  ["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"],
  ["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"], ["TW", "Taiwan"], ["HK", "Hong Kong"], ["SG", "Singapore"],
  ["MY", "Malaysia"], ["ID", "Indonesia"], ["PH", "Philippines"], ["TH", "Thailand"], ["VN", "Vietnam"], ["BD", "Bangladesh"],
  ["PK", "Pakistan"], ["LK", "Sri Lanka"], ["NP", "Nepal"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["EG", "Egypt"],
  ["NG", "Nigeria"], ["ZA", "South Africa"], ["KE", "Kenya"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"],
  ["NL", "Netherlands"], ["SE", "Sweden"], ["PL", "Poland"], ["TR", "Türkiye"], ["RU", "Russia"], ["BR", "Brazil"], ["MX", "Mexico"],
  ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"],
];
export const countryName = (c?: string | null) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c ?? "";
/** regions: '' = worldwide, 'only:IN,US' = allow list, 'except:CN' = block list */
export function parseRegions(r: string | null | undefined): { mode: "all" | "only" | "except"; codes: string[] } {
  const m = String(r ?? "").match(/^(only|except):([A-Z,]*)$/);
  if (!m) return { mode: "all", codes: [] };
  const codes = m[2].split(",").filter(Boolean);
  return codes.length ? { mode: m[1] as "only" | "except", codes } : { mode: "all", codes: [] };
}
export function regionAllowed(r: string | null | undefined, country: string | null | undefined) {
  const p = parseRegions(r);
  if (p.mode === "all" || !country) return true;
  return p.mode === "only" ? p.codes.includes(country) : !p.codes.includes(country);
}
export function regionLabel(r: string | null | undefined) {
  const p = parseRegions(r);
  if (p.mode === "all") return "Available worldwide";
  const names = p.codes.map(countryName).join(", ");
  return p.mode === "only" ? `Only in ${names}` : `Everywhere except ${names}`;
}

// ---------- Notifications ----------
export type NotificationType = "chapter" | "reply" | "follow" | "approval" | "badge" | "system" | "moderation";
export type NotificationItem = { id: number; type: NotificationType; title: string; body: string; link: string | null; read: boolean; createdAt: number; actor?: PublicUser | null };
export type NotifyPrefs = { chapter: boolean; reply: boolean; follow: boolean; badge: boolean; system: boolean; browser: boolean };
export const DEFAULT_PREFS: NotifyPrefs = { chapter: true, reply: true, follow: true, badge: true, system: true, browser: false };

// ---------- Admin ----------
export type AdminOverview = {
  totals: { users: number; creators: number; series: number; chapters: number; comments: number; readsToday: number; activeToday: number; active7: number; active30: number; newUsers7: number };
  queues: { pendingSeries: number; pendingChapters: number; openReports: number; openTakedowns: number; spam: number };
  daily: { day: string; signups: number; reads: number; comments: number; active: number }[];
  topSeries: { id: number; slug: string; title: string; cover: string; reads: number; likes: number }[];
  topWorld: { id: number; title: string; cover: string; reads: number }[];
  byType: { type: string; reads: number }[];
  byCountry: { country: string; users: number }[];
};
export type HealthReport = {
  status: "ok" | "degraded" | "down"; uptime: number; node: string; pid: number; platform: string;
  memory: { rss: number; heapUsed: number; heapTotal: number; systemFree: number; systemTotal: number };
  load: number[]; cpus: number;
  disk: { dbBytes: number; walBytes: number; uploadsBytes: number; uploadsFiles: number; backupsBytes: number; freeBytes: number | null; totalBytes: number | null };
  requests: { total: number; perMinute: number; errors5xx: number; errors4xx: number; avgMs: number; p95Ms: number; slowest: { path: string; ms: number }[] };
  recentErrors: { at: number; method: string; path: string; status: number; message: string }[];
  services: { name: string; ok: boolean; ms: number | null; detail: string }[];
  db: { integrity: string; tables: { name: string; rows: number }[] };
  lastBackup: number | null;
};
export type BackupFile = { name: string; bytes: number; createdAt: number; auto: boolean };
export type ModLog = { id: number; at: number; actor: PublicUser | null; action: string; targetType: string; targetId: string; details: string };
