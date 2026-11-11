-- =====================================================================
-- 4) 수정: 생성자 업로드가 "new row violates row-level security policy" 로 막히던 문제
--    Storage 업로드는 INSERT ... RETURNING (upsert 포함) 으로 동작해서, 방금 넣은 행을
--    읽을 수 있는 SELECT 정책이 필요하다.
--    → 게임이 아직 'open' 인 동안에만 생성자가 자기 게임의 이미지 경로를 볼 수 있게 한다.
--      게임이 종료(closed)되면 이 정책은 더 이상 통과하지 않고, 당첨자 본인만 읽을 수 있다.
-- =====================================================================
create policy "prizes read by creator while open" on storage.objects for select to authenticated
  using (bucket_id = 'prizes' and public.can_upload_prize(name));
