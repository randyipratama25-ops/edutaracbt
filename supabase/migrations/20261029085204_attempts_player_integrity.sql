alter table public.exams add column show_exam_result boolean not null default false;
alter table public.exam_attempts add column writer_client uuid,add column writer_session uuid,add column writer_epoch integer not null default 1,add column policy_snapshot jsonb not null default '{}',add column finalized_at timestamptz,add column grading_pending integer not null default 0,add column objective_earned numeric,add column total_points numeric,add column review_reason text;
create table private.attempt_questions(attempt_id uuid not null references public.exam_attempts(id),question_id uuid not null,question_version integer not null,position integer not null,grading_payload jsonb not null,student_payload jsonb not null,primary key(attempt_id,question_id),unique(attempt_id,position),foreign key(question_id,question_version) references public.question_versions(question_id,version));
create table private.attempt_requests(attempt_id uuid not null references public.exam_attempts(id),request_id uuid not null,kind text not null,input jsonb not null,result jsonb not null,primary key(attempt_id,request_id));
create table private.answer_revisions(attempt_id uuid not null,question_id uuid not null,revision integer not null,value jsonb not null,checksum text not null,actor_session uuid not null,saved_at timestamptz not null default now(),primary key(attempt_id,question_id,revision),foreign key(attempt_id,question_id) references private.attempt_questions(attempt_id,question_id));
create table private.integrity_events(attempt_id uuid not null references public.exam_attempts(id),event_id uuid not null,kind text not null,countable boolean not null default false,metadata jsonb not null,created_at timestamptz not null default now(),primary key(attempt_id,event_id));
create index integrity_events_time on private.integrity_events(attempt_id,created_at desc);
create table public.answer_media(id uuid primary key default gen_random_uuid(),attempt_id uuid not null,question_id uuid not null,student_id uuid not null references public.profiles(id),object_path text not null unique,byte_size integer not null check(byte_size between 1 and 5242880),checksum text not null,created_at timestamptz not null default now(),foreign key(attempt_id,question_id) references private.attempt_questions(attempt_id,question_id));
alter table private.attempt_questions enable row level security;
alter table private.attempt_requests enable row level security;
alter table private.answer_revisions enable row level security;
alter table private.integrity_events enable row level security;
alter table public.answer_media enable row level security;
revoke all on public.answer_media from anon,authenticated;
create policy answer_media_owner on public.answer_media for select to authenticated using(student_id=auth.uid() and private.actor_org() is not null);
grant select on public.answer_media to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attempt-canvas','attempt-canvas',false,5242880,array['image/png']);
create policy canvas_own_read on storage.objects for select to authenticated using(bucket_id='attempt-canvas' and private.actor_org() is not null and (storage.foldername(name))[1]=auth.uid()::text);
create policy canvas_own_upload on storage.objects for insert to authenticated with check(bucket_id='attempt-canvas' and private.actor_org() is not null and (storage.foldername(name))[1]=auth.uid()::text);
create policy canvas_own_delete on storage.objects for delete to authenticated using(bucket_id='attempt-canvas' and private.actor_org() is not null and (storage.foldername(name))[1]=auth.uid()::text);
create unique index grade_auto_once on public.grade_items(attempt_id,question_id) where source='auto';
create index attempts_student_exam on public.exam_attempts(student_id,exam_id);
-- This pure function is the single grading primitive used by finalization and later regrading.
create function private.grade_one(payload jsonb,answer jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare t text:=payload->>'type';weight numeric:=(payload->>'points')::numeric;selected int;correct int;total int;opt jsonb;i int:=0;begin
 if t='Esai' then return null;end if;
 if t in ('PG','PG_KOMPLEKS') then
 if answer is null or jsonb_typeof(answer)<>'array' then return 0;end if;
 select count(distinct value) into selected from jsonb_array_elements_text(answer);
 if selected=0 or exists(select 1 from jsonb_array_elements_text(answer) pick where not (payload->'key' ? pick)) then return 0;end if;
 if t='PG' then return case when selected=1 then weight else 0 end;end if;
 return weight*selected/jsonb_array_length(payload->'key');end if;
 correct:=0;total:=jsonb_array_length(payload->'options');
 for opt in select * from jsonb_array_elements(payload->'options') loop
 if answer->>(opt->>'id')=payload->'key'->>i then correct:=correct+1;end if;i:=i+1;end loop;
 return case when total=0 then 0 else weight*correct/total end;
end$$;
create function private.answer_complete(payload jsonb,answer jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare t text:=payload->>'type';plain text;begin
 if answer is null then return false;end if;
 if t in ('PG','PG_KOMPLEKS') then return jsonb_typeof(answer)='array' and jsonb_array_length(answer)>0;end if;
 if t in ('BS','JODOH') then return not exists(select 1 from jsonb_array_elements(payload->'options') opt where coalesce(answer->>(opt->>'id'),'')='');end if;
 plain:=trim(regexp_replace(coalesce(answer->>'text',''),'<[^>]*>','','g'));
 return (length(plain)>0 or answer ? 'canvas_id') and length(plain)>=coalesce((payload->>'minChars')::int,0);
end$$;
create function private.attempt_finalize(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.exam_attempts;q private.attempt_questions;val jsonb;earned numeric;sum_earned numeric:=0;sum_points numeric:=0;pending int:=0;begin
 select * into a from public.exam_attempts where id=target for update;
 if not found or a.finalized_at is not null then return;end if;
 if reason not in ('manual','timeout') then raise exception 'Mode finalisasi tidak valid';end if;
 if clock_timestamp()>=a.deadline_at then reason:='timeout';end if;
 if reason='timeout' and clock_timestamp()<a.deadline_at then raise exception 'Waktu ujian belum habis';end if;
 if a.status='disqualified' and reason='manual' then raise exception 'Attempt dikunci; hubungi pengawas';end if;
 if reason='manual' and exists(select 1 from private.attempt_questions sq left join public.attempt_answers sa on sa.attempt_id=sq.attempt_id and sa.question_id=sq.question_id where sq.attempt_id=target and coalesce((sq.grading_payload->>'required')::boolean,true) and not private.answer_complete(sq.grading_payload,sa.value)) then raise exception 'REQUIRED: Lengkapi semua jawaban wajib dan minimum karakter.';end if;
 for q in select * from private.attempt_questions where attempt_id=target order by position loop
 select value into val from public.attempt_answers where attempt_id=target and question_id=q.question_id;
 earned:=private.grade_one(q.grading_payload,val);sum_points:=sum_points+(q.grading_payload->>'points')::numeric;
 if earned is null then pending:=pending+1;else
 sum_earned:=sum_earned+earned;
 insert into public.grade_items(attempt_id,question_id,question_version,source,awarded_points,max_points) values(target,q.question_id,q.question_version,'auto',earned,(q.grading_payload->>'points')::numeric);end if;
 end loop;
 update public.exam_attempts set status=case when a.status='disqualified' then 'disqualified' when reason='timeout' then 'time_expired' else 'submitted' end,finalized_at=clock_timestamp(),grading_pending=pending,objective_earned=sum_earned,total_points=sum_points,score_percent=case when pending>0 then null when sum_points=0 then 0 else round(100*sum_earned/sum_points,2) end,version=version+1 where id=target;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(a.organization_id,auth.uid(),'ATTEMPT_FINALIZED_'||reason,'exam_attempts',target::text);
end$$;
create function private.owns_attempt(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.exam_attempts a join public.profiles p on p.id=auth.uid() where a.id=target and a.student_id=p.id and p.role='student' and a.organization_id=private.actor_org())$$;
create function private.attempt_dto(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.exam_attempts;questions jsonb;answers jsonb;e public.exams;begin
 if not private.owns_attempt(target) then raise exception 'AUTH: Attempt tidak tersedia';end if;
 select * into a from public.exam_attempts where id=target;
 select * into e from public.exams where id=a.exam_id;
 if a.finalized_at is null and a.status='in_progress' then
 select coalesce(jsonb_agg(jsonb_build_object('id',q.question_id,'version',q.question_version,'position',q.position,'payload',q.student_payload) order by q.position),'[]') into questions from private.attempt_questions q where q.attempt_id=target;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',sa.question_id,'revision',sa.revision,'value',sa.value,'saved_at',sa.saved_at,'checksum',encode(extensions.digest(sa.value::text,'sha256'),'hex'))),'[]') into answers from public.attempt_answers sa where sa.attempt_id=target;
 else questions:='[]';answers:='[]';end if;
 return jsonb_build_object('id',a.id,'exam_id',a.exam_id,'title',e.title,'status',a.status,'deadline_at',a.deadline_at,'server_now',clock_timestamp(),'epoch',a.writer_epoch,'finalized_at',a.finalized_at,'questions',questions,'answers',answers,'grading_pending',a.grading_pending,'score',case when e.show_exam_result and a.grading_pending=0 and a.finalized_at is not null and a.status<>'disqualified' then a.score_percent else null end,'result_visible',e.show_exam_result and a.grading_pending=0 and a.finalized_at is not null and a.status<>'disqualified','review_reason',a.review_reason,'policy',jsonb_build_object('integrity_mode','review','unlock_time','fixed_deadline','tolerance_ms',1500,'incident_cooldown_ms',10000));
end$$;
create function private.check_answer(q private.attempt_questions,val jsonb,target uuid) returns void language plpgsql set search_path='' as $$declare t text:=q.grading_payload->>'type';stripped text;begin
 if val is null or length(val::text)>150000 then raise exception 'Jawaban tidak valid/terlalu besar';end if;
 if t in ('PG','PG_KOMPLEKS') then
 if jsonb_typeof(val)<>'array' or jsonb_array_length(val)>6 or (t='PG' and jsonb_array_length(val)>1) or (select count(distinct value) from jsonb_array_elements_text(val))<>jsonb_array_length(val) or exists(select 1 from jsonb_array_elements_text(val) p where not exists(select 1 from jsonb_array_elements(q.grading_payload->'options') o where o->>'id'=p)) then raise exception 'Pilihan tidak valid';end if;
 elsif t in ('BS','JODOH') then
 if jsonb_typeof(val)<>'object' or exists(select 1 from jsonb_object_keys(val) k where not exists(select 1 from jsonb_array_elements(q.grading_payload->'options') o where o->>'id'=k)) then raise exception 'ID pernyataan tidak valid';end if;
 if exists(select 1 from jsonb_each_text(val) p where p.value<>'' and ((t='BS' and p.value not in ('true','false')) or (t='JODOH' and not(q.student_payload->'choices' ? p.value)))) then raise exception 'Nilai pasangan/pernyataan tidak valid';end if;
 else
 if jsonb_typeof(val)<>'object' or jsonb_typeof(val->'text') is distinct from 'string' or exists(select 1 from jsonb_object_keys(val) k where k not in ('text','canvas_id')) or length(val->>'text')>100000 then raise exception 'Esai tidak valid';end if;
 stripped:=regexp_replace(val->>'text','</?(p|br|b|strong|i|em|u|sub|sup|ul|ol|li|blockquote)>','','gi');if stripped like '%<%' then raise exception 'HTML esai tidak didukung';end if;
 if val ? 'canvas_id' and not exists(select 1 from public.answer_media m where m.id=(val->>'canvas_id')::uuid and m.attempt_id=target and m.question_id=q.question_id) then raise exception 'Canvas tidak sesuai soal';end if;
 end if;
end$$;
create function private.attempt_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare op text:=input->>'action';org uuid:=private.actor_org();uid uuid:=auth.uid();client uuid:=nullif(input->>'client_id','')::uuid;sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;target uuid:=nullif(input->>'attempt_id','')::uuid;eid uuid;ex public.exams;a public.exam_attempts;q private.attempt_questions;rowq record;payload jsonb;student jsonb;opts jsonb;vals jsonb;req uuid;prior private.attempt_requests;entry jsonb;rev int;current_value jsonb;results jsonb:='[]';pos int:=0;countable boolean;result jsonb;path text;begin
 if org is null or not exists(select 1 from public.profiles where id=uid and role='student' and active) then raise exception 'AUTH: Sesi siswa diperlukan';end if;
 if op='list' then
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'duration_minutes',e.duration_minutes,'status',e.status,'attempt',(select jsonb_build_object('id',ea.id,'status',ea.status,'finalized_at',ea.finalized_at) from public.exam_attempts ea where ea.exam_id=e.id and ea.student_id=uid and ea.status<>'reset' order by ea.attempt_number desc limit 1)) order by e.starts_at),'[]') into result from public.exams e where e.organization_id=org and e.status not in ('draft','archived') and exists(select 1 from public.exam_classes ec join public.student_enrollments se on se.class_id=ec.class_id and se.organization_id=ec.organization_id where ec.exam_id=e.id and se.student_id=uid and se.active);
 return jsonb_build_object('exams',result,'server_now',clock_timestamp());end if;
 if client is null then raise exception 'Client ID wajib';end if;
 if op='start' then
 eid:=(input->>'exam_id')::uuid;
 if not public.consume_login_budget('attempt-pin:'||uid::text) then return jsonb_build_object('error','Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit.','status',429);end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||eid::text,0));
 select * into ex from public.exams where id=eid and organization_id=org for share;
 if not found or not exists(select 1 from public.exam_classes ec join public.student_enrollments se on se.organization_id=ec.organization_id and se.class_id=ec.class_id where ec.exam_id=eid and se.student_id=uid and se.active) then raise exception 'AUTH: Ujian tidak sesuai kelas';end if;
 if coalesce(input->>'pin','') !~ '^[0-9]{4,12}$' or extensions.crypt(input->>'pin',ex.pin_hash) is distinct from ex.pin_hash then return jsonb_build_object('error','PIN tidak valid','status',422);end if;
 select * into a from public.exam_attempts where student_id=uid and exam_id=eid and status<>'reset' order by attempt_number desc limit 1 for update;
 if found then target:=a.id;
 else
 if ex.status not in ('scheduled','active') or clock_timestamp()<ex.starts_at or clock_timestamp()>=ex.ends_at then raise exception 'Ujian belum dibuka atau sudah ditutup';end if;
 if not exists(select 1 from public.questions where exam_id=eid and archived_at is null) then raise exception 'Bank soal belum tersedia';end if;
 insert into public.exam_attempts(organization_id,exam_id,student_id,started_at,deadline_at,writer_client,writer_session,policy_snapshot) values(org,eid,uid,clock_timestamp(),least(ex.ends_at,clock_timestamp()+make_interval(mins=>ex.duration_minutes)),client,sid,jsonb_build_object('policy_version',ex.policy_version,'passing_grade',ex.passing_grade,'integrity_mode','review','unlock_time','fixed_deadline','shuffle_questions',ex.shuffle_questions,'shuffle_options',ex.shuffle_options)) returning * into a;target:=a.id;
 for rowq in select q0.id,q0.current_version,z.payload from public.questions q0 join public.question_versions z on z.question_id=q0.id and z.version=q0.current_version join public.exam_type_configs tc on tc.exam_id=q0.exam_id and tc.type=q0.type and tc.enabled where q0.exam_id=eid and q0.archived_at is null order by array_position(array['PG','PG_KOMPLEKS','BS','JODOH','Esai'],q0.type),case when ex.shuffle_questions then random() else 0 end,q0.id loop
 pos:=pos+1;payload:=rowq.payload;
 if ex.shuffle_options and payload->>'type' in ('PG','PG_KOMPLEKS') then select jsonb_agg(v order by random()) into opts from jsonb_array_elements(payload->'options') v;payload:=jsonb_set(payload,'{options}',opts);end if;
 student:=payload-array['key','rubric','explanation','keywords'];
 if payload->>'type'='JODOH' then select jsonb_agg(c.value order by random()) into opts from (select distinct value from jsonb_array_elements_text((payload->'key')||coalesce(payload->'distractors','[]')))c;student:=student||jsonb_build_object('choices',opts);end if;
 insert into private.attempt_questions values(target,rowq.id,rowq.current_version,pos,payload,student);
 end loop;
 if pos=0 then raise exception 'Tidak ada soal aktif';end if;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,uid,'ATTEMPT_START','exam_attempts',target::text);
 end if;
 elsif op not in ('resume','takeover','save','submit','event','canvas') then raise exception 'Aksi tidak dikenal';end if;
 if not private.owns_attempt(target) then raise exception 'AUTH: Attempt tidak tersedia';end if;
 select * into a from public.exam_attempts where id=target for update;
 if a.finalized_at is null and clock_timestamp()>=a.deadline_at then perform private.attempt_finalize(target,'timeout');select * into a from public.exam_attempts where id=target;end if;
 if op='takeover' and a.finalized_at is null and a.status='in_progress' then update public.exam_attempts set writer_client=client,writer_session=sid,writer_epoch=writer_epoch+1 where id=target returning * into a;insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,uid,'ATTEMPT_DEVICE_TAKEOVER','exam_attempts',target::text);end if;
 if a.finalized_at is not null or a.status='disqualified' then return private.attempt_dto(target);end if;
 if a.writer_client is distinct from client or a.writer_session is distinct from sid then raise exception 'DEVICE_CONFLICT: Attempt aktif pada perangkat/tab lain. Ambil alih secara eksplisit.';end if;
 if op in ('start','resume','takeover') then return private.attempt_dto(target);end if;
 if (input->>'epoch')::int is distinct from a.writer_epoch then raise exception 'DEVICE_CONFLICT: Versi perangkat sudah berubah';end if;
 if op='canvas' then
 if not exists(select 1 from private.attempt_questions sq where sq.attempt_id=target and sq.question_id=(input->>'question_id')::uuid and sq.grading_payload->>'type'='Esai' and (sq.grading_payload->'canvas'->>'enabled')::boolean) then raise exception 'Canvas tidak tersedia';end if;
 path:=input->>'path';if path not like uid::text||'/'||target::text||'/'||(input->>'question_id')||'/%' or length(path)>250 or input->>'checksum' !~ '^[a-f0-9]{64}$' then raise exception 'Metadata canvas tidak valid';end if;
 if not exists(select 1 from storage.objects where bucket_id='attempt-canvas' and name=path) then raise exception 'Object canvas belum tersimpan';end if;
 insert into public.answer_media(attempt_id,question_id,student_id,object_path,byte_size,checksum) values(target,(input->>'question_id')::uuid,uid,path,(input->>'byte_size')::int,input->>'checksum') returning id into eid;return jsonb_build_object('id',eid);end if;
 if op='event' then
 if input->>'kind' not in ('focus_loss','visibility_hidden','fullscreen_exit','pagehide','shortcut','copy','cut','paste','contextmenu') then raise exception 'Jenis kejadian tidak valid';end if;
 countable:=input->>'kind' in ('focus_loss','visibility_hidden') and (input->>'duration_ms')::int>=1500 and not coalesce((input->>'editing')::boolean,false) and not coalesce((input->>'orientation_recent')::boolean,false) and not exists(select 1 from private.integrity_events ev where ev.attempt_id=target and ev.countable and ev.created_at>clock_timestamp()-interval '10 seconds');
 insert into private.integrity_events(attempt_id,event_id,kind,countable,metadata) values(target,(input->>'event_id')::uuid,input->>'kind',countable,jsonb_build_object('duration_ms',input->'duration_ms','editing',input->'editing','orientation_recent',input->'orientation_recent','policy','review')) on conflict do nothing;
 return jsonb_build_object('recorded',true,'review_only',true);end if;
 req:=(input->>'request_id')::uuid;if req is null then raise exception 'Request ID wajib';end if;
 select * into prior from private.attempt_requests ar where ar.attempt_id=target and ar.request_id=req;
 if found then if prior.input<>input then raise exception 'IDEMPOTENCY_CONFLICT: Payload berubah';end if;return prior.result;end if;
 if op='submit' then
 perform private.attempt_finalize(target,case when input->>'mode'='timeout' then 'timeout' else 'manual' end);result:=private.attempt_dto(target);
 else
 if jsonb_typeof(input->'answers') is distinct from 'array' or jsonb_array_length(input->'answers') not between 1 and 100 then raise exception 'Batch jawaban 1–100 item';end if;
 for entry in select * from jsonb_array_elements(input->'answers') loop
 select * into q from private.attempt_questions sq where sq.attempt_id=target and sq.question_id=(entry->>'question_id')::uuid;
 if not found then raise exception 'AUTH: Soal bukan bagian snapshot';end if;
 vals:=entry->'value';perform private.check_answer(q,vals,target);
 select sa.revision,sa.value into rev,current_value from public.attempt_answers sa where sa.attempt_id=target and sa.question_id=q.question_id;
 rev:=coalesce(rev,0);
 if (entry->>'expected_revision')::int is distinct from rev then results:=results||jsonb_build_array(jsonb_build_object('question_id',q.question_id,'saved',false,'error','CONFLICT','revision',rev,'value',current_value));
 else
 rev:=rev+1;
 insert into public.attempt_answers(attempt_id,question_id,question_version,value,revision) values(target,q.question_id,q.question_version,vals,rev) on conflict(attempt_id,question_id) do update set value=excluded.value,revision=excluded.revision,saved_at=clock_timestamp();
 insert into private.answer_revisions(attempt_id,question_id,revision,value,checksum,actor_session) values(target,q.question_id,rev,vals,encode(extensions.digest(vals::text,'sha256'),'hex'),sid);
 results:=results||jsonb_build_array(jsonb_build_object('question_id',q.question_id,'saved',true,'revision',rev,'checksum',encode(extensions.digest(vals::text,'sha256'),'hex')));end if;
 end loop;result:=jsonb_build_object('acknowledgements',results,'server_now',clock_timestamp(),'deadline_at',a.deadline_at);
 end if;
 insert into private.attempt_requests values(target,req,op,input,result);return result;
