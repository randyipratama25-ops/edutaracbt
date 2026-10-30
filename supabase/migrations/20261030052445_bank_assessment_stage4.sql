-- Additive Stage 4. No rewrite of historical questions, answers, deadlines or scores.
create table private.bank_items(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),owner_id uuid not null references public.profiles(id),metadata jsonb not null,version integer not null default 1,state text not null default 'draft' check(state in ('draft','revision','approved','archived')),updated_at timestamptz not null default clock_timestamp());
create index bank_items_org_state on private.bank_items(organization_id,state);
create index bank_items_subject on private.bank_items((metadata->>'subject_id'));
create table private.bank_versions(item_id uuid not null references private.bank_items(id),version integer not null,metadata jsonb not null,payload jsonb not null,checksum text not null,actor_id uuid not null,reason text not null,created_at timestamptz not null default clock_timestamp(),primary key(item_id,version));
create index bank_versions_checksum on private.bank_versions(checksum);
create table private.bank_reviews(id uuid primary key default gen_random_uuid(),item_id uuid not null references private.bank_items(id),version integer not null,actor_id uuid not null,decision text not null,reason text not null,created_at timestamptz not null default clock_timestamp());
create index bank_reviews_item on private.bank_reviews(item_id,created_at desc);
create table private.bank_packs(id uuid primary key default gen_random_uuid(),exam_id uuid not null references public.exams(id),rules jsonb not null,actor_id uuid not null,created_at timestamptz not null default clock_timestamp());
create index bank_packs_exam on private.bank_packs(exam_id);
create table private.bank_usage(pack_id uuid not null references private.bank_packs(id),item_id uuid not null,bank_version integer not null,question_id uuid not null references public.questions(id),question_version integer not null,points numeric not null,primary key(pack_id,question_id),foreign key(item_id,bank_version) references private.bank_versions(item_id,version));
create index bank_usage_item on private.bank_usage(item_id,bank_version);
create index bank_usage_question on private.bank_usage(question_id,question_version);
create table private.bank_requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id));
create table private.grade_moderations(id uuid primary key default gen_random_uuid(),attempt_id uuid not null,question_id uuid not null,basis_revision integer not null,points numeric not null,criteria jsonb not null,comment text not null,reason text not null,proposed_by uuid not null,state text not null default 'pending' check(state in ('pending','approved','rejected')),decided_by uuid,decision_reason text,created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,foreign key(attempt_id,question_id) references private.attempt_questions(attempt_id,question_id));
create unique index moderation_one_pending on private.grade_moderations(attempt_id,question_id) where state='pending';
create table private.result_publications(exam_id uuid primary key references public.exams(id),organization_id uuid not null references public.organizations(id),scheduled_at timestamptz not null,state text not null check(state in ('scheduled','published','cancelled','blocked')),basis text not null,reason text not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),published_at timestamptz,error text);
create index publication_due on private.result_publications(scheduled_at) where state='scheduled';
create table private.assessment_requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id));
do $$declare t text;begin foreach t in array array['bank_items','bank_versions','bank_reviews','bank_packs','bank_usage','bank_requests','grade_moderations','result_publications','assessment_requests'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);end loop;end$$;

alter function private.validate_question(jsonb) rename to validate_question_before_bank;
create function private.validate_question(v jsonb) returns void language plpgsql set search_path='' as $$declare c jsonb;total numeric:=0;begin
 perform private.validate_question_before_bank(v);
 if v ? 'rubricCriteria' then
  if jsonb_typeof(v->'rubricCriteria') is distinct from 'array' or jsonb_array_length(v->'rubricCriteria')>12 then raise exception 'Rubrik maksimal 12 kriteria';end if;
  if jsonb_array_length(v->'rubricCriteria')>0 then
   if v->>'type'<>'Esai' or (select count(distinct x->>'id') from jsonb_array_elements(v->'rubricCriteria') x)<>jsonb_array_length(v->'rubricCriteria') then raise exception 'ID rubrik harus unik dan hanya untuk esai';end if;
   for c in select value from jsonb_array_elements(v->'rubricCriteria') loop
    if coalesce(c->>'id','') !~ '^[a-zA-Z0-9_-]{1,40}$' or length(trim(coalesce(c->>'label',''))) not between 1 and 250 or jsonb_typeof(c->'maxPoints') is distinct from 'number' or (c->>'maxPoints')::numeric<=0 then raise exception 'Kriteria rubrik tidak valid';end if;total:=total+(c->>'maxPoints')::numeric;
   end loop;
   if abs(total-(v->>'points')::numeric)>0.000001 then raise exception 'Total bobot rubrik harus sama dengan poin esai';end if;
  end if;
 end if;
end$$;
revoke all on function private.validate_question(jsonb),private.validate_question_before_bank(jsonb) from public,anon,authenticated;
do $patch$declare d text;begin select pg_get_functiondef('private.attempt_command_before_workflow(jsonb)'::regprocedure) into d;
 if position($a$student:=payload-array['key','rubric','explanation','keywords'];$a$ in d)=0 then raise exception 'Snapshot sanitization anchor missing';end if;
 execute replace(d,$a$student:=payload-array['key','rubric','explanation','keywords'];$a$,$b$student:=payload-array['key','rubric','rubricCriteria','explanation','keywords'];$b$);
 select pg_get_functiondef('private.attempt_dto(uuid)'::regprocedure) into d;
 if position('q.student_payload' in d)=0 then raise exception 'DTO sanitization anchor missing';end if;
 execute replace(d,'q.student_payload',$b$(q.student_payload-'rubricCriteria')$b$);
