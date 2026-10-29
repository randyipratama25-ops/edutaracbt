begin;
select cron.unschedule(jobid) from cron.job where jobname='edutara-operations';
update private.app_settings set automation_enabled=false,reminders_enabled=false;
update private.work_jobs set status=case when kind='reminder' and payload->>'delivery_started'='true' then 'uncertain' else 'blocked' end,nonce_hash=null,lease=null,lease_until=null,error='Paused for rollback; reconcile before resuming' where status in ('queued','running','failed');
revoke execute on function public.system_command(jsonb),private.system_command(jsonb),public.worker_command(jsonb),private.worker_command(jsonb),public.app_branding() from anon,authenticated,service_role;
alter policy login_brand_media on public.media_assets using(false);
alter policy login_brand_storage on storage.objects using(false);
CREATE OR REPLACE FUNCTION private.attempt_command(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if a.finalized_at is null and exists(select 1 from public.exams closed_exam where closed_exam.id=a.exam_id and closed_exam.status in ('closed','archived')) then update public.exam_attempts set deadline_at=greatest(started_at,least(deadline_at,clock_timestamp())) where id=target returning * into a;end if;
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
end$function$
;
CREATE OR REPLACE FUNCTION private.attempt_dto(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare a public.exam_attempts;questions jsonb;answers jsonb;e public.exams;begin
 if not private.owns_attempt(target) then raise exception 'AUTH: Attempt tidak tersedia';end if;
 select * into a from public.exam_attempts where id=target;
 select * into e from public.exams where id=a.exam_id;
 if a.finalized_at is null and a.status='in_progress' then
 select coalesce(jsonb_agg(jsonb_build_object('id',q.question_id,'version',q.question_version,'position',q.position,'payload',q.student_payload) order by q.position),'[]') into questions from private.attempt_questions q where q.attempt_id=target;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',sa.question_id,'revision',sa.revision,'value',sa.value,'saved_at',sa.saved_at,'checksum',encode(extensions.digest(sa.value::text,'sha256'),'hex'))),'[]') into answers from public.attempt_answers sa where sa.attempt_id=target;
 else questions:='[]';answers:='[]';end if;
 return jsonb_build_object('id',a.id,'exam_id',a.exam_id,'title',e.title,'status',a.status,'deadline_at',a.deadline_at,'server_now',clock_timestamp(),'epoch',a.writer_epoch,'finalized_at',a.finalized_at,'questions',questions,'answers',answers,'grading_pending',a.grading_pending,'score',case when e.show_exam_result and a.grading_pending=0 and a.finalized_at is not null and a.status<>'disqualified' then a.score_percent else null end,'result_visible',e.show_exam_result and a.grading_pending=0 and a.finalized_at is not null and a.status<>'disqualified','review_reason',a.review_reason,'policy',jsonb_build_object('integrity_mode','review','unlock_time','fixed_deadline','tolerance_ms',1500,'incident_cooldown_ms',10000));
end$function$
;
CREATE OR REPLACE FUNCTION private.can_upload_attempt_canvas(path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.actor_org() is not null and split_part(path,'/',1)=auth.uid()::text and exists(select 1 from public.exam_attempts a join private.attempt_questions q on q.attempt_id=a.id where a.student_id=auth.uid() and a.id::text=split_part(path,'/',2) and q.question_id::text=split_part(path,'/',3) and a.status='in_progress' and a.finalized_at is null and clock_timestamp()<a.deadline_at and q.grading_payload->>'type'='Esai' and (q.grading_payload->'canvas'->>'enabled')::boolean)$function$
;
-- Keep all new data, Vault values, audit immutability and media reference protections.
commit;
