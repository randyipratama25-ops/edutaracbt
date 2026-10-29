-- Read-only snapshot. Re-run immediately before any reviewed cutover.
-- Run via a privileged operator; never expose this as a public RPC.
begin transaction isolation level repeatable read read only;
select jsonb_build_object(
  'observed_at',clock_timestamp(),
  'active_attempts',(select count(*) from public.exam_attempts where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a' and finalized_at is null),
  'scheduler_count',(select count(*) from cron.job where jobname='edutara-operations' and active),
  'automation_enabled',(select automation_enabled from private.app_settings where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'),
  'full_worker_approved',(select full_worker_approved from private.worker_transport),
  'backup',(select jsonb_build_object('id',id,'status',status,'checksum',result_checksum,'created_at',created_at,'updated_at',updated_at) from private.work_jobs where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a' and kind='backup' and status='succeeded' order by created_at desc limit 1),
  'job_states',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from private.work_jobs where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a' group by status) x)
) as preflight;
commit;
