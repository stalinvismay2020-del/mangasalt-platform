import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const SERIES_TYPES = ["manga", "manhwa", "manhua", "comic"] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarHue: integer("avatar_hue").notNull().default(0),
  isCreator: integer("is_creator").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
});

export const series = sqliteTable("series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull(), // manga | manhwa | manhua
  genres: text("genres").notNull().default("[]"), // JSON string[]
  synopsis: text("synopsis").notNull(),
  cover: text("cover").notNull(),
  creatorId: integer("creator_id").notNull(),
  status: text("status").notNull().default("ongoing"),
  views: integer("views").notNull().default(0),
  rights: text("rights").notNull().default("original"), // original | licensed
  createdAt: integer("created_at").notNull(),
});

export const chapters = sqliteTable("chapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seriesId: integer("series_id").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  pages: text("pages").notNull().default("[]"), // JSON string[]
  createdAt: integer("created_at").notNull(),
});

export const seriesLikes = sqliteTable("series_likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  seriesId: integer("series_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seriesId: integer("series_id").notNull(),
  chapterId: integer("chapter_id"),
  parentId: integer("parent_id"),
  userId: integer("user_id").notNull(),
  body: text("body").notNull(),
  spoiler: integer("spoiler").notNull().default(0),
  hidden: integer("hidden").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const commentLikes = sqliteTable("comment_likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  commentId: integer("comment_id").notNull(),
});

export const follows = sqliteTable("follows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  targetType: text("target_type").notNull(), // series | creator
  targetId: integer("target_id").notNull(),
});

export const bookmarks = sqliteTable("bookmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  seriesId: integer("series_id").notNull(),
  chapterId: integer("chapter_id").notNull(),
  page: integer("page").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const readingLists = sqliteTable("reading_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
});

export const readingListItems = sqliteTable("reading_list_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listId: integer("list_id").notNull(),
  seriesId: integer("series_id").notNull(),
});

export const history = sqliteTable("history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  seriesId: integer("series_id").notNull(),
  chapterId: integer("chapter_id"),
  viewedAt: integer("viewed_at").notNull(),
});

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commentId: integer("comment_id").notNull(),
  userId: integer("user_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ---------- Insert / validation schemas ----------
import { normalizeUsername, USERNAME_RE } from "./username";
export { normalizeUsername, USERNAME_RE };
export const signupSchema = z.object({
  username: z.preprocess(normalizeUsername, z.string({ message: "Choose a username" })
    .min(3, "Username needs at least 3 characters").max(24, "Username can be at most 24 characters")
    .regex(USERNAME_RE, "Username can use letters, numbers, _ . and - only")),
  password: z.string({ message: "Choose a password" }).min(6, "Password needs at least 6 characters").max(100, "Password can be at most 100 characters"),
  displayName: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ message: "Enter your name" }).min(1, "Enter your name").max(40, "Name can be at most 40 characters")),
});
export const loginSchema = z.object({ username: z.preprocess(normalizeUsername, z.string().min(1)), password: z.string().min(1) });

export const insertCommentSchema = createInsertSchema(comments)
  .omit({ id: true, userId: true, hidden: true, createdAt: true })
  .extend({ body: z.string().min(1).max(2000) });
export const insertReportSchema = z.object({ reason: z.string().min(3).max(300) });

export type User = typeof users.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

// ---------- API response shapes ----------
export type PublicUser = Pick<User, "id" | "username" | "displayName" | "bio" | "avatarHue" | "isCreator">;

export type SeriesCard = {
  id: number;
  slug: string;
  title: string;
  type: SeriesType;
  genres: string[];
  synopsis: string;
  cover: string;
  status: string;
  views: number;
  rights: string;
  likes: number;
  recentLikes: number;
  chapterCount: number;
  latestChapter: number;
  latestChapterAt: number;
  creator: PublicUser;
  likedByMe: boolean;
  savedByMe: boolean;
  followedByMe: boolean;
  rating: number;
  year: number;
  readable: boolean;
  lastChapter?: { id: number; number: number; title: string } | null;
};

export type CreatorCard = PublicUser & { seriesCount: number; followers: number; totalLikes: number; followedByMe: boolean };

export type DiscussionItem = {
  id: number;
  body: string;
  spoiler: boolean;
  likes: number;
  replies: number;
  createdAt: number;
  user: PublicUser;
  series: { id: number; slug: string; title: string; cover: string; type: string };
};

export type HomeData = {
  featured: SeriesCard[];
  trending: SeriesCard[];
  topLiked: SeriesCard[];
  latest: SeriesCard[];
  creators: CreatorCard[];
  discussions: DiscussionItem[];
  stats: { series: number; chapters: number; creators: number; readers: number };
  recent: SeriesCard[];
};

export type LibraryData = {
  continueReading: SeriesCard[];
  saved: SeriesCard[];
  following: SeriesCard[];
  followedCreators: PublicUser[];
  counts: { likes: number; comments: number; read: number };
};

export type ChapterListItem = { id: number; number: number; title: string; pageCount: number; createdAt: number; read: boolean; thumb: string | null };
export type SeriesDetail = { series: SeriesCard; chapters: ChapterListItem[]; resume: { id: number; number: number } | null; bookmarks: { chapterId: number; page: number; number: number; title: string }[] };
export type ChapterData = {
  chapter: { id: number; number: number; title: string; pages: string[] };
  series: { id: number; slug: string; title: string; type: string; rights: string; cover: string; creator: PublicUser; chapterCount: number };
  prev: { id: number; number: number } | null;
  next: { id: number; number: number } | null;
  bookmark: number | null;
};
export type CommentItem = { id: number; body: string; spoiler: boolean; likes: number; likedByMe: boolean; createdAt: number; user: PublicUser; parentId: number | null; replies: CommentItem[] };