end$patch$;

create function private.bank_scope(p_meta jsonb) returns boolean language sql stable security definer set search_path='' as $$select private.is_grader() and exists(select 1 from public.subjects s where s.id=(p_meta->>'subject_id')::uuid and s.organization_id=private.actor_org() and s.active) and jsonb_typeof(p_meta->'class_ids')='array' and jsonb_array_length(p_meta->'class_ids')>0 and not exists(select 1 from jsonb_array_elements_text(p_meta->'class_ids') c where not exists(select 1 from public.classes x where x.id=c::uuid and x.organization_id=private.actor_org() and x.active)) and (private.is_admin() or not exists(select 1 from jsonb_array_elements_text(p_meta->'class_ids') c where not exists(select 1 from public.teacher_assignments t where t.teacher_id=auth.uid() and t.subject_id=(p_meta->>'subject_id')::uuid and t.class_id=c::uuid and t.active and t.organization_id=private.actor_org())))$$;
create function private.can_bank(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.bank_items b where b.id=p_id and b.organization_id=private.actor_org() and (private.is_admin() or private.bank_scope(b.metadata)))$$;
create function private.bank_media_ok(p_payload jsonb,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from jsonb_array_elements_text(p_payload->'attachments') m where not exists(select 1 from public.media_assets a join storage.objects o on o.bucket_id='exam-media' and o.name=a.object_path where a.id=m::uuid and a.organization_id=private.actor_org() and (private.is_admin() or a.uploader_id=auth.uid() or (private.can_bank(p_id) and exists(select 1 from private.bank_versions v where v.item_id=p_id and v.payload->'attachments' ? m)))))$$;
create function private.bank_store(p_meta jsonb,p_payload jsonb,p_id uuid,p_expected integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare oldrow private.bank_items;next_version int;hash text;begin
 if not private.bank_scope(p_meta) then raise exception 'AUTH: Kelas-mapel bank di luar penugasan';end if;
 if length(trim(coalesce(p_meta->>'topic',''))) not between 1 and 200 or length(trim(coalesce(p_meta->>'indicator',''))) not between 1 and 500 or coalesce(p_meta->>'difficulty','') not in ('easy','medium','hard') or coalesce(p_meta->>'cognitive','') not in ('C1','C2','C3','C4','C5','C6') or jsonb_array_length(p_meta->'class_ids')>100 then raise exception 'Kategori tidak lengkap';end if;
 perform private.validate_question(p_payload);if not private.bank_media_ok(p_payload,p_id) then raise exception 'Lampiran tidak tersedia atau di luar izin';end if;
 hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 if exists(select 1 from private.bank_items b join private.bank_versions v on v.item_id=b.id and v.version=b.version where b.organization_id=private.actor_org() and b.state<>'archived' and b.metadata->>'subject_id'=p_meta->>'subject_id' and v.checksum=hash and b.id<>coalesce(p_id,'00000000-0000-0000-0000-000000000000'::uuid)) then raise exception 'DUPLICATE: Soal identik sudah ada pada bank mapel';end if;
 if p_id is not null then
  select * into oldrow from private.bank_items where id=p_id for update;
  if not private.can_bank(p_id) or (not private.is_admin() and oldrow.owner_id<>auth.uid()) then raise exception 'AUTH: Hanya pemilik atau Admin mengubah soal';end if;
  if oldrow.version is distinct from p_expected then raise exception 'CONFLICT: Versi bank berubah';end if;
  next_version:=oldrow.version+1;update private.bank_items set metadata=p_meta,version=next_version,state='draft',updated_at=clock_timestamp() where id=p_id;
 else
  insert into private.bank_items(organization_id,owner_id,metadata) values(private.actor_org(),auth.uid(),p_meta) returning id into p_id;next_version:=1;
 end if;
 insert into private.bank_versions(item_id,version,metadata,payload,checksum,actor_id,reason) values(p_id,next_version,p_meta,p_payload,hash,auth.uid(),p_reason);return p_id;
end$$;
create function private.bank_pool(p_exam uuid,p_rule jsonb) returns table(item_id uuid,version integer,payload jsonb) language sql stable security definer set search_path='' as $$select b.id,b.version,v.payload from private.bank_items b join private.bank_versions v on v.item_id=b.id and v.version=b.version join public.exams e on e.id=p_exam join public.exam_type_configs c on c.exam_id=e.id and c.type=p_rule->>'type' and c.enabled where private.can_author(e.id) and private.can_bank(b.id) and b.state='approved' and b.metadata->>'subject_id'=e.subject_id::text and b.metadata->'class_ids' @> coalesce((select jsonb_agg(class_id::text) from public.exam_classes where exam_id=e.id),'[]') and v.payload->>'type'=p_rule->>'type' and (nullif(p_rule->>'topic','') is null or b.metadata->>'topic'=p_rule->>'topic') and (nullif(p_rule->>'difficulty','') is null or b.metadata->>'difficulty'=p_rule->>'difficulty') and (nullif(p_rule->>'cognitive','') is null or b.metadata->>'cognitive'=p_rule->>'cognitive') and (v.payload->>'type' not in ('PG','PG_KOMPLEKS') or jsonb_array_length(v.payload->'options')=c.option_count) and (v.payload->>'type'<>'Esai' or (v.payload->>'points')::numeric=(p_rule->>'points')::numeric) and not exists(select 1 from private.bank_usage u join private.bank_packs pk on pk.id=u.pack_id where u.item_id=b.id and pk.exam_id=p_exam)$$;

create function private.bank_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=input->>'action';p_id uuid:=nullif(input->>'id','')::uuid;req uuid:=nullif(input->>'request_id','')::uuid;prior private.bank_requests;b private.bank_items;v private.bank_versions;result jsonb;entry jsonb;rule jsonb;eid uuid;ex public.exams;candidate record;cfg public.exam_type_configs;selected_ids uuid[];pack uuid;qid uuid;assembled jsonb;n int;cnt int;decision text;rowa record;d jsonb;begin
 if not private.is_grader() then raise exception 'AUTH: Bank hanya untuk staf Admin/Guru';end if;
 if op='list' then
  with permitted as(select b.*,v.payload from private.bank_items b join private.bank_versions v on v.item_id=b.id and v.version=b.version where private.can_bank(b.id) and (coalesce(input->>'subject','')='' or b.metadata->>'subject_id'=input->>'subject') and (coalesce(input->>'state','')='' or b.state=input->>'state') and (coalesce(input->>'difficulty','')='' or b.metadata->>'difficulty'=input->>'difficulty') and (coalesce(input->>'cognitive','')='' or b.metadata->>'cognitive'=input->>'cognitive') and (coalesce(input->>'search','')='' or (b.metadata->>'topic')||' '||(b.metadata->>'indicator')||' '||(v.payload->>'stem') ilike '%'||(input->>'search')||'%')) select jsonb_build_object('total',(select count(*) from permitted),'rows',coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('can_edit',private.is_admin() or x.owner_id=auth.uid(),'can_review',private.is_admin() or x.owner_id<>auth.uid())),'[]')) into result from(select * from permitted order by updated_at desc,id limit 25 offset (greatest(1,least(10000,coalesce((input->>'page')::int,1)))-1)*25)x;return result;
 elsif op='detail' then
  if not private.can_bank(p_id) then raise exception 'AUTH: Soal tidak tersedia';end if;
  select * into b from private.bank_items where id=p_id;select * into v from private.bank_versions where item_id=p_id and version=b.version;
  return jsonb_build_object('item',to_jsonb(b)||jsonb_build_object('payload',v.payload),'versions',coalesce((select jsonb_agg(to_jsonb(x) order by version desc) from(select * from private.bank_versions where item_id=p_id order by version desc limit 50)x),'[]'),'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from(select * from private.bank_reviews where item_id=p_id order by created_at desc limit 100)x),'[]'),'similar',(select count(*) from private.bank_items x join private.bank_versions z on z.item_id=x.id and z.version=x.version where x.id<>p_id and x.state<>'archived' and private.can_bank(x.id) and lower(regexp_replace(z.payload->>'stem','[[:space:]]+',' ','g'))=lower(regexp_replace(v.payload->>'stem','[[:space:]]+',' ','g'))),'usage',coalesce((select jsonb_agg(jsonb_build_object('title',e.title,'exam_id',e.id,'bank_version',u.bank_version,'points',u.points,'question_id',u.question_id,'attempts',(select count(*) from private.attempt_questions q where q.question_id=u.question_id and private.can_grade(q.attempt_id)))) from private.bank_usage u join private.bank_packs pk on pk.id=u.pack_id join public.exams e on e.id=pk.exam_id where u.item_id=p_id and private.can_author(e.id)),'[]'));
 elsif op='quality' then
  if not private.can_bank(p_id) then raise exception 'AUTH: Soal tidak tersedia';end if;result:='[]';
  for rowa in select a.id from public.exam_attempts a where private.can_grade(a.id) and a.grading_pending=0 and a.status in ('submitted','time_expired','graded') and exists(select 1 from private.attempt_questions q join private.bank_usage u on u.question_id=q.question_id and u.question_version=q.question_version where u.item_id=p_id and q.attempt_id=a.id) order by a.finalized_at desc,a.id limit 300 loop
   d:=private.results_command(jsonb_build_object('action','detail','attempt_id',rowa.id));
   select jsonb_set(d,'{questions}',coalesce(jsonb_agg(x),'[]')) into d from jsonb_array_elements(d->'questions') x where exists(select 1 from private.bank_usage u where u.item_id=p_id and u.question_id=(x->>'id')::uuid and u.question_version=(x->>'version')::int);result:=result||jsonb_build_array(d);
  end loop;return result;
 end if;
 if req is null then raise exception 'Request ID wajib';end if;
 if p_id is not null and not private.can_bank(p_id) then raise exception 'AUTH: Soal tidak tersedia';end if;
 if op in ('save','import') and not private.bank_scope(input->'meta') then raise exception 'AUTH: Kategori di luar penugasan';end if;
 if op in ('preview','assemble') and exists(select 1 from jsonb_array_elements_text(input->'exam_ids') x where not private.can_author(x::uuid)) then raise exception 'AUTH: Ujian di luar cakupan';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||req::text,0));select * into prior from private.bank_requests where actor_id=auth.uid() and request_id=req;if found then if prior.input<>input then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if op in ('save','import','review') and length(trim(coalesce(input->>'reason',''))) not between 5 and 1000 then raise exception 'Catatan 5–1000 karakter wajib';end if;
 if op='save' then
  perform pg_advisory_xact_lock(hashtextextended(private.actor_org()::text||(input->'meta'->>'subject_id'),1));p_id:=private.bank_store(input->'meta',input->'payload',p_id,(input->>'expected_version')::int,input->>'reason');result:=jsonb_build_object('id',p_id);
 elsif op='import' then
  if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 100 then raise exception 'Impor 1–100 soal';end if;
  perform pg_advisory_xact_lock(hashtextextended(private.actor_org()::text||(input->'meta'->>'subject_id'),1));result:='[]';cnt:=0;
  for entry in select value from jsonb_array_elements(input->'items') loop cnt:=cnt+1;begin p_id:=private.bank_store(input->'meta',entry,null,null,input->>'reason');result:=result||jsonb_build_array(jsonb_build_object('row',cnt,'saved',true,'id',p_id));exception when others then result:=result||jsonb_build_array(jsonb_build_object('row',cnt,'saved',false,'error',sqlerrm));end;end loop;
 elsif op='review' then
  select * into b from private.bank_items where id=p_id for update;
  if b.version is distinct from (input->>'expected_version')::int then raise exception 'CONFLICT: Versi soal berubah';end if;decision:=input->>'decision';
  if decision not in ('approved','revision','archived','draft') then raise exception 'Keputusan tidak valid';end if;
  if decision in ('approved','revision') and b.owner_id=auth.uid() and not private.is_admin() then raise exception 'Review memerlukan Guru lain atau Admin';end if;
  if decision in ('draft','archived') and b.owner_id<>auth.uid() and not private.is_admin() then raise exception 'AUTH: Hanya pemilik atau Admin';end if;
  if b.state='archived' and decision<>'draft' then raise exception 'Buka arsip sebagai draf terlebih dahulu';end if;
  if decision='approved' then select * into v from private.bank_versions where item_id=p_id and version=b.version;perform private.validate_question(v.payload);if not private.bank_media_ok(v.payload,p_id) then raise exception 'Lampiran belum tersedia';end if;if v.payload->>'type'='Esai' and jsonb_array_length(coalesce(v.payload->'rubricCriteria','[]'))=0 then raise exception 'Esai bank memerlukan rubrik per kriteria';end if;end if;
  update private.bank_items set state=decision,updated_at=clock_timestamp() where id=p_id;insert into private.bank_reviews(item_id,version,actor_id,decision,reason) values(p_id,b.version,auth.uid(),decision,input->>'reason');result:=jsonb_build_object('saved',true);
 elsif op in ('preview','assemble') then
  if jsonb_typeof(input->'exam_ids') is distinct from 'array' or jsonb_array_length(input->'exam_ids') not between 1 and 3 or jsonb_typeof(input->'rules') is distinct from 'array' or jsonb_array_length(input->'rules') not between 1 and 20 then raise exception 'Pilih 1–3 ujian dan 1–20 kelompok';end if;cnt:=0;
  for rule in select value from jsonb_array_elements(input->'rules') loop if coalesce(rule->>'type','') not in ('PG','PG_KOMPLEKS','BS','JODOH','Esai') or (rule->>'count')::int not between 1 and 100 or (rule->>'points')::numeric not between 0.000001 and 10000 or rule->>'count' is null or rule->>'points' is null then raise exception 'Kisi-kisi tidak valid';end if;cnt:=cnt+(rule->>'count')::int;end loop;if cnt>200 then raise exception 'Maksimal 200 soal';end if;
  result:='[]';for eid in select distinct value::uuid from jsonb_array_elements_text(input->'exam_ids') order by 1 loop
   perform private.author_guard(eid);select * into ex from public.exams where id=eid;if ex.status<>'draft' then raise exception 'Paket hanya untuk ujian draf sebelum mulai';end if;selected_ids:='{}';if op='assemble' then insert into private.bank_packs(exam_id,rules,actor_id) values(eid,input->'rules',auth.uid()) returning id into pack;end if;
   for rule in select value from jsonb_array_elements(input->'rules') order by ((nullif(value->>'topic','') is not null)::int+(nullif(value->>'difficulty','') is not null)::int+(nullif(value->>'cognitive','') is not null)::int) desc loop
    if op='preview' then result:=result||jsonb_build_array(jsonb_build_object('exam_id',eid,'rule',rule,'available',(select count(*) from private.bank_pool(eid,rule))));continue;end if;
    n:=0;select * into cfg from public.exam_type_configs where exam_id=eid and type=rule->>'type';
    for candidate in select pool.* from private.bank_pool(eid,rule) pool where not(pool.item_id=any(selected_ids)) order by random() limit (rule->>'count')::int loop
     select * into b from private.bank_items where id=candidate.item_id for share;if b.state<>'approved' or b.version<>candidate.version then raise exception 'CONFLICT: Review bank berubah';end if;
     assembled:=jsonb_set(candidate.payload,'{points}',to_jsonb((rule->>'points')::numeric));perform private.validate_question(assembled);if not private.bank_media_ok(assembled,b.id) then raise exception 'Media tidak tersedia';end if;
     if cfg.max_questions>0 and (select count(*) from public.questions where exam_id=eid and type=rule->>'type' and archived_at is null)>=cfg.max_questions then raise exception 'Kuota terlampaui';end if;
     if exists(select 1 from public.questions q join public.question_versions z on z.question_id=q.id and z.version=q.current_version where q.exam_id=eid and q.archived_at is null and z.payload=assembled) then raise exception 'DUPLICATE: Soal sudah ada pada ujian';end if;
     insert into public.questions(organization_id,exam_id,type,points) values(ex.organization_id,eid,assembled->>'type',(assembled->>'points')::numeric) returning id into qid;
     insert into public.question_versions(question_id,version,payload) values(qid,1,assembled);insert into public.question_attachments(question_id,media_id) select qid,value::uuid from jsonb_array_elements_text(assembled->'attachments');insert into private.bank_usage values(pack,b.id,candidate.version,qid,1,(assembled->>'points')::numeric);selected_ids:=array_append(selected_ids,b.id);n:=n+1;
    end loop;if n<>(rule->>'count')::int then raise exception 'Kandidat tidak cukup; seluruh paket dibatalkan';end if;
   end loop;if op='assemble' then result:=result||jsonb_build_array(jsonb_build_object('exam_id',eid,'count',cardinality(selected_ids),'pack_id',pack));end if;
  end loop;
 else raise exception 'Aksi bank tidak dikenal';end if;
 if op<>'preview' then insert into private.bank_requests values(auth.uid(),req,input,result);insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id,request_id) values(private.actor_org(),auth.uid(),'BANK_'||op,'bank_items',p_id::text,req);end if;return result;
