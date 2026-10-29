begin;
revoke execute on function public.ops_command(jsonb),private.ops_command(jsonb),public.card_command(jsonb),private.card_command(jsonb),public.media_command(jsonb),private.media_command(jsonb) from authenticated;

CREATE OR REPLACE FUNCTION private.can_review_attempt(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select exists(select 1 from public.exam_attempts a where a.id=target and a.organization_id=private.actor_org() and (private.is_admin() or (private.supervisor_allowed() and exists(select 1 from public.exam_room_students rs join public.supervisor_assignments sa on sa.exam_id=rs.exam_id and sa.room_id=rs.room_id left join public.supervisor_substitutions ss on ss.assignment_id=sa.id and ss.revoked_at is null and ss.effective_from<=now() and (ss.effective_until is null or ss.effective_until>now()) where rs.exam_id=a.exam_id and rs.student_id=a.student_id and sa.active and coalesce(ss.substitute_supervisor_id,sa.original_supervisor_id)=auth.uid()))))$function$
;

CREATE OR REPLACE FUNCTION private.room_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare cap integer; begin select capacity into cap from public.exam_rooms where id=new.room_id for update; if (select count(*) from public.exam_room_students where room_id=new.room_id)>=cap then raise exception 'Room capacity exceeded'; end if; return new; end $function$
;
CREATE OR REPLACE FUNCTION private.supervisor_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.actor_org() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('teacher','supervisor')) and exists(select 1 from public.supervisor_assignments a left join public.supervisor_substitutions s on s.assignment_id=a.id and s.revoked_at is null and s.effective_from<=now() and (s.effective_until is null or s.effective_until>now()) where a.active and a.organization_id=private.actor_org() and coalesce(s.substitute_supervisor_id,a.original_supervisor_id)=auth.uid()) $function$
;
-- Retain source-media access hardening.
-- Preserve all new attempt overrides, notifications, card jobs and files.
commit;
