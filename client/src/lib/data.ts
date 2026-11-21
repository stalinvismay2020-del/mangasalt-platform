// Supabase data access for MANGASALT-hosted series and personal data.
// Every call goes through row-level security as the signed-in user.
import { supabase, errMsg } from "./supabase";

function check<T>(r: { data: T; error: any }, what: string): T {
  if (r.error) { console.error(`[db] ${what}`, r.error); throw new Error(errMsg(r.error)); }
  return r.data;
}

// ── hosted library ─────────────────────────────────────────────────────────
export type HostedSeries = {
  id: string; slug: string; title: string; kind: string; synopsis: string; author: string; artist: string;
  genres: string[]; tags: string[]; cover_path: string | null; banner_path: string | null; status: string; language: string | null;
  rights: string; attribution: string; license_url: string | null; copyright_notice: string | null;
  likes: number; views: number; comments: number; bookmarks: number; chapters: number; last_update: string | null;
};
export type HostedChapter = { id: string; series_id: string; number: number; title: string; pages: string[]; published: boolean; published_at: string | null };

export const hostedKey = (slug: string) => `ms-${slug}`;

export async function listHosted(opts: { q?: string; genre?: string; kind?: string; sort?: "popular" | "new"; limit?: number } = {}): Promise<HostedSeries[]> {
  let q = supabase.from("series_cards").select("*");
  if (opts.q) q = q.ilike("search_text", `%${opts.q.toLowerCase().replace(/[%_]/g, "")}%`);
  if (opts.genre) q = q.contains("genres", [opts.genre]);
  if (opts.kind) q = q.eq("kind", opts.kind);
  q = opts.sort === "new" ? q.order("last_update", { ascending: false }) : q.order("popularity", { ascending: false });
  return check(await q.limit(opts.limit ?? 24), "listHosted") as HostedSeries[];
}

export async function getHosted(slug: string): Promise<HostedSeries | null> {
  return check(await supabase.from("series_cards").select("*").eq("slug", slug).maybeSingle(), "getHosted") as HostedSeries | null;
}

export async function getHostedChapters(seriesId: string): Promise<HostedChapter[]> {
  const rows = check(await supabase.from("hosted_chapters").select("id,series_id,number,title,pages,published,published_at")
    .eq("series_id", seriesId).eq("published", true).order("number", { ascending: true }).limit(2000), "getHostedChapters") as any[];
  return rows.map((r) => ({ ...r, number: Number(r.number), pages: Array.isArray(r.pages) ? r.pages : [] }));
}

export async function hostedForAnilist(ids: number[]): Promise<Record<number, { slug: string; chapters: number }>> {
  if (!ids.length) return {};
  const rows = check(await supabase.rpc("hosted_for_anilist", { p_ids: ids }), "hostedForAnilist") as any[];
  return Object.fromEntries(rows.map((r) => [r.anilist_id, { slug: r.slug, chapters: r.chapters }]));
}

export async function recordView(chapterId: string, clientId: string) {
  const { error } = await supabase.rpc("record_chapter_view", { p_chapter: chapterId, p_client: clientId });
  if (error) console.warn("[db] record view", error.message);
}

// ── bookmarks (library) ────────────────────────────────────────────────────
export type Bookmark = { id: number; series_key: string; title: string | null; cover: string | null; kind: string | null; href: string | null; series_id: string | null; created_at: string };
export async function listBookmarks(uid: string): Promise<Bookmark[]> {
  return check(await supabase.from("bookmarks").select("*").eq("visitor_id", uid).order("created_at", { ascending: false }).limit(500), "listBookmarks") as Bookmark[];
}
export async function isBookmarked(uid: string, key: string): Promise<boolean> {
  const r = check(await supabase.from("bookmarks").select("id").eq("visitor_id", uid).eq("series_key", key).maybeSingle(), "isBookmarked");
  return !!r;
}
export async function setBookmark(uid: string, on: boolean, b: { series_key: string; title: string; cover: string | null; kind: string | null; href: string; series_id?: string | null }) {
  if (on) check(await supabase.from("bookmarks").upsert({ visitor_id: uid, ...b, series_id: b.series_id ?? null }, { onConflict: "visitor_id,series_key" }), "addBookmark");
  else check(await supabase.from("bookmarks").delete().eq("visitor_id", uid).eq("series_key", b.series_key), "removeBookmark");
}

