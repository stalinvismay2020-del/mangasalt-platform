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
