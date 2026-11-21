// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { searchChapters, sortChapters, parseChapterQuery, formatNumber } from "./chapter-search.ts";

// Test fixture only (never shown in the app): 1..1200 plus a few decimal chapters and titles.
const chapters = [
  ...Array.from({ length: 1200 }, (_, i) => ({ number: i + 1, title: i === 0 ? "Romance Dawn" : i === 99 ? "The Legend Begins" : null })),
  { number: 10.5, title: "Side Story" },
  { number: 100.1, title: null },
  { number: null, title: "Special: Color Spread" },
];
const nums = (q: string) => searchChapters(chapters, q).map((m) => m.chapter.number);

test("exact number first", () => {
  for (const q of ["1", "10", "100", "1000"]) assert.equal(nums(q)[0], Number(q), q);
});
test("10 → 10, then partial 10x/10xx", () => {
  const r = nums("10");
  assert.equal(r[0], 10);
  assert.ok(r.includes(10.5) && r.includes(100) && r.includes(109) && r.includes(1000) && r.includes(1099));
  assert.ok(!r.includes(110) && !r.includes(210) && !r.includes(1));
});
test("100 → 100 exact, then 100.1, 1000–1009", () => {
  const r = nums("100");
  assert.deepEqual(r.slice(0, 1), [100]);
  assert.ok(r.includes(100.1) && r.includes(1000) && r.includes(1009) && !r.includes(10));
});
test("decimals", () => {
  assert.deepEqual(nums("10.5"), [10.5]);
  assert.equal(nums("10,5")[0], 10.5);
});
test("large numbers and whitespace / prefixes", () => {
  assert.equal(nums("  1000  ")[0], 1000);
  assert.equal(nums("ch 1000")[0], 1000);
  assert.equal(nums("Chapter 10")[0], 10);
  assert.equal(nums("#100")[0], 100);
  assert.deepEqual(nums("99999"), []);
});
test("title search, case & whitespace insensitive", () => {
  assert.deepEqual(nums("Romance Dawn"), [1]);
  assert.deepEqual(nums("  romance   DAWN "), [1]);
  assert.deepEqual(nums("dawn"), [1]);
  assert.deepEqual(nums("legend"), [100]);
  assert.deepEqual(searchChapters(chapters, "color").map((m) => m.chapter.title), ["Special: Color Spread"]);
});
test("empty query returns everything", () => assert.equal(searchChapters(chapters, "  ").length, chapters.length));
test("sorting", () => {
  assert.equal(sortChapters(chapters, "desc")[0].number, 1200);
  assert.equal(sortChapters(chapters, "asc")[0].number, 1);
  assert.equal(sortChapters(chapters, "asc").at(-1)!.number, null);
});
test("helpers", () => {
  assert.equal(formatNumber(10.5), "10.5");
  assert.equal(formatNumber(10), "10");
  assert.equal(parseChapterQuery("ep. 7").number, 7);
  assert.equal(parseChapterQuery("Romance Dawn").number, null);
});