end$$;
create function private.can_review_attempt(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.exam_attempts a where a.id=target and a.organization_id=private.actor_org() and (private.is_admin() or (private.supervisor_allowed() and exists(select 1 from public.exam_room_students rs join public.supervisor_assignments sa on sa.exam_id=rs.exam_id and sa.room_id=rs.room_id left join public.supervisor_substitutions ss on ss.assignment_id=sa.id and ss.revoked_at is null and ss.effective_from<=now() and (ss.effective_until is null or ss.effective_until>now()) where rs.exam_id=a.exam_id and rs.student_id=a.student_id and sa.active and coalesce(ss.substitute_supervisor_id,sa.original_supervisor_id)=auth.uid()))))$$;
create function private.review_attempt(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare target uuid:=nullif(input->>'attempt_id','')::uuid;a public.exam_attempts;result jsonb;begin
 if private.actor_org() is null then raise exception 'AUTH: Sesi tidak valid';end if;
 if input->>'action'='list' then
 select coalesce(jsonb_agg(jsonb_build_object('id',ea.id,'title',e.title,'student',p.full_name,'status',ea.status,'deadline_at',ea.deadline_at,'finalized_at',ea.finalized_at,'review_reason',ea.review_reason,'events',(select count(*) from private.integrity_events ie where ie.attempt_id=ea.id),'countable_events',(select count(*) from private.integrity_events ie where ie.attempt_id=ea.id and ie.countable)) order by ea.started_at desc),'[]') into result from public.exam_attempts ea join public.exams e on e.id=ea.exam_id join public.profiles p on p.id=ea.student_id where private.can_review_attempt(ea.id);
 return result;end if;
 if not private.can_review_attempt(target) then raise exception 'AUTH: Tidak berwenang meninjau attempt';end if;
 select * into a from public.exam_attempts where id=target for update;
 if input->>'action'='events' then select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'countable',countable,'metadata',metadata,'created_at',created_at) order by created_at desc),'[]') into result from private.integrity_events where attempt_id=target;return result;end if;
 if length(trim(coalesce(input->>'reason',''))) not between 5 and 1000 then raise exception 'Alasan peninjauan 5–1000 karakter wajib';end if;
 if a.finalized_at is not null then raise exception 'Attempt sudah difinalisasi';end if;
 if clock_timestamp()>=a.deadline_at then perform private.attempt_finalize(target,'timeout');return jsonb_build_object('status','time_expired','message','Deadline telah lewat; waktu tidak ditambah.');end if;
 if input->>'action'='disqualify' and a.status='in_progress' then update public.exam_attempts set status='disqualified',review_reason=input->>'reason',version=version+1 where id=target;
 elsif input->>'action'='unlock' and a.status='disqualified' then update public.exam_attempts set status='in_progress',review_reason=input->>'reason',writer_epoch=writer_epoch+1,version=version+1 where id=target;
 else raise exception 'Transisi peninjauan tidak valid';end if;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(a.organization_id,auth.uid(),'REVIEW_'||(input->>'action')||': '||(input->>'reason'),'exam_attempts',target::text);return jsonb_build_object('saved',true,'deadline_at',a.deadline_at);
