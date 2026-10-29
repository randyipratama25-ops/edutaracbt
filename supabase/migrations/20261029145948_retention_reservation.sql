create function private.retention_reserve(input jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j private.work_jobs;b private.work_jobs;begin
 select * into j from private.work_jobs where id=(input->>'id')::uuid for update;
 if not found or j.kind<>'retention' or j.status<>'running' or j.lease is distinct from (input->>'lease')::uuid or j.lease_until<clock_timestamp() then raise exception 'AUTH: Lease retensi tidak valid';end if;
 select * into b from private.work_jobs where id=(input->>'backup_id')::uuid for update;
 if not found or b.organization_id<>j.organization_id or b.kind<>'backup' or b.status not in ('succeeded','blocked','failed') or b.created_at>=clock_timestamp()-make_interval(days=>(select retention_days from private.app_settings where organization_id=j.organization_id)) or b.payload->>'outcome'='retired' then return false;end if;
 if b.id in(select id from private.work_jobs where organization_id=j.organization_id and kind='backup' and status='succeeded' order by created_at desc,id desc limit 2) then return false;end if;
 if b.payload->>'retention_job' is not null and b.payload->>'retention_job'<>j.id::text then return false;end if;
 update private.work_jobs set status='blocked',payload=payload||jsonb_build_object('outcome','retention_pending','retention_job',j.id::text),error='Retensi sedang memproses artefak; retry backup dinonaktifkan',nonce_hash=null,lease=null,lease_until=null where id=b.id;
 return true;
end$$;
create function public.retention_reserve(input jsonb) returns boolean language sql security invoker set search_path='' as $$select private.retention_reserve(input)$$;
revoke all on function private.retention_reserve(jsonb),public.retention_reserve(jsonb) from public,anon,authenticated;
grant execute on function private.retention_reserve(jsonb),public.retention_reserve(jsonb) to service_role;
do $$declare body text;begin
 body:=pg_get_functiondef('private.system_command(jsonb)'::regprocedure);
 if position('j.payload->>''outcome''=''cancelled''' in body)=0 then raise exception 'Unexpected system command source';end if;
 body:=replace(body,'j.payload->>''outcome''=''cancelled''','j.payload->>''outcome'' in (''cancelled'',''retention_pending'',''retired'')');execute body;
 body:=pg_get_functiondef('private.worker_command(jsonb)'::regprocedure);
 body:=replace(body,'error=''Artefak dihapus oleh retensi; riwayat dipertahankan'',result_path=null','error=''Artefak dihapus oleh retensi; riwayat dipertahankan'',payload=payload||''{"outcome":"retired"}''::jsonb,result_path=null');
 execute body;
end$$;