end$$;
create function public.bank_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.bank_command(input)$$;
revoke all on function private.bank_scope(jsonb),private.can_bank(uuid),private.bank_media_ok(jsonb,uuid),private.bank_store(jsonb,jsonb,uuid,integer,text),private.bank_pool(uuid,jsonb),private.bank_command(jsonb),public.bank_command(jsonb) from public,anon,authenticated;
grant execute on function private.bank_command(jsonb),public.bank_command(jsonb) to authenticated;
alter function private.media_referenced(uuid) rename to media_referenced_before_bank;
create function private.media_referenced(mid uuid) returns boolean language sql stable security definer set search_path='' as $$select private.media_referenced_before_bank(mid) or exists(select 1 from private.bank_versions where payload->'attachments' ? mid::text)$$;
revoke all on function private.media_referenced(uuid),private.media_referenced_before_bank(uuid) from public,anon,authenticated;
alter function private.can_read_author_media(uuid) rename to can_read_author_media_before_bank;
create function private.can_read_author_media(target uuid) returns boolean language sql stable security definer set search_path='' as $$select private.can_read_author_media_before_bank(target) or exists(select 1 from private.bank_versions v where v.payload->'attachments' ? target::text and private.can_bank(v.item_id))$$;
revoke all on function private.can_read_author_media(uuid),private.can_read_author_media_before_bank(uuid) from public,anon,authenticated;
grant execute on function private.can_read_author_media(uuid) to authenticated;
alter policy media_author_read on public.media_assets using(private.can_read_author_media(id));
alter policy media_author_storage_read on storage.objects using(bucket_id='exam-media' and exists(select 1 from public.media_assets m where m.object_path=name and private.can_read_author_media(m.id)));