// ── reading progress (resume point per series) ─────────────────────────────
export type Progress = { series_key: string; series_title: string | null; cover: string | null; chapter_key: string | null; chapter_label: string | null; page: number; total_pages: number; updated_at: string; href: string | null; chapter_number: number | null; series_id: string | null };
export async function getProgress(uid: string, key: string): Promise<Progress | null> {
  return check(await supabase.from("reading_progress").select("*").eq("visitor_id", uid).eq("series_key", key).maybeSingle(), "getProgress") as Progress | null;
}
export async function listProgress(uid: string, limit = 50): Promise<Progress[]> {
  return check(await supabase.from("reading_progress").select("*").eq("visitor_id", uid).order("updated_at", { ascending: false }).limit(limit), "listProgress") as Progress[];
}
export type ReadPoint = {
  series_key: string; series_title: string; cover: string | null; chapter_key: string; chapter_label: string; chapter_number: number;
  page: number; total_pages: number; href: string; series_id: string; chapter_id: string;
};
export async function saveProgress(uid: string, p: ReadPoint) {
  const now = new Date().toISOString();
  const a = await supabase.from("reading_progress").upsert({
    visitor_id: uid, series_key: p.series_key, series_title: p.series_title, cover: p.cover, chapter_key: p.chapter_key, chapter_label: p.chapter_label,
    page: p.page, total_pages: p.total_pages, updated_at: now, series_id: p.series_id, chapter_id: p.chapter_id, chapter_number: p.chapter_number, href: p.href,
  }, { onConflict: "visitor_id,series_key" });
  const b = await supabase.from("chapter_reads").upsert({
    user_id: uid, series_key: p.series_key, chapter_key: p.chapter_key, series_title: p.series_title, chapter_label: p.chapter_label,
    cover: p.cover, href: p.href, page: p.page, total_pages: p.total_pages, read_at: now,
  }, { onConflict: "user_id,series_key,chapter_key" });
  check(a, "saveProgress"); check(b, "saveRead");
}

// ── history ────────────────────────────────────────────────────────────────
export type ReadRow = { series_key: string; chapter_key: string; series_title: string | null; chapter_label: string | null; cover: string | null; href: string | null; page: number; total_pages: number; read_at: string };
export async function listReads(uid: string, limit = 60, offset = 0): Promise<ReadRow[]> {
  return check(await supabase.from("chapter_reads").select("*").eq("user_id", uid).order("read_at", { ascending: false }).range(offset, offset + limit - 1), "listReads") as ReadRow[];
}
export async function readKeysFor(uid: string, seriesKey: string): Promise<Set<string>> {
  const rows = check(await supabase.from("chapter_reads").select("chapter_key").eq("user_id", uid).eq("series_key", seriesKey).limit(5000), "readKeys") as any[];
  return new Set(rows.map((r) => r.chapter_key));
}
export async function deleteRead(uid: string, seriesKey: string, chapterKey: string) {
  check(await supabase.from("chapter_reads").delete().eq("user_id", uid).eq("series_key", seriesKey).eq("chapter_key", chapterKey), "deleteRead");
}
export async function clearHistory(uid: string) {
  check(await supabase.from("chapter_reads").delete().eq("user_id", uid), "clearHistory");
  check(await supabase.from("reading_progress").delete().eq("visitor_id", uid), "clearProgress");
}

// ── likes ──────────────────────────────────────────────────────────────────
export async function likeState(ids: number[]): Promise<Record<number, { count: number; liked: boolean }>> {
  if (!ids.length) return {};
  const rows = check(await supabase.rpc("like_state", { p_visitor: "", p_ids: ids }), "likeState") as any[];
  return Object.fromEntries(rows.map((r) => [r.media_id, { count: Number(r.count), liked: !!r.liked }]));
}
export async function toggleTitleLike(id: number, title: string, cover: string | null, kind: string | null): Promise<{ liked: boolean; count: number }> {
  return check(await supabase.rpc("toggle_title_like", { p_media: id, p_title: title, p_cover: cover ?? "", p_kind: kind ?? "" }), "toggleTitleLike") as any;
}
export async function seriesLiked(uid: string, seriesId: string): Promise<boolean> {
  return !!check(await supabase.from("likes").select("id").eq("visitor_id", uid).eq("series_id", seriesId).maybeSingle(), "seriesLiked");
}
export async function toggleSeriesLike(seriesId: string): Promise<{ liked: boolean; count: number }> {
  return check(await supabase.rpc("toggle_series_like", { p_series: seriesId }), "toggleSeriesLike") as any;
}
export async function communityTop(limit = 10) {
  return check(await supabase.rpc("community_top", { p_limit: limit }), "communityTop") as { media_id: number; title: string; cover: string; kind: string; likes: number; likes_this_week: number }[];
}

