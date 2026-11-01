-- Additive operational evidence. No restore command targets the live database.
create table private.scheduler_health(id boolean primary key default true check(id),last_success_at timestamptz not null);
alter table private.scheduler_health enable row level security;
revoke all on private.scheduler_health from public,anon,authenticated;
create table private.recovery_drills(
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 backup_id uuid not null references private.work_jobs(id), backup_checksum text not null check(backup_checksum ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz not null, duration_seconds int not null check(duration_seconds between 1 and 86400),
 outcome text not null check(outcome in ('passed','failed')), evidence text not null check(length(btrim(evidence)) between 5 and 300),
 notes text not null check(length(btrim(notes)) between 10 and 2000),
 recorded_by uuid not null references public.profiles(id),recorded_at timestamptz not null default clock_timestamp());
create index recovery_drills_org_time on private.recovery_drills(organization_id,completed_at desc);
alter table private.recovery_drills enable row level security;
revoke all on private.recovery_drills from public,anon,authenticated;
create trigger recovery_drills_append_only before update or delete on private.recovery_drills for each row execute function private.audit_append_only();
-- Preserve existing timeout/dispatch/semester/reminder logic and its lock/ACL.
do $patch$ declare definition text;needle text;begin
 select pg_get_functiondef('private.scheduler_tick(timestamptz)'::regprocedure) into definition;
 needle:='semester:=private.semester_due(at_time,org.timezone);';
 if strpos(definition,needle)=0 then raise exception 'Scheduler weekly insertion anchor missing';end if;
 definition:=replace(definition,needle,$insert$
 -- ISO week in school timezone; do not accumulate queued backups while worker is unavailable.
 if private.semester_due(at_time,org.timezone) is null and not exists(select 1 from private.work_jobs where organization_id=org.id and kind='backup' and status in ('queued','running','failed','blocked')) then
 perform private.enqueue_work(org.id,'backup','weekly:'||to_char(at_time at time zone org.timezone,'IYYY-IW'),'{}',null);
 end if;
 semester:=private.semester_due(at_time,org.timezone);$insert$);
 needle:='return jsonb_build_object(''ticked_at'',at_time);';
 if strpos(definition,needle)=0 then raise exception 'Scheduler heartbeat insertion anchor missing';end if;
 definition:=replace(definition,needle,$insert$insert into private.scheduler_health(id,last_success_at) values(true,clock_timestamp()) on conflict(id) do update set last_success_at=excluded.last_success_at;
 return jsonb_build_object('ticked_at',at_time);$insert$);
 execute definition;
end $patch$;
create function private.operational_health(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.actor_org();b private.work_jobs;existing private.recovery_drills;rid uuid;done timestamptz;begin
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin organisasi aktif';end if;
 if input->>'action'='record' then
 rid:=(input->>'request_id')::uuid;done:=(input->>'completed_at')::timestamptz;
 if rid is null or done is null or done>clock_timestamp() or done<clock_timestamp()-interval '90 days' or input->>'confirmation' is distinct from 'KONFIRMASI' then raise exception 'Waktu atau konfirmasi latihan tidak valid';end if;
 select * into b from private.work_jobs where id=(input->>'backup_id')::uuid and organization_id=org and kind='backup' and status='succeeded' and payload->>'outcome' is distinct from 'retention_pending';
 if not found or b.result_checksum is distinct from input->>'backup_checksum' or done<b.updated_at then raise exception 'Backup/checksum/waktu tidak cocok';end if;
 if input->>'outcome' is null or input->>'outcome' not in ('passed','failed') or (input->>'duration_seconds')::int not between 1 and 86400 or length(btrim(coalesce(input->>'evidence',''))) not between 5 and 300 or length(btrim(coalesce(input->>'notes',''))) not between 10 and 2000 then raise exception 'Bukti latihan tidak lengkap';end if;
 select * into existing from private.recovery_drills where id=rid;
 if found then
 if existing.organization_id<>org or existing.backup_id<>b.id or existing.backup_checksum<>input->>'backup_checksum' or existing.completed_at<>done or existing.duration_seconds<>(input->>'duration_seconds')::int or existing.outcome<>input->>'outcome' or existing.evidence<>btrim(input->>'evidence') or existing.notes<>btrim(input->>'notes') or existing.recorded_by<>auth.uid() then raise exception 'ID permintaan telah dipakai';end if;
 return jsonb_build_object('id',rid,'saved',true);end if;
 insert into private.recovery_drills values(rid,org,b.id,b.result_checksum,done,(input->>'duration_seconds')::int,input->>'outcome',btrim(input->>'evidence'),btrim(input->>'notes'),auth.uid(),clock_timestamp()) on conflict(id) do nothing;
 if not found then raise exception 'Permintaan bersamaan; muat ulang sebelum mencoba lagi';end if;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,auth.uid(),'RECOVERY_DRILL_RECORDED','recovery_drills',rid::text);
 return jsonb_build_object('id',rid,'saved',true);
 elsif coalesce(input->>'action','get')<>'get' then raise exception 'Aksi tidak dikenal';end if;
 return private.operational_snapshot() || jsonb_build_object(
 'heartbeat_at',(select last_success_at from private.scheduler_health where id),
 'drills',coalesce((select jsonb_agg(to_jsonb(d)-'organization_id' order by completed_at desc) from(select * from private.recovery_drills where organization_id=org order by completed_at desc limit 10)d),'[]'),
 'last_passed_drill_at',(select max(completed_at) from private.recovery_drills where organization_id=org and outcome='passed'));
end$$;
create function public.operational_health(input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.operational_health(input)$$;
revoke all on function private.operational_health(jsonb),public.operational_health(jsonb) from public,anon,authenticated;
grant execute on function private.operational_health(jsonb),public.operational_health(jsonb) to authenticated;
