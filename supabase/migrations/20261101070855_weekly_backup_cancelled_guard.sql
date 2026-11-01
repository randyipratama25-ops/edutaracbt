-- An intentionally cancelled backup is terminal and cannot be retried.
-- It must not block future weekly backups or count as an unresolved queue failure.
do $patch$ declare definition text;needle text;begin
 select pg_get_functiondef('private.scheduler_tick(timestamptz)'::regprocedure) into definition;
 needle:='and kind=''backup'' and status in (''queued'',''running'',''failed'',''blocked'')) then';
 if strpos(definition,needle)=0 then raise exception 'Weekly backup cancellation anchor missing';end if;
 execute replace(definition,needle,'and kind=''backup'' and status in (''queued'',''running'',''failed'',''blocked'') and payload->>''outcome'' is distinct from ''cancelled'') then');
 select pg_get_functiondef('private.operational_health(jsonb)'::regprocedure) into definition;
 needle:='''heartbeat_at'',(select last_success_at';
 if strpos(definition,needle)=0 then raise exception 'Operational queue anchor missing';end if;
 execute replace(definition,needle,'''job_issues'',(select count(*) from private.work_jobs where organization_id=org and status in (''failed'',''blocked'',''uncertain'') and payload->>''outcome'' is distinct from ''cancelled''),''heartbeat_at'',(select last_success_at');
end $patch$;
