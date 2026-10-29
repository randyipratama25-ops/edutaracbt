-- Upload rights follow a live student attempt and its canvas-enabled question, not just a user prefix.
create function private.can_upload_attempt_canvas(path text) returns boolean language sql stable security definer set search_path='' as $$select private.actor_org() is not null and split_part(path,'/',1)=auth.uid()::text and exists(select 1 from public.exam_attempts a join private.attempt_questions q on q.attempt_id=a.id where a.student_id=auth.uid() and a.id::text=split_part(path,'/',2) and q.question_id::text=split_part(path,'/',3) and a.status='in_progress' and a.finalized_at is null and clock_timestamp()<a.deadline_at and q.grading_payload->>'type'='Esai' and (q.grading_payload->'canvas'->>'enabled')::boolean)$$;
revoke all on function private.can_upload_attempt_canvas(text) from public,anon;
grant execute on function private.can_upload_attempt_canvas(text) to authenticated;
drop policy canvas_own_upload on storage.objects;
create policy canvas_own_upload on storage.objects for insert to authenticated with check(bucket_id='attempt-canvas' and private.can_upload_attempt_canvas(name));
-- Snapshot structure cannot be edited after creation, even if a future service accidentally tries to update it.
create function private.immutable_attempt_snapshot() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Snapshot attempt immutable';end$$;
revoke all on function private.immutable_attempt_snapshot() from public,anon,authenticated;
create trigger immutable_attempt_snapshot before update on private.attempt_questions for each row execute function private.immutable_attempt_snapshot();
