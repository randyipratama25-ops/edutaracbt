create table private.exam_integrity_policies (
  exam_id uuid primary key references public.exams(id),
  profile text not null check (profile in ('practice','standard','strict')),
  accommodations uuid[] not null default '{}',
  packs uuid[] not null default '{}' check (cardinality(packs) in (0,2,3)),
  watermark boolean not null default false,
  focus_ms integer not null check (focus_ms between 500 and 60000),
  hidden_seconds integer not null check (hidden_seconds between 2 and 120),
  fullscreen_review boolean not null default false
);
create table private.exam_device_requests (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id),
  epoch integer not null,
  client_id uuid not null,
  session_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check (state in ('pending','approved','denied','used')),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  unique (attempt_id,epoch,client_id,session_id)
);
create index exam_device_requests_attempt_state on private.exam_device_requests(attempt_id,epoch,state);
alter table private.exam_integrity_policies enable row level security;
alter table private.exam_device_requests enable row level security;
revoke all on private.exam_integrity_policies,private.exam_device_requests from public,anon,authenticated;

create function private.exam_policy(eid uuid, uid uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'integrity_mode',coalesce(p.profile,'standard'),
    'unlock_time','fixed_deadline',
    'tolerance_ms',coalesce(p.focus_ms,1500),
    'hidden_seconds',coalesce(p.hidden_seconds,10),
    'fullscreen_review',coalesce(p.fullscreen_review,false),
    'incident_cooldown_ms',10000,
    'accommodated',coalesce(uid=any(p.accommodations),false),
    'approval_required',coalesce(p.profile='strict',false),
    'equivalent_packs',coalesce(cardinality(p.packs)>0,false),
    'watermark',coalesce(p.watermark,false)
  ) from (select 1) seed left join private.exam_integrity_policies p on p.exam_id=eid
$$;

-- Compare immutable source metadata and the actual point values imported into each pack.
create function private.exam_pack_signature(eid uuid,pid uuid) returns jsonb
language sql stable set search_path='' as $$
  select case when count(*) between 1 and 200 and bool_and(
    q.exam_id=eid and q.archived_at is null and q.current_version=u.question_version
    and q.points=u.points and coalesce(tc.enabled,false)
    and length(trim(coalesce(v.metadata->>'indicator','')))>0
    and coalesce(v.metadata->>'difficulty' in ('easy','medium','hard'),false)
  ) then jsonb_agg(jsonb_build_array(q.type,lower(trim(v.metadata->>'indicator')),
      v.metadata->>'difficulty',v.metadata->>'cognitive',u.points)
    order by q.type,lower(trim(v.metadata->>'indicator')),v.metadata->>'difficulty',v.metadata->>'cognitive',u.points)
  end
  from private.bank_packs p
  join private.bank_usage u on u.pack_id=p.id
  join public.questions q on q.id=u.question_id
  join private.bank_versions v on v.item_id=u.item_id and v.version=u.bank_version
  left join public.exam_type_configs tc on tc.exam_id=q.exam_id and tc.type=q.type
  where p.exam_id=eid and p.id=pid
$$;

create function private.exam_validate_packs(eid uuid, ids uuid[]) returns void
language plpgsql stable set search_path='' as $$
declare pid uuid; reference jsonb; actual jsonb;
begin
  if cardinality(ids)=0 then return; end if;
  if cardinality(ids) not in (2,3) or cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then
    raise exception 'Pilih dua atau tiga paket berbeda.';
  end if;
  foreach pid in array ids loop
    actual:=private.exam_pack_signature(eid,pid);
    if actual is null or (reference is not null and actual<>reference) then
      raise exception 'Paket harus setara berdasarkan tipe, indikator, tingkat kesulitan, kognitif, dan bobot. Pastikan versi soal paket masih aktif.';
    end if;
    reference:=actual;
  end loop;
end;
$$;

create function private.exam_choose_pack(eid uuid,uid uuid) returns uuid
language plpgsql stable set search_path='' as $$
declare ids uuid[];
begin
  select packs into ids from private.exam_integrity_policies where exam_id=eid;
  if coalesce(cardinality(ids),0)=0 then return null; end if;
  perform private.exam_validate_packs(eid,ids);
  return ids[1+get_byte(extensions.digest(eid::text||uid::text,'sha256'),0)%cardinality(ids)];