alter table private.essay_grades add column criteria_scores jsonb not null default '{}',add column revision_reason text not null default '';
alter table private.essay_grade_history add column criteria_scores jsonb not null default '{}',add column revision_reason text not null default '';
create function private.validate_criteria(p_payload jsonb,p_scores jsonb,p_points numeric) returns void language plpgsql immutable set search_path='' as $$declare c jsonb;n int:=jsonb_array_length(coalesce(p_payload->'rubricCriteria','[]'));total numeric:=0;begin
 if p_points is null or p_points<0 or p_points>(p_payload->>'points')::numeric or jsonb_typeof(p_scores) is distinct from 'object' then raise exception 'Nilai/rubrik tidak valid';end if;
 if (select count(*) from jsonb_object_keys(p_scores))<>n then raise exception 'Seluruh kriteria harus diisi tanpa ID tambahan';end if;
 for c in select value from jsonb_array_elements(coalesce(p_payload->'rubricCriteria','[]')) loop if jsonb_typeof(p_scores->(c->>'id')) is distinct from 'number' or (p_scores->>(c->>'id'))::numeric<0 or (p_scores->>(c->>'id'))::numeric>(c->>'maxPoints')::numeric then raise exception 'Skor kriteria di luar batas';end if;total:=total+(p_scores->>(c->>'id'))::numeric;end loop;
 if n>0 and abs(total-p_points)>0.000001 then raise exception 'Total harus sama dengan jumlah skor kriteria';end if;
