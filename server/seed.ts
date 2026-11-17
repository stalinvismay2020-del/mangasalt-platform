import pepper from "@shared/pepper.json";
import { storage, hashPassword } from "./storage";

// Starter catalog: every series below is an ORIGINAL work created for MANGASALT.
// No third-party copyrighted manga is included. Creators upload their own work.
const DAY = 24 * 3600 * 1000;

const META: Record<string, [number, number, string]> = {
  "saltblade-ronin": [88, 2024, "ongoing"], "tidewitch-ledger": [86, 2024, "ongoing"], "neon-koi-requiem": [84, 2025, "ongoing"],
  "jade-ascension": [87, 2023, "ongoing"], "level-zero-hunter": [91, 2024, "ongoing"], "paper-lantern-cafe": [89, 2025, "completed"],
  "crimson-peony-court": [85, 2023, "hiatus"], "abyssal-gate-academy": [83, 2025, "ongoing"],
};
// Backfill new columns for databases created before rating/year existed (only touches default values).
export function backfillMeta() {
  const db = storage.raw();
  for (const [slug, [rt, yr, st]] of Object.entries(META))
    db.prepare(`UPDATE series SET rating = ?, year = ?, status = CASE WHEN status = 'ongoing' THEN ? ELSE status END WHERE slug = ? AND rating = 80 AND year = 2025`).run(rt, yr, st, slug);
}

export function seedIfEmpty() {
  if (!storage.isEmpty()) return;
  const db = storage.raw();
  const now = Date.now();
  const insUser = db.prepare(`INSERT INTO users (username, password, display_name, bio, avatar_hue, is_creator, created_at) VALUES (?,?,?,?,?,?,?)`);
  // Demo reader accounts only (no invented series or artwork). Password: reader123
  const readerNames = ["nightowl", "panelhopper", "saltyreader", "inkdrinker", "gatewalker", "koi_kid", "jadefan", "lantern_lux", "peonyqueen", "zero_simp", "bookwyrm", "otaku_ash", "manhwa_mira", "qi_master", "spoilerfree", "chapterchaser", "ronin_rei", "tidewatcher", "nova_reads", "pagewhisper"];
  readerNames.forEach((n, i) => insUser.run(n, hashPassword("reader123"), n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), "", (i * 37) % 360, 0, now - (150 - i) * DAY));
}

/** Remove the earlier AI-generated placeholder series and their invented creators. */
export function removePlaceholders() {
  const db = storage.raw();
  const slugs = Object.keys(META);
  const ids = db.prepare(`SELECT id FROM series WHERE slug IN (${slugs.map(() => "?").join(",")})`).all(...slugs).map((r: any) => r.id);
  if (ids.length) {
    const list = ids.join(",");
    db.exec(`DELETE FROM chapters WHERE series_id IN (${list}); DELETE FROM series_likes WHERE series_id IN (${list});
      DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE series_id IN (${list})); DELETE FROM comments WHERE series_id IN (${list});
      DELETE FROM reading_list_items WHERE series_id IN (${list}); DELETE FROM history WHERE series_id IN (${list}); DELETE FROM bookmarks WHERE series_id IN (${list});
      DELETE FROM follows WHERE target_type = 'series' AND target_id IN (${list}); DELETE FROM series WHERE id IN (${list});`);
  }
  const fake = ["kaito_mori", "seoyeon_han", "lin_qiao", "ryu_studio", "mei_aoki"];
  const uids = db.prepare(`SELECT id FROM users WHERE username IN (${fake.map(() => "?").join(",")})`).all(...fake).map((r: any) => r.id);
  if (uids.length) db.exec(`DELETE FROM follows WHERE target_type = 'creator' AND target_id IN (${uids.join(",")}); DELETE FROM users WHERE id IN (${uids.join(",")});`);
}

// ---------- Pepper&Carrot: real, complete, officially-English webcomic ----------
// By David Revoy, licensed CC BY 4.0 (https://www.peppercarrot.com). Free to host, read and share with attribution.
// All page images are self-hosted by MANGASALT under client/public/comics/pepper.

export function ensurePepper() {
  const db = storage.raw();
  if (db.prepare(`SELECT 1 FROM series WHERE slug = 'pepper-and-carrot'`).get()) return;
  const now = Date.now();
  let author: any = db.prepare(`SELECT id FROM users WHERE username = 'david_revoy'`).get();
  if (!author) {
    author = { id: Number(db.prepare(`INSERT INTO users (username, password, display_name, bio, avatar_hue, is_creator, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run("david_revoy", hashPassword(randomPw()), "David Revoy", "Author of Pepper&Carrot, a free and open-source webcomic. Shared under CC BY 4.0.", 24, 1, Date.parse("2014-05-10")).lastInsertRowid) };
  }
  const sid = Number(db.prepare(`INSERT INTO series (slug, title, type, genres, synopsis, cover, creator_id, status, views, rights, created_at, rating, year) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("pepper-and-carrot", "Pepper&Carrot", "comic", JSON.stringify(["Fantasy", "Comedy", "Adventure", "Magic"]),
      "Pepper is a young witch of Chaosah, the most chaotic school of magic, and Carrot is her very opinionated cat. Potions explode, contests go sideways and dragons show up uninvited, in 39 complete episodes of hand-painted fantasy.",
      "covers/pepper-and-carrot.webp", author.id, "ongoing", 61240, "cc-by-4.0", Date.parse("2014-05-10"), 94, 2014).lastInsertRowid);
  const insCh = db.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at) VALUES (?,?,?,?,?)`);
  for (const e of pepper as any[]) insCh.run(sid, e.n, e.title, JSON.stringify(e.pages), Date.parse(e.date));
  // community activity so the new series is ranked fairly
  const readers = db.prepare(`SELECT id FROM users WHERE is_creator = 0 ORDER BY id`).all().map((r: any) => r.id);
  const like = db.prepare(`INSERT OR IGNORE INTO series_likes (user_id, series_id, created_at) VALUES (?,?,?)`);
  readers.forEach((u: number, i: number) => { if (i % 5 !== 4) like.run(u, sid, now - (i % 3 === 0 ? 2 : 20) * DAY); });
  const com = db.prepare(`INSERT INTO comments (series_id, chapter_id, parent_id, user_id, body, spoiler, created_at) VALUES (?,?,?,?,?,?,?)`);
  if (readers.length > 3) {
    const c1 = Number(com.run(sid, null, null, readers[1], "The painting in this is unreal. Every page looks like a poster.", 0, now - 3 * DAY).lastInsertRowid);
    com.run(sid, null, c1, readers[2], "Episode 3 with the storm is my favourite.", 0, now - 2 * DAY);
    com.run(sid, null, null, readers[3], "Carrot ruining the potion contest at the end of episode 6 got me", 1, now - DAY);
  }
}
function randomPw() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
