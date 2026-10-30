-- Forward-only: complete bank backup coverage; no historical data rewritten.
create or replace function private.backup_data(org uuid) returns table(table_name text,seq bigint,payload jsonb) language plpgsql stable security definer set search_path='' as $$declare t record;predicate text;begin
 for t in select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and c.relname not in ('secret_refs','backup_rows','backup_parts','login_budgets','attempt_requests','authoring_requests','grading_requests','operational_requests') order by n.nspname,c.relname loop
 if t.schema='public' and t.name='organizations' then predicate:='r.id=$1';
 elsif exists(select 1 from information_schema.columns where information_schema.columns.table_schema=t.schema and information_schema.columns.table_name=t.name and column_name='organization_id') then predicate:='r.organization_id=$1';
 elsif exists(select 1 from information_schema.columns where information_schema.columns.table_schema=t.schema and information_schema.columns.table_name=t.name and column_name='attempt_id') then predicate:='exists(select 1 from public.exam_attempts p where p.id=r.attempt_id and p.organization_id=$1)';
 elsif exists(select 1 from information_schema.columns where information_schema.columns.table_schema=t.schema and information_schema.columns.table_name=t.name and column_name='exam_id') then predicate:='exists(select 1 from public.exams p where p.id=r.exam_id and p.organization_id=$1)';
 elsif exists(select 1 from information_schema.columns where information_schema.columns.table_schema=t.schema and information_schema.columns.table_name=t.name and column_name='question_id') then predicate:='exists(select 1 from public.questions p where p.id=r.question_id and p.organization_id=$1)';
 elsif t.schema='private' and t.name in ('bank_versions','bank_reviews') then predicate:='exists(select 1 from private.bank_items p where p.id=r.item_id and p.organization_id=$1)';
 elsif t.name='supervisor_substitutions' then predicate:='exists(select 1 from public.supervisor_assignments p where p.id=r.assignment_id and p.organization_id=$1)';
 elsif t.name='notification_receipts' then predicate:='exists(select 1 from private.notifications p where p.id=r.notification_id and p.organization_id=$1)';
 elsif t.name='job_events' then predicate:='exists(select 1 from private.work_jobs p where p.id=r.job_id and p.organization_id=$1)';
 else continue;end if;
 return query execute format('select %L::text,row_number() over(order by to_jsonb(r)::text),to_jsonb(r) from %I.%I r where %s',t.schema||'.'||t.name,t.schema,t.name,predicate) using org;
 end loop;
 return query select 'auth.identities_safe'::text,row_number() over(order by u.id),jsonb_build_object('id',u.id,'email',u.email,'email_confirmed',u.email_confirmed_at is not null,'reactivation_required',true) from auth.users u join public.profiles p on p.id=u.id where p.organization_id=org;
end$$;

revoke all on function private.backup_data(uuid) from public,anon,authenticated;

-- This is an observation endpoint, never an acceptance signature or deployment command.
create function private.operational_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=private.actor_org();result jsonb;begin
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin organisasi aktif';end if;
 select jsonb_build_object(
  'observed_at',statement_timestamp(),'operational_accepted',false,
  'active_attempts',(select count(*) from public.exam_attempts where organization_id=org and finalized_at is null),
  'automation_enabled',s.automation_enabled,'reminders_enabled',s.reminders_enabled,'retention_days',s.retention_days,
  'smtp_configured',s.smtp_sender<>'' and exists(select 1 from private.secret_refs where organization_id=org and key='smtp_password'),
  'worker_approved',coalesce((select full_worker_approved from private.worker_transport),false),
  'schedulers',coalesce((select jsonb_agg(jsonb_build_object('name',jobname,'active',coalesce((to_jsonb(j)->>'active')::boolean,true),'schedule',schedule) order by jobname) from cron.job j where jobname in ('edutara-operations','edutara-recovery-retention','edutara-results-publication')),'[]'),
  'job_issues',(select count(*) from private.work_jobs where organization_id=org and status in ('failed','blocked','uncertain')),
  'stalled_jobs',(select count(*) from private.work_jobs where organization_id=org and (status='queued' and next_attempt<statement_timestamp()-interval '10 minutes' or status='running' and lease_until<statement_timestamp())),
  'pending_moderations',(select count(*) from private.grade_moderations m join public.exam_attempts a on a.id=m.attempt_id where a.organization_id=org and m.state='pending'),
  'blocked_publications',(select count(*) from private.result_publications where organization_id=org and state='blocked'),
  'backup',(select jsonb_build_object('id',id,'completed_at',updated_at,'checksum',result_checksum,'parts',(select count(*) from private.backup_parts where job_id=j.id),'captured_after_coverage_fix',created_at>=(select applied_at from private.operational_baseline where id)) from private.work_jobs j where organization_id=org and kind='backup' and status='succeeded' order by created_at desc limit 1)
 ) into result from private.app_settings s where s.organization_id=org;
 if result is null then raise exception 'Konfigurasi organisasi belum tersedia';end if;return result;
end$$;
-- Timestamp marks capability upgrade, not successful backup/restore evidence.
create table private.operational_baseline(id boolean primary key default true check(id),applied_at timestamptz not null default clock_timestamp());
insert into private.operational_baseline default values;
alter table private.operational_baseline enable row level security;
revoke all on private.operational_baseline from public,anon,authenticated;
create function public.operational_snapshot() returns jsonb language sql security invoker set search_path='' as $$select private.operational_snapshot()$$;
revoke all on function private.operational_snapshot(),public.operational_snapshot() from public,anon,authenticated;
grant execute on function private.operational_snapshot(),public.operational_snapshot() to authenticated;

-- Preserve PostgreSQL numeric precision across JSON/JavaScript backup transport.
-- Keep the existing nonce/lease/service-role authorization before projecting data.
alter function private.worker_command(jsonb) rename to worker_command_before_acceptance;
revoke all on function private.worker_command_before_acceptance(jsonb) from public,anon,authenticated,service_role;
create function private.worker_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=private.worker_command_before_acceptance(input);
 if input->>'action'='data' then
  select coalesce(jsonb_agg(jsonb_build_object('ordinal',x->'ordinal','table',x->'table','record',(x->'record')::text) order by (x->>'ordinal')::bigint),'[]') into result from jsonb_array_elements(result) x;
 end if;return result;
end$$;
revoke all on function private.worker_command(jsonb) from public,anon,authenticated;
grant execute on function private.worker_command(jsonb) to service_role;