end$$;
revoke all on function private.validate_criteria(jsonb,jsonb,numeric) from public,anon,authenticated;
create or replace function private.store_essay_grade(target uuid,qid uuid,score numeric,comment text,source text,suggestion uuid) returns void language plpgsql security definer set search_path='' as $$declare q private.attempt_questions;ctx jsonb;entry jsonb;criteria jsonb;reason text;begin
 if not private.can_grade(target) then raise exception 'AUTH: Koreksi di luar cakupan';end if;
 select * into q from private.attempt_questions where attempt_id=target and question_id=qid;if not found or q.grading_payload->>'type'<>'Esai' or length(coalesce(comment,''))>5000 then raise exception 'Soal/comment tidak valid';end if;
 ctx:=coalesce(nullif(current_setting('edutara.grade_context',true),''),'{}')::jsonb;
 select value into entry from jsonb_array_elements(coalesce(ctx->'grades','[]')) where value->>'attempt_id'=target::text and value->>'question_id'=qid::text limit 1;
 criteria:=coalesce(entry->'criteria','{}');reason:=coalesce(nullif(trim(entry->>'reason'),''),left(trim(comment),1000),'');perform private.validate_criteria(q.grading_payload,criteria,score);
 if length(reason)>1000 or (exists(select 1 from private.essay_grades where attempt_id=target and question_id=qid) and length(reason)<5) then raise exception 'Alasan revisi 5–1000 karakter wajib';end if;
 insert into private.essay_grades(attempt_id,question_id,points,comment,source,approved_by,suggestion_id,updated_at,criteria_scores,revision_reason) values(target,qid,score,coalesce(comment,''),source,auth.uid(),suggestion,clock_timestamp(),criteria,reason) on conflict(attempt_id,question_id) do update set points=excluded.points,comment=excluded.comment,source=excluded.source,approved_by=excluded.approved_by,suggestion_id=excluded.suggestion_id,updated_at=excluded.updated_at,criteria_scores=excluded.criteria_scores,revision_reason=excluded.revision_reason;
 insert into private.essay_grade_history(attempt_id,question_id,actor_id,grade_revision,action,points,comment,source,suggestion_id,criteria_scores,revision_reason) values(target,qid,auth.uid(),(select grading_revision+1 from public.exam_attempts where id=target),'APPROVED',score,comment,source,suggestion,criteria,reason);
