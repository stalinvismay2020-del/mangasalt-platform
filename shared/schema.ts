import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const SERIES_TYPES = ["manga", "manhwa", "manhua"] as const;
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
export const signupSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/i, "Letters, numbers and underscores only"),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(40),
});
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

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