// ── discussion ─────────────────────────────────────────────────────────────
export type Author = { id: string; name: string; hue: number };
export type CommentNode = {
  id: number; body: string; created_at: string; edited_at: string | null; spoiler: boolean; chapter_key?: string | null;
  is_hidden: boolean; hidden_reason: string; author: Author; likes: number; liked: boolean; mine: boolean; replies?: CommentNode[]; parent_id?: number;
};
export type Thread = { total: number; top_level: number; items: CommentNode[] };
export type Target = { seriesId?: string | null; mediaId?: number | null; chapterKey?: string | null; chapterId?: string | null; title?: string; cover?: string | null };

export async function getThread(t: Target, sort: "new" | "top", limit: number, chapterFilter: string | null): Promise<Thread> {
  return check(await supabase.rpc("comment_thread", {
    p_series: t.seriesId ?? null, p_media: t.seriesId ? null : t.mediaId ?? null, p_chapter: chapterFilter, p_sort: sort, p_limit: limit, p_offset: 0,
  }), "thread") as Thread;
}
export async function postComment(uid: string, t: Target, body: string, spoiler: boolean, parentId?: number) {
  const row: any = { visitor_id: uid, body, spoiler, parent_id: parentId ?? null };
  if (t.seriesId) { row.series_id = t.seriesId; row.chapter_id = t.chapterId ?? null; row.chapter_key = t.chapterKey ?? null; }
  else { row.media_id = t.mediaId; row.chapter_key = t.chapterKey ?? null; row.target_title = t.title ?? null; row.target_cover = t.cover ?? null; }
  check(await supabase.from("comments").insert(row), "postComment");
}
export async function editComment(id: number, body: string, spoiler: boolean) {
  check(await supabase.from("comments").update({ body, spoiler }).eq("id", id), "editComment");
}
export async function deleteComment(id: number) { check(await supabase.from("comments").delete().eq("id", id), "deleteComment"); }
export async function toggleCommentLike(id: number) { return check(await supabase.rpc("toggle_comment_like", { p_comment: id }), "likeComment") as { liked: boolean; count: number }; }
export async function reportTarget(uid: string, type: "comment" | "series" | "chapter" | "user", id: string, reason: string, details: string) {
  check(await supabase.from("reports").insert({ reporter_id: uid, target_type: type, target_id: id, reason, details }), "report");
}
export type FeedItem = { id: number; body: string; spoiler: boolean; created_at: string; chapter_key: string | null; series_id: string | null; media_id: number | null; slug: string | null; title: string | null; cover: string | null; author: Author; replies: number; likes: number };
export async function discussionFeed(limit = 20, offset = 0): Promise<FeedItem[]> {
  return check(await supabase.rpc("discussion_feed", { p_limit: limit, p_offset: offset }), "feed") as FeedItem[];
}

// ── profiles ───────────────────────────────────────────────────────────────
export async function profileSummary(id: string) {
  return check(await supabase.rpc("profile_summary", { p_user: id }), "profile") as null | { id: string; name: string; bio: string; hue: number; joined: string; comments: number; likes: number; role: string | null };
}
export async function userComments(id: string, limit = 20) {
  return check(await supabase.from("comments").select("id,body,spoiler,created_at,series_id,media_id,target_title,chapter_key,series_key").eq("visitor_id", id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(limit), "userComments") as any[];
}
export async function updateProfile(uid: string, p: { display_name: string; bio: string; avatar_hue: number }) {
  check(await supabase.from("profiles").upsert({ visitor_id: uid, ...p, updated_at: new Date().toISOString() }, { onConflict: "visitor_id" }), "updateProfile");
}

/** Where a saved progress row resumes. Older rows have no href, so derive it for hosted series. */
export function progressHref(p: Pick<Progress, "series_key" | "chapter_key" | "page" | "href">): string | null {
  if (!p.series_key.startsWith("ms-")) return null;
  if (p.href) return p.href;
  if (p.chapter_key && /^\d+(\.\d+)?$/.test(p.chapter_key)) return `/read/${p.series_key.slice(3)}/${p.chapter_key}?p=${(p.page ?? 0) + 1}`;
  return null;
}
/** Progress rows saved by the removed legacy external-reader integrations (series keyed by AniList id, chapter keys prefixed md-/tp-/mp-). */
export const isLegacyProgress = (p: Pick<Progress, "series_key" | "chapter_key">) => !p.series_key.startsWith("ms-") || /^(mp|tp|md)-/.test(p.chapter_key ?? "");