end$$;
revoke all on function private.store_essay_grade(uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
do $patch$declare d text;begin select pg_get_functiondef('private.recalculate_result(uuid,text)'::regprocedure) into d;
 if position($a$then manual.source else 'auto' end));$a$ in d)=0 then raise exception 'Ledger anchor missing';end if;
 execute replace(d,$a$then manual.source else 'auto' end));$a$,$b$then manual.source else 'auto' end,'criteria',case when q.grading_payload->>'type'='Esai' then manual.criteria_scores else '{}'::jsonb end,'revision_reason',manual.revision_reason));$b$);
end$patch$;
create function private.result_revision_changed() returns trigger language plpgsql security definer set search_path='' as $$declare changed boolean;begin
 if old.grading_revision>0 and new.grading_revision<>old.grading_revision then
  update public.exams set show_exam_result=false where id=new.exam_id and show_exam_result;changed:=found;
  update private.result_publications set state='blocked',error='Revisi nilai berubah; periksa dan jadwalkan ulang.' where exam_id=new.exam_id and state='scheduled';changed:=changed or found;
  if changed then insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(new.organization_id,auth.uid(),'RESULTS_REVISION_INVALIDATED_PUBLICATION','exams',new.exam_id::text);end if;
 end if;return new;
end$$;
revoke all on function private.result_revision_changed() from public,anon,authenticated;
create trigger result_revision_changed after update of grading_revision on public.exam_attempts for each row execute function private.result_revision_changed();
alter function private.results_command(jsonb) rename to results_command_before_bank;
revoke all on function private.results_command_before_bank(jsonb) from public,anon,authenticated;
create function private.results_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;target uuid;prior private.grading_requests;begin
 if not private.is_grader() then raise exception 'AUTH: Akses penilai diperlukan';end if;
 if input->>'action'='publish' then
  if not private.is_admin() or not exists(select 1 from public.exams where id=(input->>'exam_id')::uuid and organization_id=private.actor_org()) then raise exception 'AUTH: Hanya Admin menerbitkan nilai';end if;
  perform 1 from public.exams where id=(input->>'exam_id')::uuid for update;
  select * into prior from private.grading_requests where actor_id=auth.uid() and request_id=(results_command.input->>'request_id')::uuid;if found then if prior.input<>input then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
  if (input->>'published')::boolean and exists(select 1 from private.grade_moderations m join public.exam_attempts a on a.id=m.attempt_id where a.exam_id=(input->>'exam_id')::uuid and m.state='pending') then raise exception 'Selesaikan moderasi sebelum publikasi';end if;
 end if;
 if input->>'action'='grade_batch' then perform set_config('edutara.grade_context',input::text,true);end if;result:=private.results_command_before_bank(input);if input->>'action'='grade_batch' then perform set_config('edutara.grade_context','',true);end if;
 if input->>'action'='detail' then target:=(input->>'attempt_id')::uuid;select jsonb_set(result,'{questions}',coalesce(jsonb_agg(x||jsonb_build_object('criteria',coalesce(g.criteria_scores,'{}'),'revision_reason',g.revision_reason)),'[]')) into result from jsonb_array_elements(result->'questions') x left join private.essay_grades g on g.attempt_id=target and g.question_id=(x->>'id')::uuid;
 elsif input->>'action'='publish' then update private.result_publications set state='cancelled',error='Publikasi diubah langsung oleh Admin.' where exam_id=(input->>'exam_id')::uuid and state='scheduled';end if;return result;
