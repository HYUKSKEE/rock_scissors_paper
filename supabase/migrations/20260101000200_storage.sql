-- =====================================================================
-- 3) Storage: 비공개 버킷 `prizes`, 경로 `{game_id}/{rank}.{ext}`
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prizes', 'prizes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 업로드: 게임 생성자(create_game 호출 uid)만, 아직 open 인 게임에, 올바른 경로 형식으로만.
-- (생성자 신원은 games.creator_uid 로 확인하고, 이후 경로는 set_prize_paths RPC 에서 admin_token 으로 기록한다.)
create or replace function public.can_upload_prize(p_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.creator_uid = auth.uid()
      and g.status = 'open'
      and p_name ~ ('^' || g.id::text || '/\d+\.(jpg|png|webp)$')
      and coalesce(substring(p_name from '/(\d+)\.')::int, 0) between 1 and g.winner_count
  )
$$;
revoke all on function public.can_upload_prize(text) from public, anon;
grant execute on function public.can_upload_prize(text) to authenticated;

create policy "prizes upload by creator" on storage.objects for insert to authenticated
  with check (bucket_id = 'prizes' and public.can_upload_prize(name));

create policy "prizes overwrite by creator" on storage.objects for update to authenticated
  using (bucket_id = 'prizes' and public.can_upload_prize(name))
  with check (bucket_id = 'prizes' and public.can_upload_prize(name));

-- 읽기: winners 에 (game_id, prize_path, uid = 나) 가 있는 경우만 → 해당 순위 당첨자 본인만 볼 수 있다.
create policy "prizes read by winner" on storage.objects for select to authenticated
  using (
    bucket_id = 'prizes'
    and exists (
      select 1 from public.winners w
      where w.game_id::text = (storage.foldername(name))[1]
        and w.prize_path = name
        and w.uid = auth.uid()
    )
  );
