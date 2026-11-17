# MANGASALT

A manga, manhwa, manhua and comic reading platform. It is built as a website first and works well on phones.

## Stack
- React, Vite, Tailwind, shadcn/ui and Framer Motion on the client
- Express with SQLite (better-sqlite3) on the server
- Hash routing: `/`, `/trending`, `/search`, `/search/genre/:genre`, `/search/type/:type`, `/library`, `/profile`, `/title/:anilistId`, `/mp/:anilistId/:chapter`, `/series/:slug`, `/read/:chapterId/:page?`
- Catalogue: [AniList GraphQL API](https://graphql.anilist.co) (titles, covers, genres, staff, recommendations)
- Official chapter index: [MangaDex API](https://api.mangadex.org) external links to official publishers only

## Run
```bash
npm install
npm run dev        # http://localhost:5000
npm run build && NODE_ENV=production node dist/index.cjs
```
The database (`data.db`) is created and seeded automatically on first start.

## Content and rights
MANGASALT only hosts content it has the right to host.
- **Pepper&Carrot** by David Revoy: all 39 official English episodes are self-hosted in `client/public/comics/pepper`, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source: https://www.peppercarrot.com
- **Worldwide catalogue** (manga, manhwa, manhua) comes from AniList. Chapters are listed only when an official English publisher has released them.
- **In-app reading** uses the publisher's own embeddable reader. Today that is MANGA Plus by Shueisha, which offers its free chapters (usually the first few and the latest). Publishers that block embedding (for example VIZ and WEBTOON) are shown as "not in app" with no outbound links.
- AniList's API is free for non-commercial use; commercial use needs AniList's permission.

Copyrighted manga is never mirrored, re-hosted or streamed from fan scanlations.

## Creator Studio

Creators publish their own manga, manhwa, manhua or comics at `/#/studio`.

- Create a series: cover, title, format, status, up to 6 genres, synopsis, and a rights confirmation (required).
- Add chapters: drag-and-drop pages, reorder, remove. Pages are resized to WebP (max 1200px wide) in the browser; long webtoon strips are split automatically.
- Edit or delete series and chapters at any time; replaced files are removed from disk.
- Uploads are stored in `uploads/u<userId>/` (gitignored) and only accept PNG, JPEG or WebP up to 6 MB per page.
- Published series appear on Home ("Creator originals"), in Library, and in Search, with likes, comments, follows and the in-app reader.

Only creator-owned or properly licensed work may be uploaded. Scanlations and images taken from other sites are not allowed.

## Official English only

Every title in the catalogue must have a verified official English edition:

1. AniList's English-language publisher / reading-platform links (WEBTOON, Tapas, MANGA Plus, VIZ, K MANGA, Yen Press...).
2. If AniList lists none, MangaDex's "official English" link is checked before the title is hidden.

Results are cached in the `official_en` table (negatives are re-checked weekly). Titles without an official English edition are removed from Home, Search, Trending and recommendations, and their pages show "Not available in official English".

## In-app chapters

- **MANGA Plus** (free official chapters, from the MangaDex publisher index) and **Tapas** (every official episode) open in their publisher's own reader inside MANGASALT. Tapas episodes are tagged Free, Wait-free or Coins.
- WEBTOON, VIZ, K MANGA, Tappytoon, Comikey and INKR block their reader inside other sites, so those titles show which platform publishes them instead.
- No chapter images are copied from other websites.

## Extras

- Animated day/night switch with a circular screen reveal.
- Transparent glass navigation bar and reader controls (keyboard: arrows for prev/next, F fullscreen, H hide controls).
- Reading stats with a daily streak on Profile, "Surprise me" random pick, share button on title pages.
