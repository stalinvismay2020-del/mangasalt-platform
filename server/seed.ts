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

  const creators = [
    ["kaito_mori", "Kaito Mori", "Ink-wash swordplay and salt-sea legends. Tokyo.", 4],
    ["seoyeon_han", "Han Seo-yeon", "Romance fantasy webtoons with a little too much moonlight.", 178],
    ["lin_qiao", "Lin Qiao", "Cultivation epics and palace intrigue. Chengdu.", 140],
    ["ryu_studio", "Ryu Studio", "Action webtoon collective. Dungeons, gates, and grit.", 268],
    ["mei_aoki", "Mei Aoki", "Cozy slice-of-life. Coffee, cats, and quiet alleys.", 32],
  ];
  const cid: Record<string, number> = {};
  for (const [u, d, b, h] of creators) {
    cid[u as string] = Number(insUser.run(u, hashPassword("creator123"), d, b, h, 1, now - 200 * DAY).lastInsertRowid);
  }
  const readers: number[] = [];
  const readerNames = ["nightowl", "panelhopper", "saltyreader", "inkdrinker", "gatewalker", "koi_kid", "jadefan", "lantern_lux", "peonyqueen", "zero_simp", "bookwyrm", "otaku_ash", "manhwa_mira", "qi_master", "spoilerfree", "chapterchaser", "ronin_rei", "tidewatcher", "nova_reads", "pagewhisper"];
  readerNames.forEach((n, i) => readers.push(Number(insUser.run(n, hashPassword("reader123"), n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), "", (i * 37) % 360, 0, now - (150 - i) * DAY).lastInsertRowid)));

  const insSeries = db.prepare(`INSERT INTO series (slug, title, type, genres, synopsis, cover, creator_id, status, views, rights, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const catalog = [
    ["saltblade-ronin", "Saltblade Ronin", "manga", ["Action", "Samurai", "Drama"], "Exiled from the salt-mining clans, Aki Shiomi wanders the black-sand coast with a blade forged from crystallised seawater. Every duel costs her a memory.", "kaito_mori", "ongoing", 48210, 24],
    ["tidewitch-ledger", "The Tidewitch's Ledger", "manhwa", ["Romance", "Fantasy", "Isekai"], "Reborn as the villainess's accountant, Yuna discovers the sea witch's ledger can rewrite debts, curses, and maybe one cold duke's heart.", "seoyeon_han", "ongoing", 39150, 31],
    ["neon-koi-requiem", "Neon Koi Requiem", "manga", ["Cyberpunk", "Action", "Mystery"], "In flooded Neo-Osaka, a courier's koi tattoo starts swimming on its own, leading him to a conspiracy buried under the neon.", "kaito_mori", "ongoing", 27540, 16],
    ["jade-ascension", "Jade Ascension Path", "manhua", ["Cultivation", "Martial Arts", "Fantasy"], "A servant boy with crippled meridians swallows a jade dragon pearl and climbs the nine peaks of heaven, one impossible breakthrough at a time.", "lin_qiao", "ongoing", 52300, 42],
    ["level-zero-hunter", "Level Zero Hunter", "manhwa", ["Action", "System", "Dungeon"], "Ranked Level Zero by the Hunter Association, Jun-ho is the only person who can see the gates closing - and what waits behind them.", "ryu_studio", "ongoing", 61880, 38],
    ["paper-lantern-cafe", "Paper Lantern Café", "manga", ["Slice of Life", "Comedy", "Iyashikei"], "A tiny café at the end of a lantern-lit alley serves one drink per customer: the one they need most. The cat decides the menu.", "mei_aoki", "ongoing", 18920, 12],
    ["crimson-peony-court", "Crimson Peony Court", "manhua", ["Historical", "Drama", "Political"], "The empress was poisoned at her coronation. She woke up three years earlier, with a dagger in her sleeve and a list of names.", "lin_qiao", "ongoing", 33760, 27],
    ["abyssal-gate-academy", "Abyssal Gate Academy", "manhwa", ["School", "Fantasy", "Action"], "Floating above a bottomless abyss, the academy only accepts students who survive the fall. Three first-years didn't fall. They jumped.", "ryu_studio", "ongoing", 29440, 19],
  ] as const;

  const insCh = db.prepare(`INSERT INTO chapters (series_id, number, title, pages, created_at) VALUES (?,?,?,?,?)`);
  const sid: number[] = [];
  catalog.forEach(([slug, title, type, genres, syn, creator, status, views, chCount], idx) => {
    const id = Number(insSeries.run(slug, title, type, JSON.stringify(genres), syn, `/covers/${slug}.webp`, cid[creator], status, views, "original", now - (180 - idx * 10) * DAY).lastInsertRowid);
    sid.push(id);
    const [rt, yr, st] = META[slug];
    db.prepare(`UPDATE series SET rating = ?, year = ?, status = ? WHERE id = ?`).run(rt, yr, st, id);
    for (let n = 1; n <= chCount; n++) {
      const ago = (chCount - n) * 6 + (idx * 0.7);
      insCh.run(id, n, `Chapter ${n}`, "[]", now - ago * DAY - idx * 3600 * 1000);
    }
  });

  // demo reader saved list + history
  const lid = Number(db.prepare(`INSERT INTO reading_lists (user_id, name) VALUES (?, 'Saved')`).run(readers[0]).lastInsertRowid);
  [sid[1], sid[5]].forEach((s) => db.prepare(`INSERT INTO reading_list_items (list_id, series_id) VALUES (?,?)`).run(lid, s));
  [[sid[4], 2], [sid[0], 5]].forEach(([s, h]) => db.prepare(`INSERT INTO history (user_id, series_id, viewed_at) VALUES (?,?,?)`).run(readers[0], s, now - h * 3600 * 1000));

  // likes: deterministic but uneven distribution
  const insLike = db.prepare(`INSERT OR IGNORE INTO series_likes (user_id, series_id, created_at) VALUES (?,?,?)`);
  const weights = [0.85, 0.7, 0.45, 0.9, 0.95, 0.35, 0.6, 0.5];
  readers.forEach((r, ri) => sid.forEach((s, si) => {
    const v = ((ri * 7 + si * 13) % 20) / 20;
    if (v < weights[si]) insLike.run(r, s, now - ((ri + si * 3) % 14) * DAY);
  }));

  // follows
  const insFollow = db.prepare(`INSERT OR IGNORE INTO follows (user_id, target_type, target_id) VALUES (?,?,?)`);
  readers.forEach((r, ri) => Object.values(cid).forEach((c, ci) => { if ((ri + ci) % 3 !== 0) insFollow.run(r, "creator", c); }));

  // comments + replies
  const insC = db.prepare(`INSERT INTO comments (series_id, chapter_id, parent_id, user_id, body, spoiler, created_at) VALUES (?,?,?,?,?,?,?)`);
  const insCL = db.prepare(`INSERT OR IGNORE INTO comment_likes (user_id, comment_id) VALUES (?,?)`);
  const threads: [number, string, number, string[]][] = [
    [4, "The gate-closing panel in the latest chapter gave me actual chills. Ryu Studio's paneling is unmatched.", 0, ["Same. That double-page spread was insane.", "The colour work on the shadows too..."]],
    [0, "Aki losing the memory of her mother after the duel... I wasn't ready for that.", 1, ["Why would you post that without the spoiler tag first", "It's tagged, relax. And yes, I cried."]],
    [3, "Finally a cultivation story where the breakthroughs feel earned. The pacing is perfect.", 0, ["Lin Qiao never misses."]],
    [1, "The duke pretending not to care while checking the ledger every night is my entire personality now.", 0, ["Slow burn done right", "Chapter 31 when he finally reads her entry!!", "Can't wait for the next update"]],
    [6, "So the eunuch was on the list the whole time? Rewatching every chapter now.", 1, ["I KNEW something was off in chapter 9"]],
    [5, "This is my comfort read before bed. The cat deciding the menu is peak.", 0, ["The cat deserves its own spin-off"]],
    [7, "Abyssal Gate Academy has the best magic system I've read in a webtoon this year.", 0, []],
    [2, "Neon Koi Requiem's rain scenes are gorgeous. Every page is a wallpaper.", 0, ["Kaito Mori's ink work in colour is a dream"]],
  ];
  threads.forEach(([si, body, spoiler, replies], ti) => {
    const author = readers[(ti * 3) % readers.length];
    const pid = Number(insC.run(sid[si], null, null, author, body, spoiler, now - (ti + 1) * 5 * 3600 * 1000).lastInsertRowid);
    readers.forEach((r, ri) => { if ((ri + ti) % (ti % 3 + 2) === 0) insCL.run(r, pid); });
    replies.forEach((rb, ri) => {
      const rid = Number(insC.run(sid[si], null, pid, readers[(ti * 3 + ri + 1) % readers.length], rb, 0, now - (ti + 1) * 4 * 3600 * 1000 + ri * 600000).lastInsertRowid);
      if (ri === 0) insCL.run(readers[0], rid);
    });
  });
}