end;
$$;

create function private.exam_check_pack_publish() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('scheduled','active') and old.status is distinct from new.status then
    perform private.exam_validate_packs(new.id,coalesce(
      (select packs from private.exam_integrity_policies where exam_id=new.id),'{}'));
  end if;
  return new;
end;
$$;
create trigger exam_check_pack_publish before update of status on public.exams
for each row execute function private.exam_check_pack_publish();

-- Runs inside the existing attempt writer lock and after the ownership/session checks.
create function private.exam_takeover_gate(a public.exam_attempts, client uuid, sid uuid) returns jsonb
language plpgsql set search_path='' as $$
declare request private.exam_device_requests; moment timestamptz:=clock_timestamp();
begin
  if not coalesce((a.policy_snapshot->>'approval_required')::boolean,false)
      or (a.writer_client=client and a.writer_session=sid) then return null; end if;
  select * into request from private.exam_device_requests r
  where r.attempt_id=a.id and r.epoch=a.writer_epoch and r.client_id=client and r.session_id=sid;
  if request.state='approved' and request.decided_at>moment-interval '5 minutes' then
    update private.exam_device_requests set state='used' where id=request.id;
    return null;
  end if;
  if request.state='denied' and request.decided_at>moment-interval '1 minute' then
    return jsonb_build_object('error','TRANSFER_DENIED: Pengawas menolak permintaan ini. Hubungi pengawas sebelum meminta ulang.','status',409);
  end if;
  if request.id is null or request.state<>'pending' or request.created_at<=moment-interval '10 minutes' then
    insert into private.exam_device_requests(attempt_id,epoch,client_id,session_id)
    values(a.id,a.writer_epoch,client,sid)
    on conflict(attempt_id,epoch,client_id,session_id) do update
    set id=gen_random_uuid(),state='pending',created_at=clock_timestamp(),decided_at=null,decided_by=null
    returning * into request;
  end if;
  return jsonb_build_object('error','TRANSFER_PENDING: Sampaikan kode '||upper(left(request.id::text,8))||' kepada pengawas, lalu periksa persetujuan dari perangkat ini.','status',409);
end;
$$;

