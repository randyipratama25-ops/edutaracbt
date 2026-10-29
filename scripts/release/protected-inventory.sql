-- Export only the inventory JSON value into a private local file, before/after rollback.
-- Snapshot consistency does not prevent new writes; follow the runbook's quiet window.
begin transaction isolation level repeatable read read only;
with attempts as (
 select * from public.exam_attempts where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
), protected as (
 select 'public.exam_attempts' as tbl, id::text as key, to_jsonb(r)::text as payload from attempts r
 union all select 'public.attempt_answers',jsonb_build_array(r.attempt_id,r.question_id)::text,to_jsonb(r)::text from public.attempt_answers r join attempts a on a.id=r.attempt_id
 union all select 'private.answer_revisions',jsonb_build_array(r.attempt_id,r.question_id,r.revision)::text,to_jsonb(r)::text from private.answer_revisions r join attempts a on a.id=r.attempt_id
 union all select 'public.answer_media',r.id::text,to_jsonb(r)::text from public.answer_media r join attempts a on a.id=r.attempt_id
 union all select 'public.grade_items',r.id::text,to_jsonb(r)::text from public.grade_items r join attempts a on a.id=r.attempt_id
 union all select 'private.grading_revisions',jsonb_build_array(r.attempt_id,r.revision)::text,to_jsonb(r)::text from private.grading_revisions r join attempts a on a.id=r.attempt_id
)
select coalesce(jsonb_agg(jsonb_build_object('table',tbl,'key',key,'sha256',encode(extensions.digest(payload,'sha256'),'hex')) order by tbl,key),'[]') as inventory from protected;
commit;
