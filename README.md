# MANGASALT

A manga, manhwa, manhua and webcomic platform with its own catalogue, reader, accounts, library, reading history and community. It is a static React app backed by Supabase. It does not send readers to external reading sites.

## Architecture

| Layer | What it does |
|---|---|
| `client/` (React 18, Vite, Tailwind, shadcn/ui, Framer Motion, TanStack Query, wouter hash routing) | All screens. It talks to Supabase with the **publishable** key only. |
| Supabase Postgres + RLS | Profiles, roles, hosted series/chapters, bookmarks, reading progress, chapter reads, comments, comment likes, likes, reports, creator requests and takedown requests. Every table has row-level security, so users can only change their own rows. |
| Supabase Storage, `pages` bucket | Covers and chapter pages for hosted series. Anyone can read it. Only creators and admins can upload, and only into their own `<uid>/…` folder. |
| Edge Function `catalog` (`supabase/functions/catalog`) | The server-side adapter for the [Dawghwa API](https://dawghwaapi.vercel.app). It validates input and normalises responses, and it caches results (titles 10 min, chapters 5 min). It also handles 12 s timeouts, retries with back-off, the 120 req/60 s rate limit (`Retry-After`) and JSON structured logs. |

### Catalogue and page authorisation
Dawghwa provides title metadata, covers and chapter indexes. Its `POST /api/pages` endpoint resolves pages from third-party scanlation sources that MANGASALT has no licence for. The `/pages/:source/:chapterId` route therefore returns **403** unless the source is listed in the `DAWGHWA_AUTHORIZED_SOURCES` secret. That list is empty by default, so catalogue chapters show as "Not licensed on MANGASALT" and can't be opened. Only hosted series (creator uploads and openly licensed works such as Pepper&Carrot) have readable pages.

Function secrets (all optional): `DAWGHWA_API_BASE` (default `https://dawghwaapi.vercel.app`), `DAWGHWA_INDEX_SOURCE` (default `mangadex`), `DAWGHWA_AUTHORIZED_SOURCES` (comma-separated, default empty).

## Routes
`/`, `/trending`, `/search`, `/search/genre/:genre`, `/search/type/:type`, `/title/:id` (catalogue title), `/series/:slug` (hosted series), `/read/:slug/:number?p=` (reader), `/library`, `/history`, `/profile`, `/u/:id`, `/discussion`, `/settings`, `/admin`, `/studio`, `/studio/new`, `/studio/series/:id`, `/legal/:section`.

## Run
```bash
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev            # Vite dev server
npm run check          # TypeScript
npm test               # chapter search unit tests
npm run build          # static site in dist/public
```
Deploy the `dist/public` folder to any static host. Deploy the edge function with `supabase functions deploy catalog --no-verify-jwt`.

## Reader
- Vertical scroll or page-by-page, with left-to-right or right-to-left direction.
- Fit to width, fit to height or original size; zoom from 50% to 300%; fullscreen.
- Tap zones, swipe gestures and the keyboard (arrow keys, `f`, `+`/`-`).
- A chapter selector, previous/next chapter controls and a page slider with a progress percentage.
- Progress auto-saves while you read and when you leave. Opening the chapter again resumes where you left off.
- Every page loads lazily and has its own loading spinner and Retry button.
- Chapters with no uploaded pages show an availability notice; the reader never fills them with placeholder pages.

## Chapter search
`client/src/lib/chapter-search.ts` matches by chapter number and by title, both exact and partial. It accepts "10", " 10 ", "ch 10", "episode 3", "10.5" and large numbers such as "1000", and treats a numeric query as a chapter number. Exact matches come first. Tests live in `chapter-search.test.ts`.

## Database
Migrations are in `supabase/migrations`. Key RPCs: `toggle_comment_like`, `toggle_title_like`, `comment_thread`, `discussion_feed`, `profile_summary`, `request_creator`, `admin_stats`, `admin_reports`, `admin_list_users`, `admin_set_role`.

## Removed
The Express/SQLite server, the MANGA Plus, WEBTOON and Tapas integrations (reader embeds, redirect buttons, chapter IDs, badges) and the external-link chapter index were removed. Reading history saved by those integrations is kept and shown under "Earlier reading" on the History page.
