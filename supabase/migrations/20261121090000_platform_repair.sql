-- MANGASALT platform repair (non-destructive).
-- Adds threaded discussion, comment likes, reading history, takedown requests,
-- fixes aggregate RPCs that were counting only the caller's own rows, and
-- allows discussion on catalogue titles (AniList ids) as well as hosted series.

-- ── Comments: replies, spoilers, catalogue targets ─────────────────────────
alter table public.comments add column if not exists parent_id bigint references public.comments(id) on delete cascade;
alter table public.comments add column if not exists spoiler boolean not null default false;
alter table public.comments add column if not exists target_title text;
alter table public.comments add column if not exists target_cover text;
alter table public.comments add column if not exists edited_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comments_body_len') then
    alter table public.comments add constraint comments_body_len check (char_length(body) between 1 and 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_has_target') then
    alter table public.comments add constraint comments_has_target check (series_id is not null or media_id is not null) not valid;
  end if;
end $$;

create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists comments_recent_idx on public.comments(created_at desc) where parent_id is null and not is_hidden;

create or replace function public.comment_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recent int; v_day int; p record;
begin
  if tg_op = 'INSERT' then
    new.body := btrim(new.body);
    if new.body = '' then raise exception 'Comment cannot be empty.'; end if;
    if not public.is_admin() then
      select count(*) into v_recent from public.comments where visitor_id = new.visitor_id and created_at > now() - interval '1 minute';
      if v_recent >= 5 then raise exception 'You are commenting too fast. Please wait a minute.'; end if;
      select count(*) into v_day from public.comments where visitor_id = new.visitor_id and created_at > now() - interval '1 day';
      if v_day >= 100 then raise exception 'Daily comment limit reached.'; end if;
      if exists (select 1 from public.comments where visitor_id = new.visitor_id
                 and series_id is not distinct from new.series_id and media_id is not distinct from new.media_id
                 and body = new.body and created_at > now() - interval '10 minutes') then
        raise exception 'Duplicate comment.'; end if;
    end if;
    if new.parent_id is not null then
      select * into p from public.comments where id = new.parent_id;
      if not found or p.is_hidden then raise exception 'The comment you replied to no longer exists.'; end if;
      if p.parent_id is not null then new.parent_id := p.parent_id; end if;  -- keep threads one level deep
      new.series_id := p.series_id; new.media_id := p.media_id;
      new.chapter_id := p.chapter_id; new.chapter_key := p.chapter_key;
      new.target_title := p.target_title; new.target_cover := p.target_cover;
    end if;
    new.display_name := coalesce((select display_name from public.profiles where visitor_id = new.visitor_id), 'Reader');
    new.is_hidden := false; new.hidden_reason := '';
    new.series_key := coalesce(new.series_id::text, new.media_id::text);
    new.created_at := now();
    new.edited_at := null;
  elsif tg_op = 'UPDATE' then
    -- authors may only edit body/spoiler; everything else is preserved.
    if not public.is_admin() then
      new.id := old.id; new.visitor_id := old.visitor_id; new.series_id := old.series_id; new.media_id := old.media_id;
      new.chapter_id := old.chapter_id; new.chapter_key := old.chapter_key; new.parent_id := old.parent_id;
      new.is_hidden := old.is_hidden; new.hidden_reason := old.hidden_reason; new.created_at := old.created_at;
      new.series_key := old.series_key; new.display_name := old.display_name;
      new.body := btrim(new.body);
      if new.body = '' then raise exception 'Comment cannot be empty.'; end if;
      if new.body is distinct from old.body then new.edited_at := now(); end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.comment_guard() from public, anon, authenticated;

drop trigger if exists comment_guard_upd on public.comments;
create trigger comment_guard_upd before update on public.comments for each row execute function public.comment_guard();

drop policy if exists "signed in users can comment as self" on public.comments;
create policy "signed in users can comment as self" on public.comments for insert to authenticated
with check (
  visitor_id = (select auth.uid())::text and not public.is_banned()
  and (
    (series_id is not null and exists (select 1 from public.hosted_series s where s.id = comments.series_id and s.published and not s.taken_down))
    or (series_id is null and media_id is not null and media_id > 0)
  )
  and (chapter_id is null or exists (select 1 from public.hosted_chapters c where c.id = comments.chapter_id and c.series_id = comments.series_id and c.published))
);

drop policy if exists "authors edit own comments" on public.comments;
create policy "authors edit own comments" on public.comments for update to authenticated
using (visitor_id = (select auth.uid())::text and not public.is_banned())
with check (visitor_id = (select auth.uid())::text);

-- ── Comment likes ──────────────────────────────────────────────────────────
create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_user_idx on public.comment_likes(user_id);
alter table public.comment_likes enable row level security;
revoke truncate, trigger, references on public.comment_likes from anon, authenticated;
drop policy if exists "read comment likes" on public.comment_likes;
create policy "read comment likes" on public.comment_likes for select using (true);
drop policy if exists "like as self" on public.comment_likes;
create policy "like as self" on public.comment_likes for insert to authenticated with check (user_id = (select auth.uid()) and not public.is_banned());
drop policy if exists "unlike own" on public.comment_likes;
create policy "unlike own" on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.toggle_comment_like(p_comment bigint)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := auth.uid(); v_liked boolean;
begin
  if v_uid is null then raise exception 'Sign in to like comments.'; end if;
  if not exists (select 1 from public.comments where id = p_comment and not is_hidden) then raise exception 'Comment not found.'; end if;
  if exists (select 1 from public.comment_likes where comment_id = p_comment and user_id = v_uid) then
    delete from public.comment_likes where comment_id = p_comment and user_id = v_uid; v_liked := false;
  else
    insert into public.comment_likes(comment_id, user_id) values (p_comment, v_uid); v_liked := true;
  end if;
  return jsonb_build_object('liked', v_liked, 'count', (select count(*) from public.comment_likes where comment_id = p_comment));
end $$;
revoke execute on function public.toggle_comment_like(bigint) from public, anon;
grant execute on function public.toggle_comment_like(bigint) to authenticated;

-- Thread for one target (hosted series or catalogue media), optionally one chapter.
-- p_chapter: null = series-level discussion only, '*' = everything on the target.
create or replace function public.comment_thread(p_series uuid, p_media int, p_chapter text default null,
                                                 p_sort text default 'new', p_limit int default 20, p_offset int default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with target as (
    select c.* from public.comments c
    where ((p_series is not null and c.series_id = p_series) or (p_series is null and p_media is not null and c.series_id is null and c.media_id = p_media))
      and (p_chapter = '*' or (p_chapter is null and c.chapter_key is null and c.chapter_id is null)
           or (p_chapter is not null and p_chapter <> '*' and (c.chapter_key = p_chapter or c.chapter_id::text = p_chapter)))
  ),
  enriched as (
    select t.*, coalesce(pr.display_name, t.display_name) as author_name, coalesce(pr.avatar_hue, 200) as author_hue,
           (select count(*) from public.comment_likes l where l.comment_id = t.id) as like_count,
           exists (select 1 from public.comment_likes l where l.comment_id = t.id and l.user_id = auth.uid()) as liked_by_me
    from target t left join public.profiles pr on pr.visitor_id = t.visitor_id
  ),
  tops as (
    select * from enriched where parent_id is null
    order by case when p_sort = 'top' then like_count end desc nulls last, created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from target),
    'top_level', (select count(*) from target where parent_id is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'body', t.body, 'created_at', t.created_at, 'edited_at', t.edited_at, 'spoiler', t.spoiler,
        'chapter_key', t.chapter_key, 'is_hidden', t.is_hidden, 'hidden_reason', t.hidden_reason,
        'author', jsonb_build_object('id', t.visitor_id, 'name', t.author_name, 'hue', t.author_hue),
        'likes', t.like_count, 'liked', t.liked_by_me, 'mine', t.visitor_id = auth.uid()::text,
        'replies', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'body', r.body, 'created_at', r.created_at, 'edited_at', r.edited_at, 'spoiler', r.spoiler,
            'is_hidden', r.is_hidden, 'hidden_reason', r.hidden_reason, 'parent_id', r.parent_id,
            'author', jsonb_build_object('id', r.visitor_id, 'name', r.author_name, 'hue', r.author_hue),
            'likes', r.like_count, 'liked', r.liked_by_me, 'mine', r.visitor_id = auth.uid()::text) order by r.created_at)
          from enriched r where r.parent_id = t.id), '[]'::jsonb)
      ) order by case when p_sort = 'top' then t.like_count end desc nulls last, t.created_at desc) from tops t), '[]'::jsonb)
  )
