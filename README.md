# MANGASALT

A manga, manhwa, manhua and comic reading platform. It is built as a website first and works well on phones.

## Stack
- React, Vite, Tailwind, shadcn/ui and Framer Motion on the client
- Express with SQLite (better-sqlite3) on the server
- Hash routing: `/`, `/trending`, `/search`, `/library`, `/profile`, `/series/:slug`, `/read/:chapterId/:page?`

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
- The other series are original placeholder titles. Their pages will come from creators through Creator Studio.

Copyrighted manga is never mirrored or streamed from unlicensed sources.
