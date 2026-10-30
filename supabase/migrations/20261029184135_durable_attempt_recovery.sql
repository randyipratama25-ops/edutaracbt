-- Supplemental recovery copies; canonical answers and grading remain unchanged.
create table private.attempt_recovery_drafts (
  attempt_id uuid not null,
  question_id uuid not null,
  client_id uuid not null,
  epoch integer not null check(epoch>0),
  base_revision integer not null check(base_revision>=0),
  value jsonb not null check(octet_length(value::text)<=150000),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key(attempt_id,question_id,client_id,epoch),
  foreign key(attempt_id,question_id) references private.attempt_questions(attempt_id,question_id) on delete cascade
);
alter table private.attempt_recovery_drafts enable row level security;
revoke all on private.attempt_recovery_drafts from public,anon,authenticated;
create policy recovery_owner on private.attempt_recovery_drafts to authenticated
  using(private.owns_attempt(attempt_id)) with check(private.owns_attempt(attempt_id));
create index attempt_recovery_expiry on private.attempt_recovery_drafts(expires_at);
create function private.attempt_recovery(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare target uuid:=(input->>'attempt_id')::uuid; a public.exam_attempts;
  client uuid:=(input->>'client_id')::uuid; entry jsonb; q private.attempt_questions;
  base integer; current_revision integer; result jsonb;
begin
  if not private.owns_attempt(target) then raise exception 'AUTH: Attempt tidak tersedia';end if;
  select * into a from public.exam_attempts where id=target for update;
  if a.finalized_at is not null or a.status<>'in_progress' or a.deadline_at<=clock_timestamp()
    or exists(select 1 from public.exams where id=a.exam_id and status in ('closed','archived')) then
    if input->>'action'='list' then return jsonb_build_object('drafts','[]'::jsonb,'canvases','[]'::jsonb);end if;
    raise exception 'AUTH: Draf tidak dapat diubah setelah ujian berakhir/dikunci';
  end if;
  if client is distinct from a.writer_client or (input->>'epoch')::int is distinct from a.writer_epoch
    or a.writer_session::text is distinct from auth.jwt()->>'session_id' then
    raise exception 'DEVICE_CONFLICT: Ambil alih sesi sebelum memulihkan draf';end if;
  if input->>'action'='list' then
    select jsonb_build_object('drafts',coalesce((select jsonb_agg(jsonb_build_object(
      'question_id',d.question_id,'client_id',d.client_id,'epoch',d.epoch,'revision',d.base_revision,
      'value',d.value,'updated_at',d.updated_at) order by d.updated_at desc)
      from private.attempt_recovery_drafts d left join public.attempt_answers sa
        on sa.attempt_id=d.attempt_id and sa.question_id=d.question_id
      where d.attempt_id=target and d.expires_at>clock_timestamp() and d.value is distinct from sa.value),'[]'),
      'canvases',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'question_id',m.question_id,'created_at',m.created_at) order by m.created_at desc)
        from (select am.*,row_number() over(partition by am.question_id order by am.created_at desc) rn
          from public.answer_media am where am.attempt_id=target) m
        left join public.attempt_answers sa on sa.attempt_id=m.attempt_id and sa.question_id=m.question_id
        where m.rn<=3 and m.id::text is distinct from sa.value->>'canvas_id' and m.created_at>coalesce(sa.saved_at,'-infinity'::timestamptz)),'[]')) into result;
    return result;
  end if;
  if input->>'action'<>'stage' or jsonb_typeof(input->'answers') is distinct from 'array'
    or jsonb_array_length(input->'answers') not between 1 and 100 then raise exception 'Draf tidak valid';end if;
  for entry in select value from jsonb_array_elements(input->'answers') loop
    select * into q from private.attempt_questions where attempt_id=target and question_id=(entry->>'question_id')::uuid;
    if not found then raise exception 'AUTH: Soal di luar snapshot';end if;
    perform private.check_answer(q,entry->'value',target);
    base:=(entry->>'expected_revision')::int;
    if base is null or base<0 then raise exception 'Revisi tidak valid';end if;
    select revision into current_revision from public.attempt_answers where attempt_id=target and question_id=q.question_id;
    if base<coalesce(current_revision,0) then continue;end if;
    if base>coalesce(current_revision,0) then raise exception 'CONFLICT: Revisi dasar tidak tersedia';end if;
    insert into private.attempt_recovery_drafts values(target,q.question_id,client,a.writer_epoch,base,entry->'value',clock_timestamp(),least(a.deadline_at,clock_timestamp()+interval '24 hours'))
      on conflict(attempt_id,question_id,client_id,epoch) do update set base_revision=excluded.base_revision,value=excluded.value,
        updated_at=excluded.updated_at,expires_at=excluded.expires_at
      where attempt_recovery_drafts.base_revision<=excluded.base_revision;
    -- Keep at most three writer copies per question, never unlimited historical payloads.
    delete from private.attempt_recovery_drafts d where d.attempt_id=target and d.question_id=q.question_id
      and (d.client_id,d.epoch) not in (select x.client_id,x.epoch from private.attempt_recovery_drafts x
        where x.attempt_id=target and x.question_id=q.question_id order by x.updated_at desc limit 3);
  end loop;
  return jsonb_build_object('staged',true,'server_now',clock_timestamp());
end$$;
create function public.attempt_recovery(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.attempt_recovery(input)$$;
revoke all on function private.attempt_recovery(jsonb),public.attempt_recovery(jsonb) from public,anon,authenticated;
grant execute on function private.attempt_recovery(jsonb),public.attempt_recovery(jsonb) to authenticated;
create function private.clear_recovery() returns trigger language plpgsql security definer set search_path='' as $$begin
  if tg_table_name='exam_attempts' then
    if new.finalized_at is not null or new.status='reset' then delete from private.attempt_recovery_drafts where attempt_id=new.id;end if;
  else
    delete from private.attempt_recovery_drafts where attempt_id=new.attempt_id and question_id=new.question_id and value=new.value and base_revision<new.revision;
  end if;return new;
end$$;
revoke all on function private.clear_recovery() from public,anon,authenticated;
create trigger recovery_finalized after update on public.exam_attempts for each row execute function private.clear_recovery();
create trigger recovery_acknowledged after insert or update on public.attempt_answers for each row execute function private.clear_recovery();
create function private.purge_attempt_recovery() returns bigint language sql security definer set search_path='' as $$
  with removed as (delete from private.attempt_recovery_drafts where expires_at<=clock_timestamp() returning 1) select count(*) from removed
$$;
revoke all on function private.purge_attempt_recovery() from public,anon,authenticated;
select cron.schedule('edutara-recovery-retention','*/15 * * * *','select private.purge_attempt_recovery()');