end$$;
revoke all on function private.results_command(jsonb) from public,anon;
grant execute on function private.results_command(jsonb) to authenticated;
create function private.publication_basis(eid uuid) returns text language sql stable security definer set search_path='' as $$select encode(extensions.digest(coalesce(string_agg(a.id::text||':'||a.grading_revision||':'||a.status||':'||a.grading_pending||':'||coalesce(a.finalized_at::text,''),',' order by a.id),''),'sha256'),'hex') from public.exam_attempts a where a.exam_id=eid and a.status<>'reset'$$;
create function private.publication_ready(eid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.exams e where e.id=eid and e.status not in ('draft','archived') and (e.status='closed' or e.ends_at<=clock_timestamp())) and exists(select 1 from public.exam_attempts a where a.exam_id=eid and a.finalized_at is not null and a.status not in ('reset','disqualified')) and not exists(select 1 from public.exam_attempts a where a.exam_id=eid and a.status<>'reset' and (a.finalized_at is null or (a.status<>'disqualified' and (a.grading_pending>0 or a.score_percent is null)))) and not exists(select 1 from private.grade_moderations m join public.exam_attempts a on a.id=m.attempt_id where a.exam_id=eid and m.state='pending')$$;
revoke all on function private.publication_basis(uuid),private.publication_ready(uuid) from public,anon,authenticated;
create function private.assessment_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=input->>'action';p_attempt uuid:=nullif(input->>'attempt_id','')::uuid;p_exam uuid:=nullif(input->>'exam_id','')::uuid;req uuid:=nullif(input->>'request_id','')::uuid;prior private.assessment_requests;a public.exam_attempts;q private.attempt_questions;m private.grade_moderations;e public.exams;result jsonb;when_at timestamptz;begin
 if not private.is_grader() then raise exception 'AUTH: Akses penilaian Admin/Guru diperlukan';end if;
 if op='list' then
  with permitted as(select * from public.exam_attempts aa where private.can_grade(aa.id) and aa.status<>'disqualified' and (p_exam is null or aa.exam_id=p_exam)) select jsonb_build_object('total',(select count(*) from permitted),'rows',coalesce(jsonb_agg(jsonb_build_object('id',x.id,'code','Peserta '||upper(left(md5(x.id::text),8)),'title',ee.title,'exam_id',x.exam_id,'status',x.status,'revision',x.grading_revision,'pending',x.grading_pending,'score',x.score_percent) order by md5(x.id::text)),'[]'),'admin',private.is_admin()) into result from(select * from permitted order by md5(id::text) limit 25 offset (greatest(1,least(10000,coalesce((input->>'page')::int,1)))-1)*25)x join public.exams ee on ee.id=x.exam_id;return result;
 elsif op='detail' then
  if not private.can_grade(p_attempt) then raise exception 'AUTH: Hasil di luar cakupan';end if;result:=private.results_command(jsonb_build_object('action','detail','attempt_id',p_attempt));return jsonb_set(result,'{attempt}',((result->'attempt')-array['student','student_id','class_ids'])||jsonb_build_object('code','Peserta '||upper(left(md5(p_attempt::text),8))))-array['ledger','history','suggestions'];
 elsif op='moderations' then
  select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('current_revision',aa.grading_revision,'can_decide',x.proposed_by<>auth.uid() and x.state='pending') order by x.created_at desc),'[]') into result from private.grade_moderations x join public.exam_attempts aa on aa.id=x.attempt_id where private.can_grade(aa.id) and (p_exam is null or aa.exam_id=p_exam);return result;
 elsif op='publications' then
  if not private.is_admin() then return '[]'::jsonb;end if;return coalesce((select jsonb_agg(to_jsonb(x) order by scheduled_at desc) from private.result_publications x where x.organization_id=private.actor_org()),'[]');
 end if;
 if req is null then raise exception 'Request ID wajib';end if;
 if op='propose' and not private.can_grade(p_attempt) then raise exception 'AUTH: Moderasi di luar cakupan';end if;
 if op='moderate' then select * into m from private.grade_moderations where id=(input->>'id')::uuid;if not found or not private.can_grade(m.attempt_id) or m.proposed_by=auth.uid() then raise exception 'AUTH: Keputusan memerlukan penilai lain dalam cakupan';end if;p_attempt:=m.attempt_id;end if;
 if op in ('schedule','cancel') and (not private.is_admin() or not exists(select 1 from public.exams where id=p_exam and organization_id=private.actor_org())) then raise exception 'AUTH: Publikasi hanya Admin';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||req::text,0));select * into prior from private.assessment_requests where actor_id=auth.uid() and request_id=req;if found then if prior.input<>input then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if length(trim(coalesce(input->>'reason',''))) not between 5 and 1000 then raise exception 'Alasan 5–1000 karakter wajib';end if;
 if op='propose' then
  select * into a from public.exam_attempts where id=p_attempt for update;if a.status='disqualified' or a.grading_revision is distinct from (input->>'expected_revision')::int then raise exception 'CONFLICT: Status/revisi berubah';end if;
  select * into q from private.attempt_questions where attempt_id=p_attempt and question_id=(input->>'question_id')::uuid;if not found or q.grading_payload->>'type'<>'Esai' then raise exception 'Moderasi hanya untuk esai snapshot';end if;
  perform private.validate_criteria(q.grading_payload,coalesce(input->'criteria','{}'),(input->>'points')::numeric);if length(coalesce(input->>'comment',''))>5000 then raise exception 'Catatan terlalu panjang';end if;
  insert into private.grade_moderations(attempt_id,question_id,basis_revision,points,criteria,comment,reason,proposed_by) values(p_attempt,q.question_id,a.grading_revision,(input->>'points')::numeric,coalesce(input->'criteria','{}'),coalesce(input->>'comment',''),input->>'reason',auth.uid()) returning id into req;result:=jsonb_build_object('id',req,'state','pending');req:=(input->>'request_id')::uuid;
 elsif op='moderate' then
  select * into a from public.exam_attempts where id=p_attempt for update;select * into m from private.grade_moderations where id=(input->>'id')::uuid for update;
  if m.state<>'pending' then raise exception 'Moderasi sudah diputuskan';end if;
  if input->>'decision'='approved' then
   if m.basis_revision<>a.grading_revision then raise exception 'CONFLICT: Revisi berubah; tolak dan buat usulan baru';end if;
   perform private.results_command(jsonb_build_object('action','grade_batch','request_id',req,'grades',jsonb_build_array(jsonb_build_object('attempt_id',m.attempt_id,'question_id',m.question_id,'expected_revision',m.basis_revision,'points',m.points,'criteria',m.criteria,'comment',m.comment,'reason','Moderasi: '||left(input->>'reason',980)))));
  elsif input->>'decision'<>'rejected' then raise exception 'Keputusan tidak valid';end if;
  update private.grade_moderations set state=input->>'decision',decided_by=auth.uid(),decision_reason=input->>'reason',decided_at=clock_timestamp() where id=m.id;result:=jsonb_build_object('saved',true);
 elsif op='schedule' then
  select * into e from public.exams where id=p_exam for update;when_at:=(input->>'scheduled_at')::timestamptz;
  if when_at is null or when_at<=clock_timestamp() or when_at<e.ends_at or input->>'confirmation' is distinct from 'JADWALKAN' then raise exception 'Jadwal harus di masa depan setelah akhir ujian; konfirmasi wajib';end if;
  if not private.publication_ready(p_exam) then raise exception 'Selesaikan ujian, koreksi dan moderasi terlebih dahulu';end if;
  insert into private.result_publications(exam_id,organization_id,scheduled_at,state,basis,reason,created_by) values(p_exam,e.organization_id,when_at,'scheduled',private.publication_basis(p_exam),input->>'reason',auth.uid()) on conflict(exam_id) do update set scheduled_at=excluded.scheduled_at,state='scheduled',basis=excluded.basis,reason=excluded.reason,created_by=excluded.created_by,created_at=clock_timestamp(),published_at=null,error=null;
  update public.exams set show_exam_result=false where id=p_exam;result:=jsonb_build_object('scheduled',true);
 elsif op='cancel' then
  perform 1 from public.exams where id=p_exam for update;update private.result_publications set state='cancelled',error=input->>'reason' where exam_id=p_exam and state in ('scheduled','blocked');result:=jsonb_build_object('cancelled',found);
 else raise exception 'Aksi penilaian tidak dikenal';end if;
 insert into private.assessment_requests values(auth.uid(),req,input,result);insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id,request_id) values(private.actor_org(),auth.uid(),'ASSESSMENT_'||op,'assessment',coalesce(p_exam,p_attempt)::text,req);return result;
