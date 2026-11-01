-- Additive metadata; existing messages remain informational and unlinked.
alter table private.notifications add column title text not null default 'Pesan petugas' check(length(trim(title)) between 1 and 120);
alter table private.notifications add column priority text not null default 'info' check(priority in ('info','important'));
alter table private.notifications add column exam_id uuid references public.exams(id) on delete set null;
create index notification_recipient_unread on private.notification_receipts(recipient_id,read_at,notification_id);
create index notification_exam on private.notifications(exam_id) where exam_id is not null;
-- Preserve the existing operational authorization, idempotency, audit and rate limits.
do $migration$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('private.ops_command(jsonb)'::regprocedure);
 anchor:=$old$if op='inbox' then$old$;
 replacement:=$new$if op='inbox_page' then
  if coalesce(input->>'filter','all') not in ('all','unread') then raise exception 'Filter notifikasi tidak valid';end if;
  n:=greatest(1,least(100000,coalesce((input->>'page')::int,1)));
  select jsonb_build_object('page',n,'total',(select count(*) from private.notification_receipts r join private.notifications m on m.id=r.notification_id where r.recipient_id=uid and m.organization_id=org and (input->>'filter' is distinct from 'unread' or r.read_at is null)),
   'unread_total',(select count(*) from private.notification_receipts r join private.notifications m on m.id=r.notification_id where r.recipient_id=uid and m.organization_id=org and r.read_at is null),
   'rows',coalesce((select jsonb_agg(v order by unread desc,important desc,created_at desc,id desc) from(
    select jsonb_build_object('id',m.id,'title',m.title,'priority',m.priority,'message',m.message,'created_at',m.created_at,'read_at',r.read_at,'has_exam',m.exam_id is not null,'exam_id',e.id,'exam_title',e.title) v,r.read_at is null unread,m.priority='important' important,m.created_at,m.id
    from private.notification_receipts r join private.notifications m on m.id=r.notification_id
    left join public.exams e on e.id=m.exam_id and e.organization_id=org and e.status not in ('draft','archived') and exists(select 1 from public.exam_classes ec join public.student_enrollments se on se.organization_id=ec.organization_id and se.class_id=ec.class_id where ec.exam_id=e.id and se.student_id=uid and se.active)
    where r.recipient_id=uid and m.organization_id=org and (input->>'filter' is distinct from 'unread' or r.read_at is null)
    order by r.read_at is null desc,m.priority='important' desc,m.created_at desc,m.id desc limit 20 offset (n-1)*20
   )x),'[]')) into result;return result;
 end if;
 if op='read_batch' then
  if jsonb_typeof(input->'ids') is distinct from 'array' or jsonb_array_length(input->'ids') not between 1 and 20 then raise exception 'Pilih 1–20 notifikasi';end if;
  update private.notification_receipts r set read_at=coalesce(r.read_at,clock_timestamp()) where r.recipient_id=uid and r.notification_id in(select value::uuid from jsonb_array_elements_text(input->'ids')) and exists(select 1 from private.notifications m where m.id=r.notification_id and m.organization_id=org);
  get diagnostics n=row_count;return jsonb_build_object('saved',true,'updated',n);
 end if;
 if op='inbox' then$new$;
 if position(anchor in definition)=0 then raise exception 'Inbox anchor changed';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$where r.notification_id=target and r.recipient_id=uid;return jsonb_build_object('saved',found)$old$;
 replacement:=$new$where r.notification_id=target and r.recipient_id=uid and exists(select 1 from private.notifications m where m.id=r.notification_id and m.organization_id=org);return jsonb_build_object('saved',found)$new$;
 if position(anchor in definition)=0 then raise exception 'Receipt anchor changed';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$if not public.consume_login_budget('broadcast:'||uid::text)$old$;
 replacement:=$new$if length(trim(coalesce(input->>'title','Pesan petugas'))) not between 1 and 120 or coalesce(input->>'priority','info') not in ('info','important') then raise exception 'Judul/prioritas tidak valid';end if;
 if coalesce((input->>'link_exam')::boolean,false) and (input->>'scope' not in ('exam','selected') or not exists(select 1 from public.exams e where e.id=eid and e.organization_id=org)) then raise exception 'AUTH: Konteks ujian tidak valid';end if;
 if not public.consume_login_budget('broadcast:'||uid::text)$new$;
 if position(anchor in definition)=0 then raise exception 'Broadcast anchor changed';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$insert into private.notifications(organization_id,sender_id,message) values(org,uid,trim(input->>'message'))$old$;
 replacement:=$new$insert into private.notifications(organization_id,sender_id,message,title,priority,exam_id) values(org,uid,trim(input->>'message'),trim(coalesce(input->>'title','Pesan petugas')),coalesce(input->>'priority','info'),case when coalesce((input->>'link_exam')::boolean,false) then eid else null end)$new$;
 if position(anchor in definition)=0 then raise exception 'Notification insert anchor changed';end if;
 definition:=replace(definition,anchor,replacement);
 -- Enrich legacy/sent output without changing its array contract.
 definition:=replace(definition,$old$'id',m.id,'message',m.message,'created_at',m.created_at$old$,$new$'id',m.id,'title',m.title,'priority',m.priority,'message',m.message,'created_at',m.created_at$new$);
 execute definition;
end$migration$;
