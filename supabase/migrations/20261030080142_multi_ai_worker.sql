create table private.ai_calls(id uuid primary key default gen_random_uuid(),actor_id uuid not null,organization_id uuid not null,session_id text not null,request_id uuid not null,attempt_id uuid not null,question_id uuid not null,provider text not null,model text not null,config_version int not null,basis_revision int not null,payload jsonb not null,status text not null default 'queued',lease uuid,started_at timestamptz,created_at timestamptz not null default now(),unique(actor_id,request_id,attempt_id,question_id));
alter table private.ai_calls enable row level security;revoke all on private.ai_calls from public,anon,authenticated;
create function private.ai_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare org uuid:=private.actor_org();c private.ai_provider_configs;a public.exam_attempts;q private.attempt_questions;x jsonb;j private.ai_calls;outp jsonb:='[]';answer text;begin
 if not private.is_grader() then raise exception 'AUTH';end if;
 if input->>'action'='list' then return coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'model',model)) from private.ai_provider_configs where organization_id=org and enabled and consent and tested_version=version),'[]');end if;
 select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider';
 if input->>'action'='test_authorize' then if not private.is_admin() or c.provider is null then raise exception 'AUTH';end if;if not public.consume_login_budget('ai-test:'||auth.uid()::text) then raise exception 'Batas uji koneksi tercapai';end if;return '{}';end if;
 if input->>'action'<>'enqueue' or c.provider is null or not c.enabled or not c.consent or c.tested_version is distinct from c.version then raise exception 'Penyedia belum aktif';end if;
 if jsonb_array_length(input->'items') not between 1 and 5 or nullif(input->>'request_id','') is null then raise exception 'Pilih 1–5 esai';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||c.provider,18));
 if (select count(*) from private.ai_calls where organization_id=org and provider=c.provider and created_at>=current_date)+jsonb_array_length(input->'items')>c.daily_limit then raise exception 'Batas harian tercapai';end if;
 for x in select value from jsonb_array_elements(input->'items') loop
  if not private.can_grade((x->>'attempt_id')::uuid) then raise exception 'AUTH';end if;
  select * into a from public.exam_attempts where id=(x->>'attempt_id')::uuid;
  select * into q from private.attempt_questions where attempt_id=a.id and question_id=(x->>'question_id')::uuid;
  if q.question_id is null or q.grading_payload->>'type'<>'Esai' or jsonb_array_length(coalesce(q.grading_payload->'rubricCriteria','[]'))>0 or a.status='disqualified' then raise exception 'Gunakan koreksi manual untuk esai rubrik kriteria atau peserta diskualifikasi';end if;
  select value->>'text' into answer from public.attempt_answers where attempt_id=a.id and question_id=q.question_id;
  if length(trim(coalesce(answer,'')))=0 or length(answer)>30000 then raise exception 'Jawaban teks kosong/terlalu panjang';end if;
  insert into private.ai_calls(actor_id,organization_id,session_id,request_id,attempt_id,question_id,provider,model,config_version,basis_revision,payload) values(auth.uid(),org,auth.jwt()->>'session_id',(input->>'request_id')::uuid,a.id,q.question_id,c.provider,c.model,c.version,a.grading_revision,jsonb_build_object('question',regexp_replace(q.grading_payload->>'stem','<[^>]*>','','g'),'rubric',q.grading_payload->>'rubric','answer',regexp_replace(answer,'<[^>]*>','','g'),'max_points',(q.grading_payload->>'points')::numeric,'criteria','[]'::jsonb)) on conflict(actor_id,request_id,attempt_id,question_id) do nothing;
  select * into j from private.ai_calls where actor_id=auth.uid() and request_id=(input->>'request_id')::uuid and attempt_id=a.id and question_id=q.question_id;
  if j.provider<>c.provider then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  outp:=outp||jsonb_build_array(jsonb_build_object('id',j.id));
 end loop;return outp;
