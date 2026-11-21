# QA flows (mobile 375×812 first, then 1440×900)

| Flow | Steps | Expected |
|---|---|---|
| Chapter search | Series → type `10`, ` 10 `, `ch 10`, `1`, `100`, `Potion`, `episode 3`; sort toggle | 10 → only Chapter 10; 100 → "no chapter 100 … run from 1 to 39"; titles match partially; sort flips order |
| Catalogue title search | Title page (One Piece) → `1`, `10`, `1000`, `10.5`, `Romance Dawn` | Number vs title handled; clear "not in list" messages |
| Unavailable chapters | Catalogue title chapter list | Licence notice + "Unavailable" badge; rows not clickable; no page counts |
| Reader | Open hosted chapter → vertical, paged, RTL, tap zones, arrows, slider, selector, zoom, fullscreen | Real pages load; page indicator & progress update |
| Failed image | Block a page URL → Retry | Per-page error with Retry; reload succeeds |
| Missing chapter | /read/pepper-and-carrot/999 | 404 "This chapter doesn't exist" |
| API unavailable | Catalogue returns 503 / network abort | "Catalogue unavailable" / "You're offline" with Try again |
| Sign up / sign in | Auth dialog → create account → confirm → sign in | Confirmation notice; sign-in shows account menu |
| Bookmark | Series → Save → reload Library | Saved persists |
| History & resume | Read ch 3 to p4 → History → Series "Resume" → open ch without ?p | History shows ch 3 p4; resume opens p4 |
| Comments | Post, like, reply, delete (two-tap), report other's comment | Counts update; report appears in Admin → Reports |
| Theme | Settings → switch theme → reload | Theme persists |
| Mobile nav | Bottom tabs Home/Trending/Search/Library/Discuss | Each route loads |
| Admin | Non-admin → /admin blocked; admin → stats, reports, users | Correct gating and data |
| Studio | Create series, upload cover & pages, add chapter, publish, read, delete | Pages readable in reader; drafts hidden from public |