end$$;
create function private.can_read_attempt_media(target uuid) returns boolean language sql stable security definer set search_path='' as $$select private.actor_org() is not null and exists(select 1 from public.exam_attempts ea join private.attempt_questions aq on aq.attempt_id=ea.id where ea.student_id=auth.uid() and ea.finalized_at is null and ea.status='in_progress' and clock_timestamp()<ea.deadline_at and aq.student_payload->'attachments' ? target::text)$$;
create policy student_question_media on public.media_assets for select to authenticated using(private.can_read_attempt_media(id));
create policy student_question_storage on storage.objects for select to authenticated using(bucket_id='exam-media' and exists(select 1 from public.media_assets m where m.object_path=name and private.can_read_attempt_media(m.id)));
create function public.attempt_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.attempt_command(input)$$;
create function public.review_attempt(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.review_attempt(input)$$;
revoke all on function public.attempt_command(jsonb),public.review_attempt(jsonb) from public,anon;grant execute on function public.attempt_command(jsonb),public.review_attempt(jsonb) to authenticated;
revoke all on function private.grade_one(jsonb,jsonb),private.answer_complete(jsonb,jsonb),private.attempt_finalize(uuid,text),private.owns_attempt(uuid),private.attempt_dto(uuid),private.check_answer(private.attempt_questions,jsonb,uuid),private.attempt_command(jsonb),private.can_review_attempt(uuid),private.review_attempt(jsonb),private.can_read_attempt_media(uuid) from public,anon,authenticated;
grant execute on function private.attempt_command(jsonb),private.review_attempt(jsonb),private.can_read_attempt_media(uuid) to authenticated;
-- Shared login budget is called from the authenticated definer, never directly granted to students.
create or replace function public.advance_exam_schedule() returns integer language plpgsql security invoker set search_path='' as $$declare n int;item record;begin update public.exams set status=case when clock_timestamp()>=ends_at then 'closed' else 'active' end where status in ('scheduled','active') and (clock_timestamp()>=starts_at or clock_timestamp()>=ends_at);get diagnostics n=row_count;for item in select id from public.exam_attempts where finalized_at is null and status in ('in_progress','disqualified') and deadline_at<=clock_timestamp() order by id for update skip locked loop perform private.attempt_finalize(item.id,'timeout');end loop;return n;end$$;
grant execute on function private.attempt_finalize(uuid,text) to service_role;