end$$;
create function public.ai_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ai_command(input)$$;
revoke all on function private.ai_command(jsonb),public.ai_command(jsonb) from public,anon,authenticated;grant execute on function private.ai_command(jsonb),public.ai_command(jsonb) to authenticated;
create function private.ai_worker(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c private.ai_provider_configs;j private.ai_calls;org uuid;k text;outp jsonb:=input->'output';begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'AUTH';end if;
 if input->>'action' in ('test_credentials','tested') then
  select organization_id into org from public.profiles where id=(input->>'actor_id')::uuid and role='admin' and active and archived_at is null;
  if org is null then raise exception 'AUTH';end if;
  select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider';
  if input->>'action'='tested' then if c.version<>(input->>'version')::int then raise exception 'CONFLICT';end if;update private.ai_provider_configs set tested_version=version,enabled=consent where organization_id=org and provider=c.provider;return '{}';end if;
 else
  select * into j from private.ai_calls where id=(input->>'id')::uuid and actor_id=(input->>'actor_id')::uuid for update;
  if j.id is null then raise exception 'AUTH';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',j.actor_id,'session_id',j.session_id)::text,true);
  if not private.can_grade(j.attempt_id) then raise exception 'AUTH';end if;
  org:=j.organization_id;select * into c from private.ai_provider_configs where organization_id=org and provider=j.provider;
  if not c.enabled or not c.consent or c.version<>j.config_version or not exists(select 1 from public.exam_attempts where id=j.attempt_id and grading_revision=j.basis_revision and status<>'disqualified') then update private.ai_calls set status='failed' where id=j.id;return jsonb_build_object('status','failed');end if;
  if input->>'action'='finish' then
   if j.status<>'processing' or j.lease is distinct from (input->>'lease')::uuid or now()>j.started_at+interval '2 minutes' then raise exception 'CONFLICT';end if;
   if outp->'ok'='true'::jsonb and ((outp->>'points')::numeric<0 or (outp->>'points')::numeric>(j.payload->>'max_points')::numeric) then raise exception 'Skor tidak valid';end if;
   insert into private.ai_grading_suggestions(attempt_id,question_id,basis_revision,provider,model,prompt_version,input_hash,points,reason,status,requested_by) values(j.attempt_id,j.question_id,j.basis_revision,j.provider,j.model,'essay-rubric-v2',encode(extensions.digest(j.payload::text,'sha256'),'hex'),case when outp->'ok'='true'::jsonb then (outp->>'points')::numeric else null end,left(coalesce(outp->>'reason',outp->>'error','Saran gagal'),4000),case when outp->'ok'='true'::jsonb then 'pending' else 'failed' end,j.actor_id);
   update private.ai_calls set status=case when outp->'ok'='true'::jsonb then 'pending' else 'failed' end,lease=null where id=j.id returning * into j;return jsonb_build_object('status',j.status);
  end if;
  if input->>'action'<>'claim' or j.status<>'queued' then return jsonb_build_object('claimed',false,'status',j.status);end if;
  update private.ai_calls set status='processing',lease=gen_random_uuid(),started_at=now() where id=j.id returning * into j;
 end if;
 select v.decrypted_secret into k from vault.decrypted_secrets v join private.ai_credentials r on r.vault_id=v.id where r.organization_id=org and r.provider=c.provider;
 if k is null then raise exception 'API key belum tersedia';end if;
 return jsonb_build_object('claimed',true,'provider',c.provider,'model',c.model,'version',c.version,'key',k,'payload',j.payload,'lease',j.lease);
end$$;
create function public.ai_worker(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ai_worker(input)$$;
revoke all on function private.ai_worker(jsonb),public.ai_worker(jsonb) from public,anon,authenticated;grant usage on schema private to service_role;grant execute on function private.ai_worker(jsonb),public.ai_worker(jsonb) to service_role;