$$;
grant execute on function public.comment_thread(uuid, int, text, text, int, int) to anon, authenticated;

-- Platform-wide discussion feed (latest top-level comments with reply/like counts).
create or replace function public.discussion_feed(p_limit int default 20, p_offset int default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with c as (
    select c.*, s.slug, s.title as s_title, s.cover_path
    from public.comments c left join public.hosted_series s on s.id = c.series_id
    where c.parent_id is null and not c.is_hidden
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'body', c.body, 'spoiler', c.spoiler, 'created_at', c.created_at, 'chapter_key', c.chapter_key,
    'series_id', c.series_id, 'media_id', c.media_id, 'slug', c.slug,
    'title', coalesce(c.s_title, c.target_title), 'cover', coalesce(c.cover_path, c.target_cover),
    'author', jsonb_build_object('id', c.visitor_id, 'name', coalesce(pr.display_name, c.display_name), 'hue', coalesce(pr.avatar_hue, 200)),
    'replies', (select count(*) from public.comments r where r.parent_id = c.id and not r.is_hidden),
    'likes', (select count(*) from public.comment_likes l where l.comment_id = c.id)
  ) order by c.created_at desc), '[]'::jsonb)
  from c left join public.profiles pr on pr.visitor_id = c.visitor_id
$$;
grant execute on function public.discussion_feed(int, int) to anon, authenticated;