end$$;
create function public.assessment_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.assessment_command(input)$$;
revoke all on function private.assessment_command(jsonb),public.assessment_command(jsonb) from public,anon,authenticated;
grant execute on function private.assessment_command(jsonb),public.assessment_command(jsonb) to authenticated;
create function private.publish_due_results() returns integer language plpgsql security definer set search_path='' as $$declare item private.result_publications;current_row private.result_publications;ex public.exams;n int:=0;begin
 for item in select * from private.result_publications where state='scheduled' and scheduled_at<=clock_timestamp() order by exam_id loop
  select * into ex from public.exams where id=item.exam_id for update skip locked;if not found then continue;end if;select * into current_row from private.result_publications where exam_id=item.exam_id for update;
  if current_row.state<>'scheduled' or current_row.scheduled_at>clock_timestamp() then continue;end if;
  if not exists(select 1 from public.profiles p where p.id=current_row.created_by and p.organization_id=current_row.organization_id and p.role='admin' and p.active and p.archived_at is null) or not private.publication_ready(item.exam_id) or current_row.basis<>private.publication_basis(item.exam_id) then
   update private.result_publications set state='blocked',error='Kewenangan/moderasi/revisi hasil berubah; tinjau ulang.' where exam_id=item.exam_id;
  else
   update public.exams set show_exam_result=true where id=item.exam_id;update private.result_publications set state='published',published_at=clock_timestamp(),error=null where exam_id=item.exam_id;insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(current_row.organization_id,current_row.created_by,'RESULTS_SCHEDULED_PUBLICATION','exams',item.exam_id::text);n:=n+1;
  end if;
 end loop;return n;
end$$;
revoke all on function private.publish_due_results() from public,anon,authenticated;
select cron.schedule('edutara-results-publication','* * * * *','select private.publish_due_results()');
