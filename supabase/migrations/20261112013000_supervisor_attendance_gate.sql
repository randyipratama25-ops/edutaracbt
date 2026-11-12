-- Attendance belongs to the current assignment and its exact replacement, if any.
create function private.supervisor_present(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.effective_supervisor(target) = auth.uid() and exists (
    select 1
    from private.supervisor_attendance h
    where h.assignment_id = target and h.organization_id = private.actor_org()
      and h.profile_id = auth.uid()
      and h.substitution_id is not distinct from (
        select s.id from public.supervisor_substitutions s
        where s.assignment_id = target and s.substitute_supervisor_id = auth.uid()
          and s.revoked_at is null and s.effective_from <= now()
          and (s.effective_until is null or s.effective_until > now())
      )
  )
$$;
revoke all on function private.supervisor_present(uuid) from public, anon, authenticated;

create function private.supervisor_options()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin', false, 'organization_id', private.actor_org(), 'staff', '[]'::jsonb,
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'pin_configured', x.pin_configured,
        'attendance_confirmed', x.attendance_confirmed
      ) order by x.title, x.id)
      from (
        select e.id, e.title, length(coalesce(e.pin_hash, '')) > 0 as pin_configured,
          bool_or(private.supervisor_present(a.id)) as attendance_confirmed
        from public.supervisor_assignments a join public.exams e on e.id = a.exam_id
        where a.organization_id = private.actor_org()
          and private.effective_supervisor(a.id) = auth.uid()
        group by e.id
      ) x
    ), '[]'::jsonb)
  )
$$;
create function public.supervisor_options()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.supervisor_options()
$$;
revoke all on function private.supervisor_options(), public.supervisor_options() from public, anon, authenticated;
grant execute on function private.supervisor_options(), public.supervisor_options() to authenticated;

-- An assigned teacher's cards follow the same guard as a supervisor. Academic
-- card access for teachers without a supervisory assignment remains available.
create function private.card_student(eid uuid, sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_student(eid, sid, false) and (
    private.is_admin() or private.ops_student(eid, sid, true) or (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
      and not exists (
        select 1 from public.supervisor_assignments a
        where a.exam_id = eid and a.organization_id = private.actor_org() and a.active
          and (a.original_supervisor_id = auth.uid() or private.effective_supervisor(a.id) = auth.uid())
      )
    )
  )
$$;
revoke all on function private.card_student(uuid, uuid) from public, anon, authenticated;

create function private.can_view_supervised_attempt(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exam_attempts ea
    where ea.id = target and ea.organization_id = private.actor_org()
      and (private.is_admin() or (
        private.ops_student(ea.exam_id, ea.student_id, false) and exists (
          select 1 from public.exam_room_students r
          join public.supervisor_assignments a on a.exam_id = r.exam_id and a.room_id = r.room_id
          where r.exam_id = ea.exam_id and r.student_id = ea.student_id
            and private.effective_supervisor(a.id) = auth.uid()
        )
      ))
  )
$$;
revoke all on function private.can_view_supervised_attempt(uuid) from public, anon, authenticated;

do $$
declare
  patch record;
  definition text;
begin
  for patch in select * from (values
    ('private.ops_student(uuid,uuid,boolean)',
      'private.effective_supervisor(a.id)=auth.uid()',
      'private.effective_supervisor(a.id)=auth.uid() and (not writing or private.supervisor_present(a.id))'),
    ('private.ops_command(jsonb)',
      'where not private.ops_student(eid,x::uuid,false)) then raise exception ''AUTH: Kartu',
      'where not private.card_student(eid,x::uuid)) then raise exception ''AUTH: Kartu'),
    ('private.ops_command(jsonb)',
      'private.ops_student(e.id,p.id,false))) or (input->>''scope''=''exam'' and private.ops_student(eid,p.id,false))',
      'private.ops_student(e.id,p.id,true))) or (input->>''scope''=''exam'' and private.ops_student(eid,p.id,true))'),
    ('private.ops_command(jsonb)',
      'private.ops_student(eid,x::uuid,false)) then raise exception ''AUTH: Penerima',
      'private.ops_student(eid,x::uuid,true)) then raise exception ''AUTH: Penerima'),
    ('private.ops_command(jsonb)',
      'jsonb_array_elements_text(input->''student_ids'')) and private.ops_student(eid,p.id,false)',
      'jsonb_array_elements_text(input->''student_ids'')) and private.ops_student(eid,p.id,true)'),
    ('private.ops_command(jsonb)',
      'if op=''history'' then if not private.can_review_attempt(target)',
      'if op=''history'' then if not private.can_view_supervised_attempt(target)'),
    ('private.ops_command(jsonb)',
      '''can_act'',private.ops_student(eid,p.id,true)',
      '''can_view_history'',private.can_view_supervised_attempt(ea.id),''can_act'',private.ops_student(eid,p.id,true)'),
    ('private.ops_command(jsonb)',
      '''open_integrity'',case when private.can_review_attempt(ea.id)',
      '''open_integrity'',case when private.can_view_supervised_attempt(ea.id)'),
    ('private.review_attempt(jsonb)',
      'where private.can_review_attempt(ea.id)',
      'where private.can_view_supervised_attempt(ea.id)'),
    ('private.review_attempt(jsonb)',
      'if not private.can_review_attempt(target) then',
      'if not (case when input->>''action''=''events'' then private.can_view_supervised_attempt(target) else private.can_review_attempt(target) end) then'),
    ('private.integrity_command(jsonb)',
      'if private.actor_org() is null or not private.can_review_attempt(target) then',
      'if private.actor_org() is null or not (case when op=''history'' then private.can_view_supervised_attempt(target) else private.can_review_attempt(target) end) then'),
    ('private.card_access(uuid)',
      'private.ops_student(j.exam_id,u,false)',
      'private.card_student(j.exam_id,u)')
  ) as p(signature, anchor, replacement)
  loop
    definition := pg_get_functiondef(patch.signature::regprocedure);
    if strpos(definition, patch.anchor) = 0 then
      raise exception 'Attendance migration anchor missing for %', patch.signature;
    end if;
    execute replace(definition, patch.anchor, patch.replacement);
  end loop;
end;
$$;