-- ── Likes: aggregates must see everyone's rows (only counts are exposed) ───
alter table public.likes drop constraint if exists likes_kind_check;
alter table public.likes add constraint likes_kind_check check (kind is null or kind in ('manga','manhwa','manhua','comic','webcomic','novel'));
create index if not exists likes_visitor_idx on public.likes(visitor_id, created_at desc);

create or replace function public.like_state(p_visitor text, p_ids integer[])
returns table(media_id integer, count bigint, liked boolean)
language sql stable security definer set search_path = public as $$
  select l.media_id, count(*), coalesce(bool_or(l.visitor_id = (select auth.uid()::text)), false)
  from public.likes l where l.media_id = any(p_ids) group by l.media_id
$$;
grant execute on function public.like_state(text, integer[]) to anon, authenticated;

create or replace function public.community_top(p_limit integer default 10)
returns table(media_id integer, title text, cover text, kind text, likes bigint, likes_this_week bigint)
language sql stable security definer set search_path = public as $$
  select l.media_id, max(l.title), max(l.cover), max(l.kind), count(*),
         count(*) filter (where l.created_at >= now() - interval '7 days')
  from public.likes l where l.media_id is not null
  group by l.media_id
  order by count(*) desc, max(l.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;
grant execute on function public.community_top(integer) to anon, authenticated;

-- Toggle a like on a catalogue title as the signed-in user.
create or replace function public.toggle_title_like(p_media int, p_title text, p_cover text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_liked boolean;
begin
  if v_uid is null then raise exception 'Sign in to like titles.'; end if;
  if public.is_banned() then raise exception 'Your account is suspended.'; end if;
  if p_media is null or p_media <= 0 then raise exception 'Invalid title.'; end if;
  if exists (select 1 from public.likes where media_id = p_media and visitor_id = v_uid) then
    delete from public.likes where media_id = p_media and visitor_id = v_uid; v_liked := false;
  else
    insert into public.likes(media_id, visitor_id, title, cover, kind)
    values (p_media, v_uid, left(p_title, 300), left(p_cover, 600), case when p_kind in ('manga','manhwa','manhua','comic','webcomic','novel') then p_kind end);
    v_liked := true;
  end if;
  return jsonb_build_object('liked', v_liked, 'count', (select count(*) from public.likes where media_id = p_media));
end $$;
revoke execute on function public.toggle_title_like(int, text, text, text) from public, anon;
grant execute on function public.toggle_title_like(int, text, text, text) to authenticated;

-- ── Reading history (one row per chapter read) ─────────────────────────────
create table if not exists public.chapter_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_key text not null,
  chapter_key text not null,
  series_title text,
  chapter_label text,
  cover text,
  href text,
  page int not null default 0,
  total_pages int not null default 0,
  read_at timestamptz not null default now(),
  primary key (user_id, series_key, chapter_key)
);
create index if not exists chapter_reads_recent_idx on public.chapter_reads(user_id, read_at desc);
alter table public.chapter_reads enable row level security;
revoke truncate, trigger, references on public.chapter_reads from anon, authenticated;
drop policy if exists "own reads select" on public.chapter_reads;
create policy "own reads select" on public.chapter_reads for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own reads insert" on public.chapter_reads;
create policy "own reads insert" on public.chapter_reads for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own reads update" on public.chapter_reads;
create policy "own reads update" on public.chapter_reads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own reads delete" on public.chapter_reads;
create policy "own reads delete" on public.chapter_reads for delete to authenticated using (user_id = (select auth.uid()));

alter table public.reading_progress add column if not exists href text;
create index if not exists reading_progress_recent_idx on public.reading_progress(visitor_id, updated_at desc);
create index if not exists bookmarks_recent_idx on public.bookmarks(visitor_id, created_at desc);

-- ── Copyright / takedown requests (public form, admin review) ──────────────
create table if not exists public.takedown_requests (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320 and email like '%@%'),
  target text not null check (char_length(target) between 1 and 1000),
  details text not null default '' check (char_length(details) <= 5000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  reporter_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.takedown_requests enable row level security;
revoke all on public.takedown_requests from anon, authenticated;
grant insert (name, email, target, details) on public.takedown_requests to anon, authenticated;
grant select, update (status, resolved_at) on public.takedown_requests to authenticated;
drop policy if exists "anyone files takedown" on public.takedown_requests;
create policy "anyone files takedown" on public.takedown_requests for insert to anon, authenticated with check (status = 'open');
drop policy if exists "admins read takedowns" on public.takedown_requests;
create policy "admins read takedowns" on public.takedown_requests for select to authenticated using (public.is_admin());
drop policy if exists "admins resolve takedowns" on public.takedown_requests;
create policy "admins resolve takedowns" on public.takedown_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin: open reports with the reported comment text, for the moderation queue.
create or replace function public.admin_reports(p_status text default 'open', p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object('id', r.id, 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason,
      'details', r.details, 'status', r.status, 'created_at', r.created_at,
      'reporter', coalesce((select display_name from public.profiles where visitor_id = r.reporter_id::text), 'Reader'),
      'comment', case when r.target_type = 'comment' then (select jsonb_build_object('body', c.body, 'author', c.display_name, 'is_hidden', c.is_hidden,
          'series_id', c.series_id, 'media_id', c.media_id) from public.comments c where c.id::text = r.target_id) end) x
    from public.reports r where p_status = 'all' or r.status = p_status
    order by r.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) s), '[]'::jsonb);
