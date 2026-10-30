-- Additive workflow; old attempts, snapshots, grades and deadlines are not rewritten.
create table private.attempt_presence(attempt_id uuid primary key references public.exam_attempts(id),last_seen_at timestamptz not null);
create table private.exam_help_requests(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.exam_attempts(id),student_id uuid not null references public.profiles(id),message text not null check(length(trim(message)) between 5 and 1000),created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,resolved_by uuid references public.profiles(id),resolution text);
create unique index exam_help_one_open on private.exam_help_requests(attempt_id) where resolved_at is null;
create index exam_help_attempt_time on private.exam_help_requests(attempt_id,created_at desc);
create table private.workflow_requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id));
alter table private.attempt_presence enable row level security;
alter table private.exam_help_requests enable row level security;
alter table private.workflow_requests enable row level security;
revoke all on private.attempt_presence,private.exam_help_requests,private.workflow_requests from public,anon,authenticated;

create function private.readiness_item(code text,label text,ok boolean,blocking boolean,detail text,href text) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('code',code,'label',label,'ok',coalesce(ok,false),'blocking',blocking,'detail',detail,'href',href)$$;
revoke all on function private.readiness_item(text,text,boolean,boolean,text,text) from public,anon,authenticated;
create function private.exam_preparation(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.exams;checks jsonb:='[]';n int;unconfirmed int;inactive int;qn int:=0;bad int:=0;missing_media int:=0;r record;ready boolean;state text;finished int;pending int;running int;begin
 if not private.can_author(target) then raise exception 'AUTH: Ujian di luar cakupan penyusunan';end if;
 select * into e from public.exams where id=target;
 select count(*),count(*) filter(where u.email_confirmed_at is null) into n,unconfirmed from public.profiles p join auth.users u on u.id=p.id where p.organization_id=e.organization_id and p.role='student' and p.active and p.archived_at is null and exists(select 1 from public.exam_classes ec join public.student_enrollments en on en.class_id=ec.class_id and en.organization_id=ec.organization_id and en.active where ec.exam_id=target and en.student_id=p.id);
 select count(distinct p.id) into inactive from public.profiles p where p.organization_id=e.organization_id and p.role='student' and (not p.active or p.archived_at is not null) and exists(select 1 from public.exam_classes ec join public.student_enrollments en on en.class_id=ec.class_id and en.active where ec.exam_id=target and en.student_id=p.id);
 checks:=checks||private.readiness_item('identity','Identitas dan kelas',exists(select 1 from public.subjects s where s.id=e.subject_id and s.active) and exists(select 1 from public.exam_classes where exam_id=target) and not exists(select 1 from public.exam_classes ec join public.classes c on c.id=ec.class_id where ec.exam_id=target and not c.active),true,'Mapel dan seluruh kelas harus aktif.','/dashboard/exams?exam='||target);
 checks:=checks||private.readiness_item('participants','Peserta aktif',n>0,true,n||' siswa aktif; '||inactive||' akun nonaktif tidak diikutkan.','/dashboard/master-data');
 checks:=checks||private.readiness_item('accounts','Aktivasi akun',unconfirmed=0,false,unconfirmed||' peserta belum mengonfirmasi email. Lakukan uji login sebelum hari ujian.','/dashboard/users');
 checks:=checks||private.readiness_item('schedule','Jadwal dan durasi',e.ends_at>e.starts_at and e.duration_minutes>0 and e.duration_minutes*60<=extract(epoch from e.ends_at-e.starts_at) and e.ends_at>clock_timestamp() and (e.status<>'draft' or e.starts_at>clock_timestamp()),true,'Durasi harus muat dalam jendela jadwal; draf harus dimulai di masa depan.','/dashboard/exams?exam='||target);
 checks:=checks||private.readiness_item('pin','PIN ujian',length(coalesce(e.pin_hash,''))>0,true,'PIN tersimpan sebagai hash dan tidak ditampilkan.','/dashboard/exams?exam='||target);
 for r in select q.type,z.payload,c.enabled,c.option_count,c.max_questions,count(*) over(partition by q.type) count_type from public.questions q left join public.question_versions z on z.question_id=q.id and z.version=q.current_version left join public.exam_type_configs c on c.exam_id=target and c.type=q.type where q.exam_id=target and q.archived_at is null loop
  qn:=qn+1;
  begin
   if r.payload is null or r.enabled is distinct from true or (r.max_questions>0 and r.count_type>r.max_questions) or (r.type in ('PG','PG_KOMPLEKS') and jsonb_array_length(r.payload->'options')<>r.option_count) then raise exception 'Konfigurasi soal tidak sesuai';end if;
   perform private.validate_question(r.payload);
  exception when others then bad:=bad+1;end;
  select missing_media+count(*) into missing_media from jsonb_array_elements_text(coalesce(r.payload->'attachments','[]')) m where not exists(select 1 from public.media_assets ma join storage.objects o on o.name=ma.object_path and o.bucket_id='exam-media' where ma.id=m::uuid and ma.organization_id=e.organization_id);
 end loop;
 checks:=checks||private.readiness_item('rules','Konfigurasi tipe soal',(select count(*)=5 and bool_or(enabled) from public.exam_type_configs where exam_id=target),true,'Lima konfigurasi tipe wajib tersedia, dengan minimal satu tipe aktif.','/dashboard/exams?exam='||target);
 checks:=checks||private.readiness_item('questions','Soal dan kunci',qn>0 and bad=0,true,qn||' soal; '||bad||' soal atau konfigurasi tidak valid.','/dashboard/exams?exam='||target);
 checks:=checks||private.readiness_item('media','Lampiran soal',missing_media=0,true,missing_media||' lampiran belum tersedia di penyimpanan.','/dashboard/media');
 checks:=checks||private.readiness_item('rooms','Ruang dan pengawas',exists(select 1 from public.exam_rooms where exam_id=target) and not exists(select 1 from public.profiles p where p.role='student' and p.active and exists(select 1 from public.exam_classes ec join public.student_enrollments en on en.class_id=ec.class_id and en.active where ec.exam_id=target and en.student_id=p.id) and not exists(select 1 from public.exam_room_students rs where rs.exam_id=target and rs.student_id=p.id)) and not exists(select 1 from public.exam_rooms er where er.exam_id=target and not exists(select 1 from public.supervisor_assignments sa join public.profiles sp on sp.id=sa.original_supervisor_id and sp.active join public.exam_sessions es on es.id=sa.session_id where sa.exam_id=target and sa.room_id=er.id and sa.active and es.starts_at<e.ends_at and es.ends_at>e.starts_at)),false,'Periksa roster, kapasitas, sesi dan tugas pengawas sebelum pelaksanaan.','/dashboard/rooms');
 select not exists(select 1 from jsonb_array_elements(checks) c where (c->>'blocking')::boolean and not (c->>'ok')::boolean) into ready;
 select count(*) filter(where finalized_at is not null),coalesce(sum(grading_pending) filter(where finalized_at is not null),0),count(*) filter(where finalized_at is null) into finished,pending,running from public.exam_attempts where exam_id=target and status<>'reset';
 state:=case when e.status='archived' then 'Diarsipkan' when e.status='draft' then case when ready then 'Siap Ditinjau' else 'Draf' end when e.status='closed' or clock_timestamp()>=e.ends_at then case when e.show_exam_result then 'Dipublikasikan' when finished>0 and pending=0 and running=0 then 'Dinilai' else 'Selesai' end when clock_timestamp()>=e.starts_at then 'Berlangsung' else 'Terjadwal' end;
 return jsonb_build_object('id',e.id,'title',e.title,'status',e.status,'lifecycle',state,'starts_at',e.starts_at,'ends_at',e.ends_at,'duration_minutes',e.duration_minutes,'ready',ready,'participants',n,'unconfirmed',unconfirmed,'question_count',qn,'checks',checks);
end$$;
revoke all on function private.exam_preparation(uuid) from public,anon,authenticated;

-- Existing schedule form and direct RPC callers also pass the publication gate.
alter function private.author_command(jsonb) rename to author_command_before_workflow;
revoke all on function private.author_command_before_workflow(jsonb) from public,anon,authenticated;
create function private.author_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;checklist jsonb;rid uuid;prior private.workflow_requests;fingerprint jsonb;begin
 if input->>'action'='exam' and input ? 'request_id' then
  if not private.is_admin() then raise exception 'AUTH: Hanya Admin mengatur jadwal';end if;
  rid:=(input->>'request_id')::uuid;
  fingerprint:=jsonb_build_object('sha256',encode(extensions.digest(input::text,'sha256'),'hex'));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||rid::text,0));
  select * into prior from private.workflow_requests where actor_id=auth.uid() and request_id=rid;
  if found then if prior.input<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 end if;
 result:=private.author_command_before_workflow(input);
 if input->>'action'='exam' and input->'exam'->>'status' in ('scheduled','active') then
  checklist:=private.exam_preparation((result->>'id')::uuid);
  if not (checklist->>'ready')::boolean then raise exception 'READINESS: Lengkapi pemeriksaan persiapan sebelum menjadwalkan ujian';end if;
 end if;
 if rid is not null then insert into private.workflow_requests values(auth.uid(),rid,fingerprint,result);end if;
 return result;
