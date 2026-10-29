create or replace function private.author_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
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
 if not exists(select 1 from public.subjects where id=(v->>'subject_id')::uuid and organization_id=org and active) or exists(select 1 from jsonb_array_elements_text(v->'class_ids') as ids(value) where not exists(select 1 from public.classes where classes.id=ids.value::uuid and organization_id=org and active)) then raise exception 'Mapel/kelas tidak aktif';end if;
 if (v->>'starts_at')::timestamptz<=now() then raise exception 'Waktu mulai baru harus di masa depan';end if;
 if eid is null and coalesce(v->>'pin','') !~ '^[0-9]{4,12}$' then raise exception 'PIN 4–12 digit wajib';end if;
 if v ? 'pin' and v->>'pin' !~ '^[0-9]{4,12}$' then raise exception 'PIN tidak valid';end if;
 if eid is null then
 insert into public.exams(organization_id,subject_id,title,starts_at,ends_at,duration_minutes,pin_hash,status,passing_grade,bypass_period,shuffle_questions,shuffle_options,created_by) values(org,(v->>'subject_id')::uuid,v->>'title',(v->>'starts_at')::timestamptz,(v->>'ends_at')::timestamptz,(v->>'duration_minutes')::int,extensions.crypt(v->>'pin',extensions.gen_salt('bf')),v->>'status',(v->>'passing_grade')::numeric,(v->>'bypass_period')::boolean,(v->>'shuffle_questions')::boolean,(v->>'shuffle_options')::boolean,auth.uid()) returning id into eid;
 else update public.exams set subject_id=(v->>'subject_id')::uuid,title=v->>'title',starts_at=(v->>'starts_at')::timestamptz,ends_at=(v->>'ends_at')::timestamptz,duration_minutes=(v->>'duration_minutes')::int,pin_hash=case when v ? 'pin' then extensions.crypt(v->>'pin',extensions.gen_salt('bf')) else pin_hash end,status=v->>'status',passing_grade=(v->>'passing_grade')::numeric,bypass_period=(v->>'bypass_period')::boolean,shuffle_questions=(v->>'shuffle_questions')::boolean,shuffle_options=(v->>'shuffle_options')::boolean where id=eid;end if;
 delete from public.exam_classes where exam_id=eid;
 insert into public.exam_classes select org,eid,ids.value::uuid from jsonb_array_elements_text(v->'class_ids') as ids(value) group by ids.value;
 for c in select * from jsonb_array_elements(v->'configs') loop
 if (c->>'max_questions')::int<0 or (c->>'default_points')::numeric<=0 or (c->>'option_count')::int not between 2 and 6 then raise exception 'Konfigurasi tipe tidak valid';end if;
 select count(*) into cnt from public.questions where exam_id=eid and type=c->>'type' and archived_at is null;
 if cnt>0 and (not(c->>'enabled')::boolean or ((c->>'max_questions')::int>0 and cnt>(c->>'max_questions')::int) or exists(select 1 from public.questions q join public.question_versions z on z.question_id=q.id and z.version=q.current_version where q.exam_id=eid and q.type=c->>'type' and q.archived_at is null and q.type in ('PG','PG_KOMPLEKS') and jsonb_array_length(z.payload->'options')<>(c->>'option_count')::int)) then raise exception 'Konfigurasi bertentangan dengan soal yang tersimpan';end if;
 insert into public.exam_type_configs values(eid,c->>'type',(c->>'enabled')::boolean,(c->>'max_questions')::int,(c->>'option_count')::int,(c->>'default_points')::numeric) on conflict(exam_id,type) do update set enabled=excluded.enabled,max_questions=excluded.max_questions,option_count=excluded.option_count,default_points=excluded.default_points;end loop;
 return jsonb_build_object('id',eid);
 end if;
 if a='archive_exams' then
 if not private.is_admin() or jsonb_array_length(input->'ids') not between 1 and 500 then raise exception 'AUTH: Arsip tidak valid';end if;
 update public.exams set status='archived' where organization_id=org and id in (select selected.value::uuid from jsonb_array_elements_text(input->'ids') as selected(value));
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
 update public.questions set archived_at=now() where exam_id=eid and id in(select selected.value::uuid from jsonb_array_elements_text(input->'ids') as selected(value));return jsonb_build_object('saved',true);end if;
 if a not in ('questions','copy') then raise exception 'Aksi tidak dikenal';end if;
 req:=(input->>'request_id')::uuid;
 if req is null then raise exception 'Idempotency key wajib';end if;
 select * into oldreq from private.authoring_requests where exam_id=eid and actor_id=auth.uid() and key=req;
 if found then if oldreq.input<>input then raise exception 'Idempotency key digunakan untuk isi berbeda';end if;return oldreq.result;end if;
 if a='copy' then
 source:=(input->>'source_exam_id')::uuid;
 if not private.can_author(source) or source=eid then raise exception 'AUTH: Sumber tidak valid';end if;
 if jsonb_array_length(input->'ids') not between 1 and 500 then raise exception 'Maksimal 500 soal';end if;
 select jsonb_agg(z.payload) into v from public.questions srcq join public.question_versions z on z.question_id=srcq.id and z.version=srcq.current_version where srcq.exam_id=source and srcq.archived_at is null and srcq.id in(select selected.value::uuid from jsonb_array_elements_text(input->'ids') as selected(value));
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
 for mid in select media.value::uuid from jsonb_array_elements_text(x->'attachments') as media(value) loop
 if not exists(select 1 from public.media_assets m where m.id=mid and m.organization_id=org and (private.is_admin() or m.uploader_id=auth.uid() or (a='copy' and exists(select 1 from public.question_attachments qa join public.questions qq on qq.id=qa.question_id where qa.media_id=mid and qq.exam_id=source)))) then raise exception 'AUTH: Lampiran tidak dapat diakses';end if;
 end loop;
 if qid is null then insert into public.questions(organization_id,exam_id,type,points) values(org,eid,x->>'type',(x->>'points')::numeric) returning id,current_version into qid,seq;
 else seq:=q.current_version+1;update public.questions set type=x->>'type',points=(x->>'points')::numeric,current_version=seq where id=qid;end if;
 insert into public.question_versions(question_id,version,payload) values(qid,seq,x);
 insert into public.question_attachments(question_id,media_id) select qid,media.value::uuid from jsonb_array_elements_text(x->'attachments') as media(value) on conflict do nothing;
 saved:=saved+1;res:=res||jsonb_build_array(jsonb_build_object('block',pos,'id',qid,'version',seq,'saved',true));
 exception when others then get stacked diagnostics err=message_text;res:=res||jsonb_build_array(jsonb_build_object('block',pos,'saved',false,'error',err));end;
 end loop;
 x:=jsonb_build_object('saved',saved,'skipped',pos-saved,'details',res);
 insert into private.authoring_requests values(eid,auth.uid(),req,input,x);
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(org,auth.uid(),a,'exams',eid::text);
 return x;
end $$;
