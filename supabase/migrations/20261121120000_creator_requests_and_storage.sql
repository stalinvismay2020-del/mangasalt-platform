-- Creators can (re)submit a request; a rejected request can be sent again.
create or replace function public.request_creator(p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if public.is_banned() then raise exception 'Your account is suspended'; end if;
  if char_length(coalesce(p_message, '')) > 1000 then raise exception 'Message is too long'; end if;
  insert into public.creator_requests(user_id, message, status) values (auth.uid(), coalesce(p_message, ''), 'pending')
  on conflict (user_id) do update set message = excluded.message, status = 'pending', created_at = now(), reviewed_at = null
  where public.creator_requests.status <> 'approved';
end $$;
revoke execute on function public.request_creator(text) from public, anon;
grant execute on function public.request_creator(text) to authenticated;

-- Only creators/admins may upload into the public pages bucket (still limited to their own folder).
drop policy if exists "signed in users upload own page objects" on storage.objects;
create policy "signed in users upload own page objects" on storage.objects for insert to authenticated
  with check (bucket_id = 'pages' and (storage.foldername(name))[1] = ((select auth.uid()))::text and not public.is_banned() and public.is_creator());