end$$;
revoke all on function private.author_command(jsonb) from public,anon;
grant execute on function private.author_command(jsonb) to authenticated;

-- Reuse the successful writer heartbeat already performed by the player every 15 seconds.
alter function private.attempt_command(jsonb) rename to attempt_command_before_workflow;
revoke all on function private.attempt_command_before_workflow(jsonb) from public,anon,authenticated;
create function private.attempt_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;target uuid;begin
 result:=private.attempt_command_before_workflow(input);
 if not result ? 'error' and input->>'action' in ('start','resume','takeover','save') then
  target:=coalesce(nullif(input->>'attempt_id','')::uuid,nullif(result->>'id','')::uuid);
  if exists(select 1 from public.exam_attempts where id=target and student_id=auth.uid() and status='in_progress' and finalized_at is null) then
   insert into private.attempt_presence values(target,clock_timestamp()) on conflict(attempt_id) do update set last_seen_at=excluded.last_seen_at where attempt_presence.last_seen_at<clock_timestamp()-interval '10 seconds';
  end if;
 end if;return result;
end$$;
revoke all on function private.attempt_command(jsonb) from public,anon;
grant execute on function private.attempt_command(jsonb) to authenticated;

create function private.workflow_command(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=input->>'action';org uuid:=private.actor_org();uid uuid:=auth.uid();role_name text;eid uuid:=nullif(input->>'exam_id','')::uuid;target uuid:=nullif(input->>'attempt_id','')::uuid;rid uuid:=nullif(input->>'request_id','')::uuid;a public.exam_attempts;e public.exams;ticket private.exam_help_requests;prior private.workflow_requests;result jsonb;mins int;new_deadline timestamptz;begin
 if org is null then raise exception 'AUTH: Sesi aktif diperlukan';end if;
 select role into role_name from public.profiles where id=uid;
 if op='import_preview' then
  if role_name not in ('admin','teacher') or jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 200 then raise exception 'AUTH: Pratinjau impor staf maksimal 200 baris';end if;
  select jsonb_agg(jsonb_build_object('username',v->>'username','error',case when exists(select 1 from public.profiles p where p.username=lower(v->>'username')) then 'Username sudah digunakan.' when v->>'role' not in ('admin','teacher','supervisor','student') then 'Peran tidak valid.' when role_name='teacher' and (v->>'role'<>'student' or not exists(select 1 from public.teacher_assignments ta where ta.teacher_id=uid and ta.class_id=nullif(v->>'class_id','')::uuid and ta.active)) then 'Guru hanya boleh mengimpor siswa pada kelas penugasan.' when nullif(v->>'class_id','') is not null and not exists(select 1 from public.classes c where c.id=(v->>'class_id')::uuid and c.organization_id=org and c.active) then 'Kelas tidak aktif atau di luar cakupan.' else '' end)) into result from jsonb_array_elements(input->'items') v;
  return result;
 elsif op='preparation' then
  if role_name not in ('admin','teacher') then raise exception 'AUTH: Akses staf diperlukan';end if;
  select coalesce(jsonb_agg(private.exam_preparation(ex.id) order by ex.starts_at),'[]') into result from public.exams ex where private.can_author(ex.id) and (eid is null or ex.id=eid);
  return jsonb_build_object('exams',result,'admin',private.is_admin(),'server_now',clock_timestamp());
 elsif op='signals' then
  if role_name not in ('admin','teacher','supervisor') or eid is null then raise exception 'AUTH: Akses petugas diperlukan';end if;
  select coalesce(jsonb_agg(jsonb_build_object('attempt_id',ea.id,'last_seen_at',p.last_seen_at,'connection',case when p.last_seen_at is null then 'unknown' when p.last_seen_at<clock_timestamp()-interval '45 seconds' then 'stale' else 'recent' end,'help_count',(select count(*) from private.exam_help_requests h where h.attempt_id=ea.id and h.resolved_at is null))),'[]') into result from public.exam_attempts ea left join private.attempt_presence p on p.attempt_id=ea.id where ea.exam_id=eid and ea.status<>'reset' and private.ops_student(eid,ea.student_id,false);return result;
 elsif op='help_list' then
  if role_name='student' and not private.owns_attempt(target) then raise exception 'AUTH: Attempt tidak tersedia';end if;
  if role_name not in ('student','admin','teacher','supervisor') then raise exception 'AUTH: Akses ditolak';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'attempt_id',h.attempt_id,'student',p.full_name,'message',h.message,'created_at',h.created_at,'resolved_at',h.resolved_at,'resolution',h.resolution,'can_resolve',private.can_review_attempt(h.attempt_id)) order by h.created_at desc),'[]') into result from private.exam_help_requests h join public.exam_attempts ea on ea.id=h.attempt_id join public.profiles p on p.id=h.student_id where (target is null or h.attempt_id=target) and (eid is null or ea.exam_id=eid) and ((role_name='student' and h.student_id=uid) or (role_name<>'student' and private.ops_student(ea.exam_id,ea.student_id,false)));return result;
 end if;
 -- Authorization is checked before returning an idempotent result, including after reassignment.
 if op='help' then
  if role_name<>'student' or not private.owns_attempt(target) then raise exception 'AUTH: Bantuan hanya untuk attempt sendiri';end if;
 elsif op='resolve' then
  select * into ticket from private.exam_help_requests where id=(input->>'id')::uuid;
  if not found or not private.can_review_attempt(ticket.attempt_id) or role_name not in ('admin','teacher','supervisor') then raise exception 'AUTH: Tugas pengawas efektif diperlukan';end if;
  target:=ticket.attempt_id;
 elsif op in ('publish','extend') then
  if not private.is_admin() then raise exception 'AUTH: Hanya Admin';end if;
 else raise exception 'Aksi tidak dikenal';end if;
 if rid is null then raise exception 'Request ID wajib';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||rid::text,0));
 select * into prior from private.workflow_requests where actor_id=uid and request_id=rid;
 if found then if prior.input<>input then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if op='publish' then
  select * into e from public.exams where id=eid and organization_id=org for update;
  if not found or e.status<>'draft' or e.starts_at<=clock_timestamp() then raise exception 'Hanya draf sebelum waktu mulai dapat dipublikasikan';end if;
  if input->>'confirmation' is distinct from 'PUBLIKASIKAN' then raise exception 'Konfirmasi publikasi wajib';end if;
  result:=private.exam_preparation(eid);
  if not (result->>'ready')::boolean then raise exception 'READINESS: Masih ada pemeriksaan wajib yang belum lengkap';end if;
  update public.exams set status='scheduled' where id=eid;
  result:=jsonb_build_object('published',true,'id',eid);
 elsif op='extend' then
  if input->>'confirmation' is distinct from 'TAMBAH WAKTU' or length(trim(coalesce(input->>'reason',''))) not between 5 and 1000 then raise exception 'Alasan dan konfirmasi dispensasi wajib';end if;
  mins:=(input->>'minutes')::int;if mins is null or mins not between 1 and 60 then raise exception 'Tambahan waktu 1–60 menit';end if;
  select ex.* into e from public.exams ex join public.exam_attempts ea on ea.exam_id=ex.id where ea.id=target and ea.organization_id=org for share of ex;
  select * into a from public.exam_attempts where id=target and organization_id=org for update;
  if not found or e.id is null or a.finalized_at is not null or a.status<>'in_progress' or a.deadline_at<=clock_timestamp() or e.status not in ('scheduled','active') or e.ends_at<=clock_timestamp() then raise exception 'Dispensasi hanya untuk sesi aktif sebelum deadline; tidak membuka ulang ujian';end if;
  if (input->>'version')::int is distinct from a.version then raise exception 'CONFLICT: Status peserta berubah; muat ulang';end if;
  new_deadline:=a.deadline_at+make_interval(mins=>mins);
  if new_deadline>e.ends_at then raise exception 'Tambahan melampaui akhir jadwal ujian';end if;
  insert into private.attempt_overrides(attempt_id,actor_id,action,reason,before_state) values(target,uid,'extend',trim(input->>'reason'),to_jsonb(a));
  update public.exam_attempts set deadline_at=new_deadline,version=version+1 where id=target;
  result:=jsonb_build_object('deadline_at',new_deadline,'minutes',mins);
 elsif op='help' then
  if length(trim(coalesce(input->>'message',''))) not between 5 and 1000 then raise exception 'Pesan bantuan 5–1000 karakter';end if;
  select * into a from public.exam_attempts where id=target for update;
  if a.finalized_at is not null or a.status not in ('in_progress','disqualified') or a.deadline_at<=clock_timestamp() then raise exception 'Sesi sudah berakhir';end if;
  select * into ticket from private.exam_help_requests where attempt_id=target and resolved_at is null;
  if not found then
   if (select count(*) from private.exam_help_requests where attempt_id=target)>=20 then raise exception 'Batas permintaan bantuan tercapai; hubungi petugas langsung';end if;
   insert into private.exam_help_requests(attempt_id,student_id,message) values(target,uid,trim(input->>'message')) returning * into ticket;
  end if;
  result:=jsonb_build_object('id',ticket.id,'message','Permintaan tercatat. Tunggu tanggapan pengawas.');
 elsif op='resolve' then
  if length(trim(coalesce(input->>'reason',''))) not between 5 and 1000 then raise exception 'Tanggapan 5–1000 karakter';end if;
  select * into ticket from private.exam_help_requests where id=ticket.id for update;
  if ticket.resolved_at is not null then raise exception 'Permintaan sudah ditangani; muat ulang';end if;
  update private.exam_help_requests set resolved_at=clock_timestamp(),resolved_by=uid,resolution=trim(input->>'reason') where id=ticket.id;
  result:=jsonb_build_object('resolved',true);
 end if;
 insert into private.workflow_requests values(uid,rid,input,result);
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id,request_id) values(org,uid,'WORKFLOW_'||op,case when op='publish' then 'exams' else 'exam_attempts' end,coalesce(eid,target)::text,rid);
 return result;
end$$;
create function public.workflow_command(input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.workflow_command(input)$$;
revoke all on function private.workflow_command(jsonb),public.workflow_command(jsonb) from public,anon,authenticated;
grant execute on function private.workflow_command(jsonb),public.workflow_command(jsonb) to authenticated;

-- A changed question invalidates a previously published future schedule.
create function private.invalidate_exam_readiness() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if tg_table_name='questions' then target:=new.exam_id;
 else select exam_id into target from public.questions where id=new.question_id;end if;
 update public.exams set status='draft' where id=target and status='scheduled' and starts_at>clock_timestamp();
 if found then insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) select organization_id,auth.uid(),'WORKFLOW_READINESS_INVALIDATED','exams',target::text from public.exams where id=target;end if;
 return new;
end$$;
revoke all on function private.invalidate_exam_readiness() from public,anon,authenticated;
create trigger question_readiness_changed after insert or update on public.questions for each row execute function private.invalidate_exam_readiness();
create trigger version_readiness_changed after insert on public.question_versions for each row execute function private.invalidate_exam_readiness();
