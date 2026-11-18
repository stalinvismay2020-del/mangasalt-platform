# MANGASALT

A manga, manhwa, manhua and comic reading platform. It is built as a website first and works well on phones.

## Stack
- React, Vite, Tailwind, shadcn/ui and Framer Motion on the client
- Express with SQLite (better-sqlite3) on the server
- Hash routing: `/`, `/trending`, `/search`, `/search/genre/:genre`, `/search/type/:type`, `/library`, `/profile`, `/title/:anilistId`, `/series/:slug`, `/read/:chapterId/:page?`
- Catalogue: [AniList GraphQL API](https://graphql.anilist.co) (titles, covers, genres, staff, recommendations)
- Official chapter index: [MangaDex API](https://api.mangadex.org) and Tapas, used only to label chapters as licensed externally

## Run
```bash
npm install
npm run dev        # http://localhost:5000
npm run build && NODE_ENV=production node dist/index.cjs
```
The database (`data.db`) is created and seeded automatically on first start.

## Content and rights
MANGASALT is an independent platform: its own frontend, backend, database, CMS and reader. It never embeds another site's reader and never copies chapter images from other websites.
- **Pepper&Carrot** by David Revoy: all 39 official English episodes are self-hosted in `client/public/comics/pepper`, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source: https://www.peppercarrot.com
- **Creator originals** uploaded through Creator Studio, and chapters an admin uploads with confirmed distribution rights.
- **Worldwide catalogue** (manga, manhwa, manhua, non-adult) comes from AniList. It is a discovery catalogue: titles appear whether or not they have an English edition, and the Search page has an "Official English only" filter.
- AniList's API is free for non-commercial use; commercial use needs AniList's permission.

## Creator Studio

Creators publish their own manga, manhwa, manhua or comics at `/#/studio`.

- Create a series: cover, title, format, status, up to 6 genres, synopsis, and a rights confirmation (required).
- Add chapters: drag-and-drop pages, reorder, remove. Pages are resized to WebP (max 1200px wide) in the browser; long webtoon strips are split automatically.
- Edit or delete series and chapters at any time; replaced files are removed from disk.
- Uploads are stored in `uploads/u<userId>/` (gitignored) and only accept PNG, JPEG or WebP up to 6 MB per page.
- Published series appear on Home ("Creator originals"), in Library, and in Search, with likes, comments, follows and the in-app reader.

Only creator-owned or properly licensed work may be uploaded. Scanlations and images taken from other sites are not allowed.

## Chapter system

Every chapter has one status, decided on the server (`server/chapters.ts`):

| Status | Meaning | Card action |
|---|---|---|
| Available to read | Hosted on MANGASALT, published, has pages, release time passed | Read / Continue |
| Coming soon | Hosted and published, release time in the future | Release date |
| Licensed externally | Published by an official publisher, not hosted here | Publisher link only when the URL is on the verified publisher list |
| Unavailable | The publisher withdrew it | None |
| Not yet uploaded | Known to exist, no authorised copy here | None |

A Read button is shown only for "Available to read". Drafts, future chapters and chapters without pages return 404 to readers.

**Search** (`shared/chapters.ts`, unit tests in `tests/chapters.test.ts`, run `npx tsx tests/chapters.test.ts`):
exact number first ("5" finds 5, never 15 or 175), then decimals of that number (5.5), then numbers starting with it (50-59), then special kinds (prologue, extra, special, side story, oneshot) and titles. "Chapter 59", "ch59" and "ep 59" all work, spaces are ignored, and a missing number shows an empty state with a clear button.

**API**
- `GET /api/series/by-slug/:slug/chapters` and `GET /api/world/title/:anilistId/chapters`, with params `q`, `status`, `sort=asc|desc|newest`, `lang`, `page`, `limit`. Results are paginated, so long series never load every chapter at once. Reader pages lazy-load.

## Admin: Chapters tab

`/#/admin/chapters`. Reading needs moderator or admin; writing needs admin. Every action is written to the moderation log.
- Per series: distribution rights, staff-only permission evidence, and an optional AniList ID. Linking an AniList ID makes the hosted chapters readable from that catalogue title's page.
- Create and edit chapters: number (decimals allowed), kind, numbered or not, title, language, release date and time, pages (upload, reorder, remove). Pages go to `uploads/u<userId>/`, PNG/JPEG/WebP only, and must belong to the uploader.
- Publishing requires ticking the rights confirmation. You can preview a draft, unpublish it, or schedule it for later.
- Delete asks you to type `delete <number>`, and removes the chapter's uploaded files.
- Make a staff account: `npm run make-admin -- <username> [admin|moderator]`.

**Migrations.** These run automatically at start-up (in `server/storage.ts`) and keep existing data. They add `chapters.kind`, `language`, `published`, `numbered` and `updated_at`, plus `series.anilist_id` and `rights_note`, with indexes.

## Library

Continue reading, history, Recently updated (last 30 days), unread counts, bookmarks with their page, favourites and shelves. All of it is stored on the server, so it syncs across devices.

## Extras

- Animated day/night switch with a circular screen reveal.
- Transparent glass navigation bar and reader controls (keyboard: arrows for prev/next, H hide controls).
- Reading stats with a daily streak on Profile, "Surprise me" random pick, share button on title pages.

## MangaDex catalogue (second source)

AniList is the main catalogue. Search results also include titles from the [MangaDex API](https://api.mangadex.org/docs/) that AniList is missing.

- **Metadata only.** We use titles, alt names, descriptions, tags, staff and cover art. MangaDex-hosted scan chapters are never fetched or shown. These titles show as *Licensed externally* (with a link to the publisher, e.g. Yen Press) or *Not yet uploaded*, and never get a Read button.
- **Dedupe.** A MangaDex title is dropped if it is already on AniList. We check its AniList link, then its MAL id (AniList `idMal_in`), then a normalised title match from a batched AniList search. Results are cached for a week in the `md_titles` table. If AniList can't be reached, no extras are added. Doujinshi and fan-coloured works are excluded, and only `contentRating=safe` titles are used.
- **IDs.** MangaDex titles get local ids from `1000000000` up (`server/catalogue-md.ts`). If one is later matched to AniList, `/api/world/title/:id` returns `movedTo` and the client redirects.
- **Covers.** MangaDex doesn't allow hotlinking, so covers are served through `GET /api/md/cover/:uuid/:file` and cached on disk in `cache/md-covers` (gitignored).
- **Limits.** Requests are throttled to about 4 per second, cached for 30 minutes, and sent with an honest User-Agent. Browse pages give MangaDex 3.5 s and searches 6 s, then return AniList results alone.
- **Credit.** Each MangaDex title page links back to its MangaDex page. The footer and Licenses page credit MangaDex.