create function private.exam_integrity_command(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  op text:=input->>'action'; eid uuid:=(input->>'exam_id')::uuid;
  ex public.exams; a public.exam_attempts; config private.exam_integrity_policies;
  r private.exam_device_requests; pid uuid:=(input->>'id')::uuid;
  selected_packs uuid[]; selected_students uuid[]; result jsonb;
begin
  if private.actor_org() is null then raise exception 'AUTH: Sesi tidak valid.'; end if;
  if op in ('config','save') then
    if not private.is_admin() then raise exception 'AUTH: Hanya Admin dapat mengatur kebijakan ujian.'; end if;
    select * into ex from public.exams where id=eid and organization_id=private.actor_org() for update;
    if not found then raise exception 'AUTH: Ujian tidak tersedia.'; end if;
    if op='save' then
      if ex.status<>'draft' or exists(select 1 from public.exam_attempts where exam_id=eid) then
        raise exception 'CONFLICT: Kebijakan dikunci setelah ujian keluar dari draf atau memiliki attempt.';
      end if;
      if jsonb_typeof(input->'packs') is distinct from 'array'
        or jsonb_typeof(input->'accommodations') is distinct from 'array'
        or jsonb_typeof(input->'watermark') is distinct from 'boolean'
        or coalesce(input->>'profile','') not in ('practice','standard','strict') then
        raise exception 'Isian kebijakan tidak lengkap.';
      end if;
      if jsonb_array_length(input->'packs')>3 or jsonb_array_length(input->'accommodations')>5000 then
        raise exception 'Pilihan kebijakan melebihi batas.';
      end if;
      selected_packs:=array(select value::uuid from jsonb_array_elements_text(input->'packs') order by value);
      selected_students:=array(select distinct value::uuid from jsonb_array_elements_text(input->'accommodations') order by 1);
      if exists(select 1 from unnest(selected_students) t(uid) where not exists(
        select 1 from public.student_enrollments se join public.exam_classes ec on ec.class_id=se.class_id
        where ec.exam_id=eid and se.student_id=t.uid and se.active and se.organization_id=ex.organization_id
      )) then raise exception 'Pilih peserta dari kelas ujian.'; end if;
      perform private.exam_validate_packs(eid,selected_packs);
      insert into private.exam_integrity_policies(exam_id,profile,packs,accommodations,watermark,focus_ms,hidden_seconds,fullscreen_review)
      values(eid,input->>'profile',selected_packs,selected_students,(input->>'watermark')::boolean,
        coalesce((input->>'focus_ms')::int,case when input->>'profile'='strict' then 1000 else 1500 end),
        coalesce((input->>'hidden_seconds')::int,case when input->>'profile'='strict' then 5 else 10 end),
        coalesce((input->>'fullscreen_review')::boolean,false))
      on conflict(exam_id) do update set profile=excluded.profile,packs=excluded.packs,
        accommodations=excluded.accommodations,watermark=excluded.watermark,focus_ms=excluded.focus_ms,
        hidden_seconds=excluded.hidden_seconds,fullscreen_review=excluded.fullscreen_review;
      insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id)
      values(ex.organization_id,auth.uid(),'EXAM_INTEGRITY_POLICY','exams',eid::text);
    end if;
    select * into config from private.exam_integrity_policies where exam_id=eid;
    return jsonb_build_object(
      'editable',ex.status='draft' and not exists(select 1 from public.exam_attempts where exam_id=eid),
      'profile',coalesce(config.profile,'standard'),'packs',coalesce(config.packs,'{}'),
      'accommodations',coalesce(config.accommodations,'{}'),'watermark',coalesce(config.watermark,false),
      'focus_ms',coalesce(config.focus_ms,1500),'hidden_seconds',coalesce(config.hidden_seconds,10),
      'fullscreen_review',coalesce(config.fullscreen_review,false),
      'available_packs',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'created_at',p.created_at,
        'count',jsonb_array_length(private.exam_pack_signature(eid,p.id))) order by p.created_at,p.id)
        from private.bank_packs p where p.exam_id=eid and private.exam_pack_signature(eid,p.id) is not null),'[]'),
      'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id)
        from public.profiles p where p.organization_id=ex.organization_id and p.active and p.role='student' and exists(
          select 1 from public.student_enrollments se join public.exam_classes ec on ec.class_id=se.class_id
          where ec.exam_id=eid and se.student_id=p.id and se.active)),'[]')
    );
  end if;
  if op='transfers' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') into result from (
      select d.id,d.created_at,upper(left(d.id::text,8)) as code,p.full_name student,er.name room
      from private.exam_device_requests d join public.exam_attempts ea on ea.id=d.attempt_id
      join public.profiles p on p.id=ea.student_id
      left join public.exam_room_students rs on rs.exam_id=ea.exam_id and rs.student_id=ea.student_id
      left join public.exam_rooms er on er.id=rs.room_id
      where ea.exam_id=eid and ea.organization_id=private.actor_org() and ea.status='in_progress'
        and ea.finalized_at is null and ea.deadline_at>now() and d.epoch=ea.writer_epoch
        and d.state='pending' and d.created_at>now()-interval '10 minutes'
        and private.can_review_attempt(ea.id)
        and exists(select 1 from auth.sessions s where s.id=d.session_id and s.user_id=ea.student_id
          and (s.not_after is null or s.not_after>now()))
      order by d.created_at,d.id limit 100
    ) t;
    return result;
  end if;
  if op is null or op not in ('approve','deny') then raise exception 'Aksi tidak dikenal.'; end if;
  select ea.* into a from public.exam_attempts ea join private.exam_device_requests d on d.attempt_id=ea.id
  where d.id=pid and ea.organization_id=private.actor_org() and private.can_review_attempt(ea.id)
  for update of ea;
  if not found or not private.can_review_attempt(a.id) then raise exception 'AUTH: Permintaan di luar penugasan.'; end if;
  select * into r from private.exam_device_requests where id=pid;
  if not found or r.epoch<>a.writer_epoch or a.status<>'in_progress' or a.finalized_at is not null
      or a.deadline_at<=clock_timestamp() or r.created_at<=clock_timestamp()-interval '10 minutes'
      or not exists(select 1 from auth.sessions s where s.id=r.session_id and s.user_id=a.student_id
        and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception 'CONFLICT: Permintaan sudah berakhir.';
  end if;
  if r.state=(case when op='approve' then 'approved' else 'denied' end) then return '{"saved":true}'; end if;
  if r.state<>'pending' then raise exception 'CONFLICT: Permintaan sudah ditangani.'; end if;
  if op='approve' and exists(select 1 from private.exam_device_requests d where d.attempt_id=a.id
    and d.epoch=a.writer_epoch and d.state='approved' and d.decided_at>clock_timestamp()-interval '5 minutes') then
    raise exception 'CONFLICT: Perangkat lain sudah mendapat persetujuan untuk sesi ini.';
  end if;
  update private.exam_device_requests set state=case when op='approve' then 'approved' else 'denied' end,
    decided_at=clock_timestamp(),decided_by=auth.uid() where id=pid;
  insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id)
  values(a.organization_id,auth.uid(),'EXAM_TRANSFER_'||upper(op),'exam_device_requests',pid::text);
  return '{"saved":true}';
