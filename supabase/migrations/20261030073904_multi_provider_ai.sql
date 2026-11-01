create table if not exists private.ai_provider_configs(organization_id uuid not null references public.organizations(id),provider text not null check(provider in ('openai','anthropic','google','deepseek','mistral','groq','xai','openrouter')),model text not null,enabled boolean not null default false,consent boolean not null default false,daily_limit integer not null default 100,version integer not null default 1,tested_version integer,updated_at timestamptz not null default clock_timestamp(),primary key(organization_id,provider));
create table if not exists private.ai_credentials(organization_id uuid not null references public.organizations(id),provider text not null,vault_id uuid not null,primary key(organization_id,provider));
alter table private.ai_provider_configs enable row level security;
alter table private.ai_credentials enable row level security;
revoke all on private.ai_provider_configs,private.ai_credentials from public,anon,authenticated;
create or replace function private.ai_configuration(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.actor_org();p text:=input->>'provider';c private.ai_provider_configs;k uuid;begin
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin aktif';end if;
 if input->>'action'='list' then return coalesce((select jsonb_agg(jsonb_build_object('provider',a.provider,'model',a.model,'version',a.version,'enabled',a.enabled,'consent',a.consent,'daily_limit',a.daily_limit,'tested',a.tested_version=a.version,'configured',exists(select 1 from private.ai_credentials r where r.organization_id=org and r.provider=a.provider))) from private.ai_provider_configs a where a.organization_id=org),'[]');end if;
 if input->>'action'<>'save' or p is null or p not in ('openai','anthropic','google','deepseek','mistral','groq','xai','openrouter') then raise exception 'Aksi tidak valid';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||p,16));
 select * into c from private.ai_provider_configs where organization_id=org and provider=p for update;
 if coalesce((input->>'version')::int,-1)<>coalesce(c.version,0) then raise exception 'CONFLICT';end if;
 if coalesce(input->>'model','') !~ '^[a-zA-Z0-9_./:-]{1,150}$' or jsonb_typeof(input->'consent') is distinct from 'boolean' or (input->>'daily_limit')::int not between 1 and 1000 then raise exception 'Isian tidak valid';end if;
 if input ? 'api_key' then
  if length(input->>'api_key') not between 8 and 5000 then raise exception 'API key tidak valid';end if;
  select r.vault_id into k from private.ai_credentials r where r.organization_id=org and r.provider=p;
  if found then perform vault.update_secret(k,input->>'api_key');else select vault.create_secret(input->>'api_key','edutara-ai:'||org::text||':'||p) into k;insert into private.ai_credentials values(org,p,k);end if;
 end if;
 insert into private.ai_provider_configs(organization_id,provider,model,consent,daily_limit,version) values(org,p,input->>'model',(input->>'consent')::boolean,(input->>'daily_limit')::int,coalesce(c.version,0)+1) on conflict(organization_id,provider) do update set model=excluded.model,consent=excluded.consent,daily_limit=excluded.daily_limit,version=excluded.version,enabled=false,tested_version=null,updated_at=clock_timestamp();
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,auth.uid(),'AI_CONFIG_SAVED','ai_provider',p);
 return jsonb_build_object('saved',true);
end$$;
create or replace function public.ai_configuration(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ai_configuration(input)$$;
revoke all on function private.ai_configuration(jsonb),public.ai_configuration(jsonb) from public,anon,authenticated;
grant execute on function private.ai_configuration(jsonb),public.ai_configuration(jsonb) to authenticated;
