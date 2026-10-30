-- Evaluation only: AI remains disabled and SEB is not required for attempts.
create table private.advanced_evaluations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references public.profiles(id),request_id uuid not null,input_hash text not null,
 candidate_sha text not null check(candidate_sha ~ '^[a-f0-9]{40}$'),
 platform text not null check(platform in ('Windows','macOS','iOS','other')),
 device_label text not null check(length(trim(device_label)) between 2 and 100),
 seb_version text not null check(length(trim(seb_version)) between 1 and 50),
 checks jsonb not null,notes text not null check(length(trim(notes)) between 10 and 2000),
 evidence_ref text not null check(length(evidence_ref) between 5 and 200 and evidence_ref ~ '^[a-zA-Z0-9_./ -]+$'),
 recorded_at timestamptz not null default clock_timestamp(),unique(actor_id,request_id)
);
create index advanced_evaluations_org_time on private.advanced_evaluations(organization_id,recorded_at desc,id);
alter table private.advanced_evaluations enable row level security;
revoke all on private.advanced_evaluations from public,anon,authenticated;
create function private.advanced_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Riwayat evaluasi tidak dapat diubah/dihapus';end$$;
revoke all on function private.advanced_immutable() from public,anon,authenticated;
create trigger advanced_immutable before update or delete on private.advanced_evaluations for each row execute function private.advanced_immutable();
create function private.advanced_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.actor_org();op text:=input->>'action';req uuid;old private.advanced_evaluations;hash text;target uuid;entry record;begin
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin aktif';end if;
 if op='list' then return jsonb_build_object('ai_enabled',false,'seb_enforced',false,'rows',coalesce((select jsonb_agg(to_jsonb(x)-'input_hash'-'request_id'-'organization_id' order by recorded_at desc) from(select * from private.advanced_evaluations where organization_id=org order by recorded_at desc,id limit 50 offset(greatest(1,least(10000,coalesce((input->>'page')::int,1)))-1)*50)x),'[]'),'total',(select count(*) from private.advanced_evaluations where organization_id=org));end if;
 if op<>'record' then raise exception 'Aksi tidak dikenal';end if;
 req:=(input->>'request_id')::uuid;if req is null then raise exception 'Request ID wajib';end if;
 if coalesce(input->>'candidate_sha','') !~ '^[a-f0-9]{40}$' or coalesce(input->>'platform','') not in ('Windows','macOS','iOS','other') or length(trim(coalesce(input->>'device_label',''))) not between 2 and 100 or length(trim(coalesce(input->>'seb_version',''))) not between 1 and 50 or length(trim(coalesce(input->>'notes',''))) not between 10 and 2000 or length(coalesce(input->>'evidence_ref','')) not between 5 and 200 or input->>'evidence_ref' !~ '^[a-zA-Z0-9_./ -]+$' then raise exception 'Data evaluasi tidak valid';end if;
 if jsonb_typeof(input->'checks') is distinct from 'object' then raise exception 'Checklist wajib';end if;
 if (select count(*) from jsonb_object_keys(input->'checks'))<>6 then raise exception 'Enam hasil uji wajib';end if;
 for entry in select * from jsonb_each(input->'checks') loop if entry.key not in ('login','questions','media','canvas','recovery','submit') or jsonb_typeof(entry.value)<>'boolean' then raise exception 'Hasil uji harus boolean dan memakai kategori resmi';end if;end loop;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||req::text,0));
 select * into old from private.advanced_evaluations where actor_id=auth.uid() and request_id=req;
 if found then if old.organization_id<>org or old.input_hash<>hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('id',old.id);end if;
 insert into private.advanced_evaluations(organization_id,actor_id,request_id,input_hash,candidate_sha,platform,device_label,seb_version,checks,notes,evidence_ref) values(org,auth.uid(),req,hash,input->>'candidate_sha',input->>'platform',trim(input->>'device_label'),trim(input->>'seb_version'),input->'checks',trim(input->>'notes'),input->>'evidence_ref') returning id into target;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id,request_id) values(org,auth.uid(),'ADVANCED_EVALUATION_RECORDED','advanced_evaluations',target::text,req);
 return jsonb_build_object('id',target);
end$$;
create function public.advanced_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.advanced_command(input)$$;
revoke all on function private.advanced_command(jsonb),public.advanced_command(jsonb) from public,anon,authenticated;
grant execute on function private.advanced_command(jsonb),public.advanced_command(jsonb) to authenticated;
-- Existing report permission, ownership, version pinning and lease checks are retained.
alter table private.export_jobs drop constraint export_jobs_kind_check;
alter table private.export_jobs add constraint export_jobs_kind_check check(kind in ('recap','class','student','paper','answers','blank','analytics','exchange'));
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.report_command(jsonb)'::regprocedure);
 if position($anchor$'recap','class','student','paper','answers','blank','analytics'$anchor$ in definition)=0 then raise exception 'Report validation anchor changed';end if;
 definition:=replace(definition,$anchor$'recap','class','student','paper','answers','blank','analytics'$anchor$,$new$'recap','class','student','paper','answers','blank','analytics','exchange'$new$);
 execute definition;
end$$;
