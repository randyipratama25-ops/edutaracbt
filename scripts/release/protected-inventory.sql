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

 union all select 'private.attempt_questions',jsonb_build_array(r.attempt_id,r.question_id)::text,to_jsonb(r)::text from private.attempt_questions r join attempts a on a.id=r.attempt_id
 union all select 'private.essay_grades',jsonb_build_array(r.attempt_id,r.question_id)::text,to_jsonb(r)::text from private.essay_grades r join attempts a on a.id=r.attempt_id
 union all select 'private.essay_grade_history',r.id::text,to_jsonb(r)::text from private.essay_grade_history r join attempts a on a.id=r.attempt_id
 union all select 'private.bank_items',r.id::text,to_jsonb(r)::text from private.bank_items r where r.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.bank_versions',jsonb_build_array(r.item_id,r.version)::text,to_jsonb(r)::text from private.bank_versions r join private.bank_items b on b.id=r.item_id where b.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.bank_reviews',r.id::text,to_jsonb(r)::text from private.bank_reviews r join private.bank_items b on b.id=r.item_id where b.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.bank_packs',r.id::text,to_jsonb(r)::text from private.bank_packs r join public.exams e on e.id=r.exam_id where e.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.bank_usage',jsonb_build_array(r.pack_id,r.item_id)::text,to_jsonb(r)::text from private.bank_usage r join private.bank_packs p on p.id=r.pack_id join public.exams e on e.id=p.exam_id where e.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.grade_moderations',r.id::text,to_jsonb(r)::text from private.grade_moderations r join attempts a on a.id=r.attempt_id
 union all select 'private.result_publications',r.exam_id::text,to_jsonb(r)::text from private.result_publications r where r.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
 union all select 'private.exam_help_requests',r.id::text,to_jsonb(r)::text from private.exam_help_requests r join attempts a on a.id=r.attempt_id

 union all select 'private.advanced_evaluations',r.id::text,to_jsonb(r)::text from private.advanced_evaluations r where r.organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'
)
select coalesce(jsonb_agg(jsonb_build_object('table',tbl,'key',key,'sha256',encode(extensions.digest(payload,'sha256'),'hex')) order by tbl,key),'[]') as inventory from protected;
commit;