end;
$$;

create function public.exam_integrity_command(input jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.exam_integrity_command(input)$$;

do $$
declare
  d text:=pg_get_functiondef('private.attempt_command_before_workflow(jsonb)'::regprocedure);
  snapshot text:=$a$'shuffle_options',ex.shuffle_options)) returning * into a;$a$;
  selection text:=$a$where q0.exam_id=eid and q0.archived_at is null order by$a$;
  takeover text:=$a$if op='takeover' and a.finalized_at is null and a.status='in_progress' then update$a$;
  listing text:=$a$'duration_minutes',e.duration_minutes,'status',e.status$a$;
begin
  if strpos(d,snapshot)=0 or strpos(d,selection)=0 or strpos(d,takeover)=0 or strpos(d,listing)=0 then
    raise exception 'Attempt integrity anchors changed';
  end if;
  d:=replace(d,snapshot,$a$'shuffle_options',ex.shuffle_options)
    || private.exam_policy(eid,uid) || jsonb_build_object('pack_id',private.exam_choose_pack(eid,uid))) returning * into a;$a$);
  d:=replace(d,selection,$a$where q0.exam_id=eid and q0.archived_at is null
    and (a.policy_snapshot->>'pack_id' is null or exists(select 1 from private.bank_usage bu
      where bu.pack_id=(a.policy_snapshot->>'pack_id')::uuid and bu.question_id=q0.id and bu.question_version=z.version))
    order by$a$);
  d:=replace(d,takeover,$a$if op='takeover' and a.finalized_at is null and a.status='in_progress' then
    result:=private.exam_takeover_gate(a,client,sid);
    if result is not null then return result; end if;
    if a.writer_client=client and a.writer_session=sid and coalesce((a.policy_snapshot->>'approval_required')::boolean,false)
      then return private.attempt_dto(target);end if;
    update$a$);
  d:=replace(d,listing,listing||$a$,'integrity_policy',private.exam_policy(e.id,uid)$a$);
  execute d;
end;
$$;

do $$
declare
  d text:=pg_get_functiondef('private.attempt_dto(uuid)'::regprocedure);
  anchor text:=$a$'policy',jsonb_build_object('integrity_mode','review','unlock_time','fixed_deadline','tolerance_ms',1500,'incident_cooldown_ms',10000)$a$;
begin
  if strpos(d,anchor)=0 then raise exception 'Attempt DTO policy anchor changed'; end if;
  execute replace(d,anchor,$a$'policy',case when a.policy_snapshot ? 'approval_required' then
    a.policy_snapshot - array['policy_version','passing_grade','shuffle_questions','shuffle_options','pack_id']
    else jsonb_build_object('integrity_mode','standard','unlock_time','fixed_deadline','tolerance_ms',1500,
      'incident_cooldown_ms',10000,'approval_required',false,'accommodated',false,'equivalent_packs',false,'watermark',false) end,
    'watermark_code',case when a.status='in_progress' and a.finalized_at is null
      and a.policy_snapshot->>'watermark'='true' then upper(left(replace(a.id::text,'-',''),12)) end$a$);
