alter table private.integrity_events add column group_id uuid;
create index integrity_events_group on private.integrity_events(attempt_id, group_id);
create table private.integrity_followups (
  attempt_id uuid not null references public.exam_attempts(id),
  id uuid not null,
  group_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('warn', 'note', 'resolve')),
  message text not null check (length(trim(message)) between 5 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id, id)
);
create index integrity_followups_group on private.integrity_followups(attempt_id, group_id);
alter table private.integrity_followups enable row level security;
revoke all on private.integrity_followups from public, anon, authenticated;

create function private.record_integrity_event(a public.exam_attempts, input jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  kind text := input->>'kind';
  event_id uuid := (input->>'event_id')::uuid;
  incident uuid := (input->>'group_id')::uuid;
  duration int := coalesce((input->>'duration_ms')::int, 0);
  editing boolean := coalesce((input->>'editing')::boolean, false);
  rotating boolean := coalesce((input->>'orientation_recent')::boolean, false);
  occurred timestamptz := (input->>'occurred_at')::timestamptz;
  question int;
  countable boolean;
begin
  if kind is null or kind not in ('focus_loss','visibility_hidden','visibility_start','fullscreen_exit',
      'pagehide','shortcut','copy','cut','paste','contextmenu','connection_lost','connection_restored')
      or event_id is null or duration not between 0 and 86400000 then
    raise exception 'Metadata kejadian tidak valid.';
  end if;
  -- Client time is context only. Use receipt time for clocks outside the attempt window.
  if occurred < a.started_at - interval '30 seconds' or occurred > clock_timestamp() + interval '30 seconds' then
    occurred := null;
  end if;
  select q.position into question from private.attempt_questions q
  where q.attempt_id = a.id and q.question_id = (input->>'question_id')::uuid;
  countable := kind in ('focus_loss', 'visibility_hidden') and duration >= 1500 and not editing
    and not rotating and not exists (
      select 1 from private.integrity_events ev where ev.attempt_id = a.id and ev.countable
      and (ev.group_id = incident or (
        (incident is null or ev.group_id is null) and ev.created_at > clock_timestamp() - interval '10 seconds'
      ))
    );
  insert into private.integrity_events(attempt_id,event_id,kind,countable,metadata,group_id)
  values (a.id,event_id,kind,countable,jsonb_build_object(
    'duration_ms',duration,'editing',editing,'orientation_recent',rotating,'policy','review',
    'occurred_at',occurred,'question_number',question
  ),incident) on conflict do nothing;
  return '{"recorded":true,"review_only":true}'::jsonb;
end;
$$;

do $$
declare
  definition text := pg_get_functiondef('private.attempt_command_before_workflow(jsonb)'::regprocedure);
  event_start integer := strpos(definition, 'if op=''event'' then');
  next_start integer := strpos(definition, 'req:=(input->>''request_id'')::uuid');
begin
  if event_start = 0 or next_start <= event_start then raise exception 'Integrity event handler has changed'; end if;
  execute overlay(definition placing
    'if op=''event'' then return private.record_integrity_event(a,input);end if; '
    from event_start for next_start - event_start);
end;
$$;

-- An incomplete visibility interval is a prompt to check the student, even before they return.
create function private.open_integrity_groups(target uuid)
returns table(id uuid) language sql stable set search_path = '' as $$
  select g.id from (
    select coalesce(ev.group_id, ev.event_id) as id
    from private.integrity_events ev where ev.attempt_id = target
    group by coalesce(ev.group_id, ev.event_id)
    having bool_or(ev.countable) or (
      max(ev.created_at) filter (where ev.kind = 'visibility_start'
        and ev.metadata->>'editing' = 'false' and ev.metadata->>'orientation_recent' = 'false')
        > coalesce(max(ev.created_at) filter (where ev.kind = 'visibility_hidden'), '-infinity'::timestamptz)
      and max(ev.created_at) filter (where ev.kind = 'visibility_start') < now() - interval '10 seconds'
    )
  ) g where not exists (
    select 1 from private.integrity_followups f
    where f.attempt_id = target and f.group_id = g.id and f.action = 'resolve'
  )
$$;

do $$
declare
  definition text := pg_get_functiondef('private.ops_command(jsonb)'::regprocedure);
  anchor text := $anchor$'room_id',rs.room_id,'room',r.name$anchor$;
begin
  if strpos(definition, anchor) = 0 then raise exception 'Monitor projection has changed'; end if;
  execute replace(definition, anchor, anchor || $fields$,
    'open_integrity',case when private.can_review_attempt(ea.id) then (select count(*) from private.open_integrity_groups(ea.id)) else 0 end,
    'last_seen_at',(select ap.last_seen_at from private.attempt_presence ap where ap.attempt_id=ea.id),
    'last_saved_at',(select max(aa.saved_at) from public.attempt_answers aa where aa.attempt_id=ea.id),
    'session',(select s.name from public.exam_sessions s where s.exam_id=eid
      and ea.started_at>=s.starts_at and ea.started_at<s.ends_at
      and exists(select 1 from public.supervisor_assignments sa where sa.room_id=rs.room_id and sa.session_id=s.id)
      order by s.starts_at desc,s.id limit 1)$fields$);
end;
$$;

create function private.integrity_command(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target uuid := (input->>'attempt_id')::uuid;
  incident uuid := (input->>'group_id')::uuid;
  request_id uuid := (input->>'request_id')::uuid;
  op text := input->>'action';
  note text := trim(input->>'message');
  a public.exam_attempts;
  prior private.integrity_followups;
begin
  if private.actor_org() is null or not private.can_review_attempt(target) then
    raise exception 'AUTH: Di luar cakupan pengawasan.';
  end if;
  if op = 'history' then
    return jsonb_build_object(
      'open_groups', coalesce((select jsonb_agg(g.id) from private.open_integrity_groups(target) g),'[]'),
      'events', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.event_id) from (
          select event_id, coalesce(group_id,event_id) group_id, kind, countable, created_at, metadata
          from private.integrity_events where attempt_id=target
          order by created_at desc,event_id limit 250
        ) e
      ),'[]'),
      'followups', coalesce((
        select jsonb_agg(to_jsonb(f) order by f.created_at desc,f.id)
        from (select i.id,i.group_id,i.action,i.message,i.created_at,p.full_name as actor
          from private.integrity_followups i join public.profiles p on p.id=i.actor_id
          where i.attempt_id=target order by i.created_at desc,i.id limit 250) f
      ),'[]')
    );
  end if;
  if op is null or op not in ('warn','note','resolve') or request_id is null
     or note is null or length(note) not between 5 and 1000 then
    raise exception 'Tindakan dan catatan 5–1000 karakter wajib.';
  end if;
  select * into a from public.exam_attempts where id=target for update;
  if not private.can_review_attempt(target) then raise exception 'AUTH: Penugasan pengawas telah berubah.'; end if;
  select * into prior from private.integrity_followups f where f.attempt_id=target and f.id=request_id;
  if found then
    if (prior.group_id,prior.actor_id,prior.action,prior.message) is distinct from (incident,auth.uid(),op,note) then
      raise exception 'CONFLICT: Isi permintaan telah berubah.';
    end if;
    return '{"saved":true}'::jsonb;
  end if;
  if not exists (select 1 from private.integrity_events e where e.attempt_id=target
      and coalesce(e.group_id,e.event_id)=incident) then raise exception 'CONFLICT: Insiden tidak tersedia.'; end if;
  if exists (select 1 from private.integrity_followups f where f.attempt_id=target
      and f.group_id=incident and f.action='resolve') then raise exception 'CONFLICT: Insiden sudah ditutup.'; end if;
  if op='warn' and (a.status<>'in_progress' or a.finalized_at is not null or a.deadline_at<=clock_timestamp()) then
    raise exception 'CONFLICT: Sesi ujian sudah berakhir.';
  end if;
  insert into private.integrity_followups(attempt_id,id,group_id,actor_id,action,message)
  values(target,request_id,incident,auth.uid(),op,note);
  insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id,request_id)
  values(a.organization_id,auth.uid(),'INTEGRITY_'||upper(op),'exam_attempts',target::text,request_id);
  return '{"saved":true}'::jsonb;
