-- Only authenticated staff RPCs open authoring. No direct write grants or student key access.
alter table public.exams add column bypass_period boolean not null default false, add column shuffle_questions boolean not null default false, add column shuffle_options boolean not null default false, add column created_by uuid references public.profiles(id);
create table public.authoring_periods(organization_id uuid primary key references public.organizations(id),enabled boolean not null default false,starts_at timestamptz,ends_at timestamptz,check(not enabled or (starts_at is not null and ends_at>=starts_at)));
alter table public.authoring_periods enable row level security;
create policy period_read on public.authoring_periods for select to authenticated using(organization_id=private.actor_org() and exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','teacher')));
grant select on public.authoring_periods to authenticated;
create table private.authoring_requests(exam_id uuid not null references public.exams(id),actor_id uuid not null,key uuid not null,input jsonb not null,result jsonb not null,primary key(exam_id,actor_id,key));
alter table private.authoring_requests enable row level security;
create table public.question_attachments(id uuid primary key default gen_random_uuid(),question_id uuid not null references public.questions(id),media_id uuid not null references public.media_assets(id),unique(question_id,media_id));
alter table public.question_attachments enable row level security;
create index questions_exam_type on public.questions(exam_id,type) where archived_at is null;
create index question_attachments_media on public.question_attachments(media_id);
create index exam_classes_class on public.exam_classes(class_id,exam_id);
create or replace function private.can_author(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.exams e join public.profiles p on p.id=auth.uid() where e.id=target and e.organization_id=private.actor_org() and (p.role='admin' or (p.role='teacher' and exists(select 1 from public.exam_classes c where c.exam_id=e.id) and not exists(select 1 from public.exam_classes c where c.exam_id=e.id and not exists(select 1 from public.teacher_assignments t where t.teacher_id=p.id and t.subject_id=e.subject_id and t.class_id=c.class_id and t.active and t.organization_id=e.organization_id))))) $$;
revoke all on function private.can_author(uuid) from public,anon;
grant execute on function private.can_author(uuid) to authenticated;
create policy author_exam_read on public.exams for select to authenticated using(private.can_author(id));
-- Explicit columns exclude PIN hash from all clients.
grant select(id,organization_id,subject_id,title,starts_at,ends_at,duration_minutes,status,passing_grade,policy_version,bypass_period,shuffle_questions,shuffle_options,created_by) on public.exams to authenticated;
create policy author_class_read on public.exam_classes for select to authenticated using(private.can_author(exam_id));
create policy author_config_read on public.exam_type_configs for select to authenticated using(private.can_author(exam_id));
create policy author_question_read on public.questions for select to authenticated using(private.can_author(exam_id));
create policy author_version_read on public.question_versions for select to authenticated using(exists(select 1 from public.questions q where q.id=question_id and private.can_author(q.exam_id)));
create policy author_attachment_read on public.question_attachments for select to authenticated using(exists(select 1 from public.questions q where q.id=question_id and private.can_author(q.exam_id)));
grant select on public.exam_classes,public.exam_type_configs,public.questions,public.question_versions,public.question_attachments to authenticated;
create or replace function private.author_guard(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.exams; p public.authoring_periods; begin
 if not private.can_author(target) then raise exception 'AUTH: Ujian tidak dapat diakses.'; end if;
 select * into e from public.exams where id=target for update;
 if e.starts_at<=now() or e.status in ('active','closed','archived') then raise exception 'LOCKED: Soal terkunci setelah ujian mulai/ditutup.';end if;
 select * into p from public.authoring_periods where organization_id=e.organization_id;
 if not private.is_admin() and not e.bypass_period and p.enabled and not(now() between p.starts_at and p.ends_at) then raise exception 'PERIOD: Di luar periode input soal.';end if;
end $$;
-- Validation is repeated in Postgres so callers cannot bypass the Next.js API.
create or replace function private.validate_question(v jsonb) returns void language plpgsql set search_path='' as $$
declare k text; n int; i int; stripped text; begin
 if jsonb_typeof(v)<>'object' or v->>'type' not in ('PG','PG_KOMPLEKS','BS','JODOH','Esai') or v->>'type' is null then raise exception 'Tipe soal tidak valid';end if;
 if length(trim(v->>'stem')) not between 1 and 50000 or v->>'stem' is null then raise exception 'Isi soal wajib';end if;
 foreach k in array array['stem','explanation'] loop
 stripped:=regexp_replace(coalesce(v->>k,''),'</?(p|br|b|strong|i|em|u|sub|sup|ul|ol|li|blockquote)>','','gi');
 if stripped like '%<%' then raise exception 'HTML berbahaya/tidak didukung';end if;end loop;
 if (v->>'points')::numeric not between 0.000001 and 10000 then raise exception 'Poin tidak valid';end if;
 if jsonb_typeof(v->'options')<>'array' or jsonb_typeof(v->'key')<>'array' or jsonb_typeof(v->'attachments')<>'array' then raise exception 'Struktur soal tidak valid';end if;
 n:=jsonb_array_length(v->'options');
 if n>50 or jsonb_array_length(v->'key')>50 or jsonb_array_length(v->'attachments')>10 or length(coalesce(v->>'explanation',''))>20000 or length(coalesce(v->>'rubric',''))>20000 then raise exception 'Batas isi soal terlampaui';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(v->'options') x)<>n or exists(select 1 from jsonb_array_elements(v->'options') x where coalesce(x->>'id','') !~ '^[a-zA-Z0-9_-]{1,40}$' or length(trim(coalesce(x->>'text',''))) not between 1 and 10000) then raise exception 'Opsi tidak valid';end if;
 if v->>'type' in ('PG','PG_KOMPLEKS') then
 if n not between 2 and 6 or jsonb_array_length(v->'key')<1 or (v->>'type'='PG' and jsonb_array_length(v->'key')<>1) or exists(select 1 from jsonb_array_elements_text(v->'key') a where not exists(select 1 from jsonb_array_elements(v->'options') b where b->>'id'=a)) or (select count(distinct a) from jsonb_array_elements_text(v->'key') a)<>jsonb_array_length(v->'key') then raise exception 'Kunci PG tidak valid';end if;
 elsif v->>'type'='BS' then
 if n<1 or n<>jsonb_array_length(v->'key') or exists(select 1 from jsonb_array_elements_text(v->'key') a where a not in ('true','false')) then raise exception 'Kunci BS tidak valid';end if;
 elsif v->>'type'='JODOH' then
 if n<2 or n<>jsonb_array_length(v->'key') or exists(select 1 from jsonb_array_elements_text(v->'key') a where length(trim(a))=0) then raise exception 'Pasangan tidak valid';end if;
 elsif n<>0 or jsonb_array_length(v->'key')<>0 then raise exception 'Esai tanpa opsi/kunci';end if;
 if (v->>'minChars')::int not between 0 and 50000 or v->>'direction' not in ('rtl','ltr') then raise exception 'Metadata soal tidak valid';end if;
end $$;
create or replace function private.author_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a text:=input->>'action'; org uuid:=private.actor_org(); eid uuid; e public.exams; q public.questions; v jsonb; c jsonb; x jsonb; qid uuid; cnt int; seq int; res jsonb:='[]'; conf public.exam_type_configs; req uuid; oldreq private.authoring_requests; ids uuid[]; mid uuid; saved int:=0; pos int:=0; err text; source uuid; role_name text;
begin
 select role into role_name from public.profiles where id=auth.uid() and active;
 if org is null or role_name not in ('admin','teacher') then raise exception 'AUTH: Akses staf diperlukan';end if;
 if a='period' then
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin';end if;
 insert into public.authoring_periods values(org,(input->>'enabled')::boolean,(input->>'starts_at')::timestamptz,(input->>'ends_at')::timestamptz) on conflict(organization_id) do update set enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 return jsonb_build_object('saved',true);end if;
 if a='exam' then
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin mengatur jadwal';end if;
 v:=input->'exam';eid:=nullif(v->>'id','')::uuid;
 if eid is not null then
 select * into e from public.exams where id=eid and organization_id=org for update;
 if not found then raise exception 'AUTH: Ujian tidak tersedia';end if;
 if e.starts_at<=now() or e.status in ('active','closed','archived') then
 -- Only administrative closure/archive is allowed once locked, never reopen or shift start.
 if v->>'status' not in ('closed','archived') then raise exception 'LOCKED: Ujian telah dimulai';end if;
 update public.exams set status=v->>'status' where id=eid;return jsonb_build_object('id',eid);end if;
 end if;
 if length(trim(v->>'title')) not between 1 and 150 or jsonb_array_length(v->'class_ids') not between 1 and 100 or jsonb_array_length(v->'configs')<>5 or (select count(distinct x->>'type') from jsonb_array_elements(v->'configs') x)<>5 then raise exception 'Konfigurasi ujian tidak lengkap';end if;
 if not exists(select 1 from public.subjects where id=(v->>'subject_id')::uuid and organization_id=org and active) or exists(select 1 from jsonb_array_elements_text(v->'class_ids') id where not exists(select 1 from public.classes where classes.id=id::uuid and organization_id=org and active)) then raise exception 'Mapel/kelas tidak aktif';end if;
 if (v->>'starts_at')::timestamptz<=now() then raise exception 'Waktu mulai baru harus di masa depan';end if;
 if eid is null and coalesce(v->>'pin','') !~ '^[0-9]{4,12}$' then raise exception 'PIN 4–12 digit wajib';end if;
 if v ? 'pin' and v->>'pin' !~ '^[0-9]{4,12}$' then raise exception 'PIN tidak valid';end if;
 if eid is null then
 insert into public.exams(organization_id,subject_id,title,starts_at,ends_at,duration_minutes,pin_hash,status,passing_grade,bypass_period,shuffle_questions,shuffle_options,created_by) values(org,(v->>'subject_id')::uuid,v->>'title',(v->>'starts_at')::timestamptz,(v->>'ends_at')::timestamptz,(v->>'duration_minutes')::int,extensions.crypt(v->>'pin',extensions.gen_salt('bf')),v->>'status',(v->>'passing_grade')::numeric,(v->>'bypass_period')::boolean,(v->>'shuffle_questions')::boolean,(v->>'shuffle_options')::boolean,auth.uid()) returning id into eid;
 else update public.exams set subject_id=(v->>'subject_id')::uuid,title=v->>'title',starts_at=(v->>'starts_at')::timestamptz,ends_at=(v->>'ends_at')::timestamptz,duration_minutes=(v->>'duration_minutes')::int,pin_hash=case when v ? 'pin' then extensions.crypt(v->>'pin',extensions.gen_salt('bf')) else pin_hash end,status=v->>'status',passing_grade=(v->>'passing_grade')::numeric,bypass_period=(v->>'bypass_period')::boolean,shuffle_questions=(v->>'shuffle_questions')::boolean,shuffle_options=(v->>'shuffle_options')::boolean where id=eid;end if;
 delete from public.exam_classes where exam_id=eid;
 insert into public.exam_classes select org,eid,id::uuid from jsonb_array_elements_text(v->'class_ids') id group by id;
 for c in select * from jsonb_array_elements(v->'configs') loop
 if (c->>'max_questions')::int<0 or (c->>'default_points')::numeric<=0 or (c->>'option_count')::int not between 2 and 6 then raise exception 'Konfigurasi tipe tidak valid';end if;
 select count(*) into cnt from public.questions where exam_id=eid and type=c->>'type' and archived_at is null;
 if cnt>0 and (not(c->>'enabled')::boolean or ((c->>'max_questions')::int>0 and cnt>(c->>'max_questions')::int) or exists(select 1 from public.questions q join public.question_versions z on z.question_id=q.id and z.version=q.current_version where q.exam_id=eid and q.type=c->>'type' and q.archived_at is null and q.type in ('PG','PG_KOMPLEKS') and jsonb_array_length(z.payload->'options')<>(c->>'option_count')::int)) then raise exception 'Konfigurasi bertentangan dengan soal yang tersimpan';end if;
 insert into public.exam_type_configs values(eid,c->>'type',(c->>'enabled')::boolean,(c->>'max_questions')::int,(c->>'option_count')::int,(c->>'default_points')::numeric) on conflict(exam_id,type) do update set enabled=excluded.enabled,max_questions=excluded.max_questions,option_count=excluded.option_count,default_points=excluded.default_points;end loop;
 return jsonb_build_object('id',eid);
 end if;
 if a='archive_exams' then
 if not private.is_admin() or jsonb_array_length(input->'ids') not between 1 and 500 then raise exception 'AUTH: Arsip tidak valid';end if;
 update public.exams set status='archived' where organization_id=org and id in (select id::uuid from jsonb_array_elements_text(input->'ids') id);
 return jsonb_build_object('saved',true);end if;
 if a='duplicate_exam' then
 if not private.is_admin() then raise exception 'AUTH: Hanya Admin';end if;
 select * into e from public.exams where id=(input->>'exam_id')::uuid and organization_id=org;
 if not found then raise exception 'AUTH: Ujian tidak tersedia';end if;
 if coalesce(input->>'pin','') !~ '^[0-9]{4,12}$' then raise exception 'PIN baru wajib';end if;
 insert into public.exams(organization_id,subject_id,title,starts_at,ends_at,duration_minutes,pin_hash,status,passing_grade,bypass_period,shuffle_questions,shuffle_options,created_by) values(org,e.subject_id,left(e.title||' — salinan',150),greatest(e.starts_at,now()+interval '1 day'),greatest(e.ends_at,now()+interval '1 day'+(e.ends_at-e.starts_at)),e.duration_minutes,extensions.crypt(input->>'pin',extensions.gen_salt('bf')),'draft',e.passing_grade,e.bypass_period,e.shuffle_questions,e.shuffle_options,auth.uid()) returning id into eid;
 insert into public.exam_classes select org,eid,class_id from public.exam_classes where exam_id=e.id;
 insert into public.exam_type_configs select eid,type,enabled,max_questions,option_count,default_points from public.exam_type_configs where exam_id=e.id;
 return jsonb_build_object('id',eid);end if;
 eid:=(input->>'exam_id')::uuid;
 perform private.author_guard(eid);
 if a='archive_questions' then
 if jsonb_array_length(input->'ids') not between 1 and 500 then raise exception 'Maksimal 500 soal';end if;
 update public.questions set archived_at=now() where exam_id=eid and id in(select id::uuid from jsonb_array_elements_text(input->'ids') id);return jsonb_build_object('saved',true);end if;
 if a not in ('questions','copy') then raise exception 'Aksi tidak dikenal';end if;
 req:=(input->>'request_id')::uuid;
 if req is null then raise exception 'Idempotency key wajib';end if;
 select * into oldreq from private.authoring_requests where exam_id=eid and actor_id=auth.uid() and key=req;
 if found then if oldreq.input<>input then raise exception 'Idempotency key digunakan untuk isi berbeda';end if;return oldreq.result;end if;
 if a='copy' then
 source:=(input->>'source_exam_id')::uuid;
 if not private.can_author(source) or source=eid then raise exception 'AUTH: Sumber tidak valid';end if;
 if jsonb_array_length(input->'ids') not between 1 and 500 then raise exception 'Maksimal 500 soal';end if;
 select jsonb_agg(z.payload) into v from public.questions q join public.question_versions z on z.question_id=q.id and z.version=q.current_version where q.exam_id=source and q.archived_at is null and q.id in(select id::uuid from jsonb_array_elements_text(input->'ids') id);
 else v:=input->'items';end if;
 if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v) not between 1 and 500 then raise exception 'Maksimal 500 soal, minimal satu';end if;
 for x in select * from jsonb_array_elements(v) loop
 pos:=pos+1;
 begin
 perform private.validate_question(x);
 select * into conf from public.exam_type_configs where exam_id=eid and type=x->>'type';
 if not found then raise exception 'CONFIG_MISSING';end if;
 if not conf.enabled then raise exception 'TYPE_DISABLED';end if;
 if x->>'type' in ('PG','PG_KOMPLEKS') and jsonb_array_length(x->'options')<>conf.option_count then raise exception 'OPTION_COUNT';end if;
 qid:=case when a='questions' then nullif(input->>'question_id','')::uuid else null end;
 if qid is not null then
 select * into q from public.questions where id=qid and exam_id=eid and archived_at is null;
 if not found then raise exception 'AUTH: Soal tidak tersedia';end if;
 if jsonb_array_length(v)<>1 or (input->>'expected_version')::int is distinct from q.current_version then raise exception 'CONFLICT: Versi soal telah berubah';end if;
 else q:=null;end if;
 select count(*) into cnt from public.questions where exam_id=eid and type=x->>'type' and archived_at is null and id<>coalesce(qid,'00000000-0000-0000-0000-000000000000'::uuid);
 if conf.max_questions>0 and cnt>=conf.max_questions then raise exception 'QUOTA';end if;
 if exists(select 1 from public.questions q1 join public.question_versions z on z.question_id=q1.id and z.version=q1.current_version where q1.exam_id=eid and q1.archived_at is null and q1.id<>coalesce(qid,'00000000-0000-0000-0000-000000000000'::uuid) and z.payload=x) then raise exception 'DUPLICATE';end if;
 for mid in select id::uuid from jsonb_array_elements_text(x->'attachments') id loop
 if not exists(select 1 from public.media_assets m where m.id=mid and m.organization_id=org and (private.is_admin() or m.uploader_id=auth.uid() or (a='copy' and exists(select 1 from public.question_attachments qa join public.questions qq on qq.id=qa.question_id where qa.media_id=mid and qq.exam_id=source)))) then raise exception 'AUTH: Lampiran tidak dapat diakses';end if;
 end loop;
 if qid is null then insert into public.questions(organization_id,exam_id,type,points) values(org,eid,x->>'type',(x->>'points')::numeric) returning id,current_version into qid,seq;
 else seq:=q.current_version+1;update public.questions set type=x->>'type',points=(x->>'points')::numeric,current_version=seq where id=qid;end if;
 insert into public.question_versions(question_id,version,payload) values(qid,seq,x);
 insert into public.question_attachments(question_id,media_id) select qid,id::uuid from jsonb_array_elements_text(x->'attachments') id on conflict do nothing;
 saved:=saved+1;res:=res||jsonb_build_array(jsonb_build_object('block',pos,'id',qid,'version',seq,'saved',true));
 exception when others then get stacked diagnostics err=message_text;res:=res||jsonb_build_array(jsonb_build_object('block',pos,'saved',false,'error',err));end;
 end loop;
 x:=jsonb_build_object('saved',saved,'skipped',pos-saved,'details',res);
 insert into private.authoring_requests values(eid,auth.uid(),req,input,x);
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,auth.uid(),a,'exams',eid::text);
 return x;