end $$;
revoke execute on function public.admin_reports(text, int) from public, anon;
grant execute on function public.admin_reports(text, int) to authenticated;

-- Stats should count catalogue comments too.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'creators', (select count(*) from public.user_roles where role = 'creator'),
    'admins', (select count(*) from public.user_roles where role = 'admin'),
    'banned', (select count(*) from public.user_bans),
    'series', (select count(*) from public.hosted_series),
    'series_published', (select count(*) from public.hosted_series where published and not taken_down),
    'series_drafts', (select count(*) from public.hosted_series where not published),
    'series_taken_down', (select count(*) from public.hosted_series where taken_down),
    'chapters', (select count(*) from public.hosted_chapters),
    'chapters_published', (select count(*) from public.hosted_chapters where published),
    'views', (select coalesce(sum(views), 0) from public.series_stats),
    'views_7d', (select count(*) from public.chapter_views where created_at > now() - interval '7 days'),
    'likes', (select count(*) from public.likes),
    'bookmarks', (select count(*) from public.bookmarks),
    'comments', (select count(*) from public.comments),
    'comments_hidden', (select count(*) from public.comments where is_hidden),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'takedowns_open', (select count(*) from public.takedown_requests where status = 'open'),
    'creator_requests', (select count(*) from public.creator_requests where status = 'pending'),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'storage_objects', (select count(*) from storage.objects),
    'db_bytes', pg_database_size(current_database())
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- Public profile summary (no private data).
create or replace function public.profile_summary(p_user text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.visitor_id, 'name', p.display_name, 'bio', p.bio, 'hue', p.avatar_hue, 'joined', p.created_at,
    'comments', (select count(*) from public.comments c where c.visitor_id = p.visitor_id and not c.is_hidden),
    'likes', (select count(*) from public.likes l where l.visitor_id = p.visitor_id),
    'role', (select r.role from public.user_roles r where r.user_id::text = p.visitor_id order by case r.role when 'admin' then 0 else 1 end limit 1))
  from public.profiles p where p.visitor_id = p_user
$$;
grant execute on function public.profile_summary(text) to anon, authenticated;