end;
$$;

create function public.integrity_command(input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.integrity_command(input)
$$;

-- Attach warnings only to the authenticated student's successful active-attempt DTO.
do $$
declare
  definition text := pg_get_functiondef('private.attempt_command(jsonb)'::regprocedure);
  anchor text := ' end if;return result;';
begin
  if strpos(definition, anchor) = 0 then raise exception 'Attempt wrapper has changed'; end if;
  execute replace(definition, anchor, $new$
    end if;
    if input->>'action' in ('start','resume','takeover') and result->>'status'='in_progress'
      and private.owns_attempt(target) then
      result:=result || jsonb_build_object('integrity_warnings', coalesce((
        select jsonb_agg(jsonb_build_object('id',w.id,'message',w.message) order by w.created_at,w.id)
        from (select f.id,f.message,f.created_at from private.integrity_followups f
          where f.attempt_id=target and f.action='warn' order by f.created_at desc,f.id limit 20) w
      ),'[]'));
    end if;
    return result;$new$);
end;
$$;

revoke all on function private.record_integrity_event(public.exam_attempts,jsonb),
  private.open_integrity_groups(uuid),private.integrity_command(jsonb),public.integrity_command(jsonb)
  from public, anon, authenticated;
grant execute on function private.integrity_command(jsonb),public.integrity_command(jsonb) to authenticated;
