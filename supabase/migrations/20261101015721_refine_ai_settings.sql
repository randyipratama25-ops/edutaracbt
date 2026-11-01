alter table private.ai_provider_configs add column last_tested_at timestamptz;
create index ai_calls_usage on private.ai_calls(organization_id,provider,created_at);
alter function private.ai_configuration(jsonb) rename to ai_configuration_before_refine;
create function private.ai_configuration(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare org uuid:=private.actor_org();c private.ai_provider_configs;result jsonb;begin
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin aktif';end if;
 if input->>'action'='list' then
  return coalesce((select jsonb_agg(x.item||jsonb_build_object('tested',coalesce(pc.tested_version=pc.version,false),'last_tested_at',pc.last_tested_at,'used_today',(select count(*) from private.ai_calls a where a.organization_id=org and a.provider=pc.provider and a.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'failed_today',(select count(*) from private.ai_calls a where a.organization_id=org and a.provider=pc.provider and a.status='failed' and a.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))) from jsonb_array_elements(private.ai_configuration_before_refine(input)) x(item) join private.ai_provider_configs pc on pc.organization_id=org and pc.provider=x.item->>'provider'),'[]');
 end if;
 if input->>'action' in ('activate','disable') then
  select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider' for update;
  if c.provider is null or c.version is distinct from (input->>'version')::int then raise exception 'CONFLICT: Konfigurasi berubah. Muat ulang';end if;
  if input->>'action'='activate' and (not c.consent or c.tested_version is distinct from c.version or not exists(select 1 from private.ai_credentials k where k.organization_id=org and k.provider=c.provider)) then raise exception 'Izin data, key dan uji koneksi terkini diperlukan';end if;
  update private.ai_provider_configs set enabled=input->>'action'='activate',version=version+1,tested_version=case when input->>'action'='activate' then version+1 else null end where organization_id=org and provider=c.provider;
  insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,auth.uid(),'AI_PROVIDER_'||(input->>'action'),'ai_provider',c.provider);
  return jsonb_build_object('saved',true);
 end if;
 return private.ai_configuration_before_refine(input);
end$$;
revoke all on function private.ai_configuration_before_refine(jsonb),private.ai_configuration(jsonb) from public,anon,authenticated;
grant execute on function private.ai_configuration(jsonb) to authenticated;
do $$declare d text;begin d:=pg_get_functiondef('private.ai_worker(jsonb)'::regprocedure);if position('tested_version=version,enabled=consent' in d)=0 then raise exception 'AI worker anchor changed';end if;execute replace(d,'tested_version=version,enabled=consent','tested_version=version,enabled=false,last_tested_at=clock_timestamp()');end$$;