end;
$$;

do $$
declare
  d text:=pg_get_functiondef('private.record_integrity_event(public.exam_attempts,jsonb)'::regprocedure);
  anchor text:=$a$kind in ('focus_loss', 'visibility_hidden') and duration >= 1500 and not editing$a$;
  old_groups text:=pg_get_functiondef('private.open_integrity_groups(uuid)'::regprocedure);
  group_anchor text:=$a$max(ev.created_at) filter (where ev.kind = 'visibility_start') < now() - interval '10 seconds'$a$;
begin
  if strpos(d,anchor)=0 or strpos(old_groups,group_anchor)=0 then raise exception 'Integrity threshold anchor changed'; end if;
  execute replace(d,anchor,$a$((kind in ('focus_loss','visibility_hidden')
      and duration >= coalesce((a.policy_snapshot->>'tolerance_ms')::int,1500))
      or (kind='fullscreen_exit' and a.policy_snapshot->>'fullscreen_review'='true'))
    and coalesce(a.policy_snapshot->>'integrity_mode','standard')<>'practice'
    and not coalesce((a.policy_snapshot->>'accommodated')::boolean,false) and not editing$a$);
  execute replace(old_groups,group_anchor,$a$max(ev.created_at) filter (where ev.kind = 'visibility_start') <
    now() - make_interval(secs=>coalesce((select (policy_snapshot->>'hidden_seconds')::int
      from public.exam_attempts where id=target),10))
    and not exists(select 1 from public.exam_attempts a where a.id=target and
      (a.policy_snapshot->>'integrity_mode'='practice' or a.policy_snapshot->>'accommodated'='true'))$a$);
end;
$$;

revoke all on function private.exam_policy(uuid,uuid),private.exam_pack_signature(uuid,uuid),
  private.exam_validate_packs(uuid,uuid[]),private.exam_choose_pack(uuid,uuid),
  private.exam_check_pack_publish(),private.exam_takeover_gate(public.exam_attempts,uuid,uuid),
  private.exam_integrity_command(jsonb),public.exam_integrity_command(jsonb) from public,anon,authenticated;
grant execute on function private.exam_integrity_command(jsonb),public.exam_integrity_command(jsonb) to authenticated;

do $$
declare
  d text:=pg_get_functiondef('private.ops_command(jsonb)'::regprocedure);
  anchor text:=$a$'last_saved_at',(select max(aa.saved_at) from public.attempt_answers aa where aa.attempt_id=ea.id),$a$;
begin
  if strpos(d,anchor)=0 then raise exception 'Monitor watermark anchor changed'; end if;
  execute replace(d,anchor,anchor||$a$
    'watermark_code',case when ea.policy_snapshot->>'watermark'='true' and private.can_review_attempt(ea.id)
      then upper(left(replace(ea.id::text,'-',''),12)) end,$a$);
end;
$$;

do $$
declare
  pool text:=pg_get_functiondef('private.bank_pool(uuid,jsonb)'::regprocedure);
  command text:=pg_get_functiondef('private.bank_command(jsonb)'::regprocedure);
  filter_anchor text:=$a$and (nullif(p_rule->>'difficulty','') is null$a$;
  order_anchor text:=$a$+(nullif(value->>'cognitive','') is not null)::int)$a$;
begin
  if strpos(pool,filter_anchor)=0 or strpos(command,order_anchor)=0 then
    raise exception 'Bank indicator anchors changed';
  end if;
  execute replace(pool,filter_anchor,$a$and (nullif(trim(p_rule->>'indicator'),'') is null
    or lower(trim(v.metadata->>'indicator'))=lower(trim(p_rule->>'indicator'))) $a$||filter_anchor);
  execute replace(command,order_anchor,$a$+(nullif(value->>'cognitive','') is not null)::int
    +(nullif(trim(value->>'indicator'),'') is not null)::int)$a$);
end;
$$;