end $$;
-- Immutable history is not UPDATEable, even by a future grant.
create or replace function private.immutable_question_version() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Versi soal immutable';end $$;
create trigger immutable_version before update or delete on public.question_versions for each row execute function private.immutable_question_version();
revoke all on function private.author_guard(uuid),private.validate_question(jsonb),private.author_command(jsonb),private.immutable_question_version() from public,anon,authenticated;
grant execute on function private.author_command(jsonb) to authenticated;
create or replace function public.authoring_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.author_command(input)$$;
revoke all on function public.authoring_command(jsonb) from public,anon;
grant execute on function public.authoring_command(jsonb) to authenticated;
-- Effective status uses server time. Manual closed/archived are absorbing states.
create or replace function public.authoring_status(exam_id uuid) returns text language sql stable security invoker set search_path='' as $$select case when status in ('closed','archived','draft') then status when now()>=ends_at then 'closed' when status='active' or now()>=starts_at then 'active' else 'scheduled' end from public.exams where id=exam_id$$;
revoke all on function public.authoring_status(uuid) from public,anon;grant execute on function public.authoring_status(uuid) to authenticated;
create or replace function public.advance_exam_schedule() returns integer language plpgsql security invoker set search_path='' as $$declare n int;begin update public.exams set status=case when now()>=ends_at then 'closed' else 'active' end where status in ('scheduled','active') and (now()>=starts_at or now()>=ends_at);get diagnostics n=row_count;update public.exam_attempts set status='time_expired' where status='in_progress' and deadline_at<=now();return n;end$$;
revoke all on function public.advance_exam_schedule() from public,anon,authenticated;grant execute on function public.advance_exam_schedule() to service_role;
