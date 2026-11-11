alter table public.profiles drop constraint profiles_role_check,
  add constraint profiles_role_check check (role in ('admin', 'teacher', 'supervisor', 'student', 'committee'));

-- Keep the existing import preview and the identity gateway's role validation aligned.
do $$
declare
  definition text := pg_get_functiondef('private.workflow_command(jsonb)'::regprocedure);
  old_roles text := $roles$('admin','teacher','supervisor','student')$roles$;
begin
  if strpos(definition, old_roles) = 0 then
    raise exception 'Import role validation has changed';
  end if;
  execute replace(definition, old_roles, $roles$('admin','teacher','supervisor','student','committee')$roles$);
end;
$$;

create table private.exam_committee_duties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  duty_date date not null,
  profile_id uuid not null,
  replaces_id uuid unique references private.exam_committee_duties(id) deferrable initially deferred,
  replaced_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  foreign key (organization_id, profile_id) references public.profiles(organization_id, id)
);
create unique index exam_committee_active_duty
  on private.exam_committee_duties (organization_id, duty_date, profile_id)
  where replaced_at is null;

create table private.supervisor_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null references public.supervisor_assignments(id),
  substitution_id uuid references public.supervisor_substitutions(id),
  profile_id uuid not null,
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, profile_id) references public.profiles(organization_id, id),
  unique nulls not distinct (assignment_id, substitution_id)
);
alter table private.exam_committee_duties enable row level security;
alter table private.supervisor_attendance enable row level security;
revoke all on private.exam_committee_duties, private.supervisor_attendance from public, anon, authenticated;

-- A valid replacement can supervise even if the original account has been deactivated.
create or replace function private.effective_supervisor(target uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(replacement.id, original.id)
  from public.supervisor_assignments a
  left join public.profiles original on original.id = a.original_supervisor_id
    and original.active and original.role in ('teacher', 'supervisor')
  left join public.supervisor_substitutions sub on sub.assignment_id = a.id
    and sub.revoked_at is null and sub.effective_from <= now()
    and (sub.effective_until is null or sub.effective_until > now())
  left join public.profiles replacement on replacement.id = sub.substitute_supervisor_id
    and replacement.active and replacement.role in ('teacher', 'supervisor')
  where a.id = target and a.active
    and (a.session_id is null or exists (
      select 1 from public.exam_sessions s
      where s.id = a.session_id and s.starts_at <= now() and s.ends_at > now()
    ))
$$;

create function private.committee_schedule(org uuid, day_start timestamptz, day_end timestamptz, as_of timestamptz)
returns table (
  id uuid, exam text, room text, session text, starts_at timestamptz, ends_at timestamptz,
  original_id uuid, original_name text, supervisor_id uuid, supervisor_name text,
  substitution_id uuid, confirmed_at timestamptz, original_confirmed_at timestamptz, can_replace boolean
)
language sql stable set search_path = '' as $$
  select a.id, e.title, r.name, s.name, coalesce(s.starts_at, e.starts_at),
    coalesce(s.ends_at, e.ends_at), original.id, original.full_name,
    coalesce(replacement.id, original.id), coalesce(replacement.full_name, original.full_name),
    replacement.substitution_id, attendance.confirmed_at, original_attendance.confirmed_at,
    coalesce(s.ends_at, e.ends_at) > as_of
  from public.supervisor_assignments a
  join public.exams e on e.id = a.exam_id
  join public.exam_rooms r on r.id = a.room_id
  join public.profiles original on original.id = a.original_supervisor_id
  left join public.exam_sessions s on s.id = a.session_id
  left join lateral (
    select sub.id as substitution_id, p.id, p.full_name
    from public.supervisor_substitutions sub
    join public.profiles p on p.id = sub.substitute_supervisor_id and p.active
    where sub.assignment_id = a.id and sub.revoked_at is null
      and sub.effective_from < coalesce(s.ends_at, e.ends_at)
      and sub.effective_from <= greatest(as_of, coalesce(s.starts_at, e.starts_at))
      and (sub.effective_until is null or sub.effective_until >
        greatest(coalesce(s.starts_at, e.starts_at), least(as_of, coalesce(s.ends_at, e.ends_at) - interval '1 microsecond')))
  ) replacement on true
  left join private.supervisor_attendance attendance on attendance.assignment_id = a.id
    and attendance.substitution_id is not distinct from replacement.substitution_id
  left join private.supervisor_attendance original_attendance on original_attendance.assignment_id = a.id
    and original_attendance.substitution_id is null
  where a.organization_id = org and a.active
    and coalesce(s.starts_at, e.starts_at) >= day_start
    and coalesce(s.starts_at, e.starts_at) < day_end
$$;

create function private.committee_command(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.actor_org();
  uid uuid := auth.uid();
  op text := input->>'action';
  is_admin boolean := private.is_admin();
  zone text;
  today date;
  selected_date date;
  day_start timestamptz;
  day_end timestamptz;
  target uuid := (input->>'id')::uuid;
  candidate uuid := (input->>'profile_id')::uuid;
  duty private.exam_committee_duties;
  schedule record;
  can_operate boolean := false;
  changed_at timestamptz;
begin
  if org is null or not exists (
    select 1 from public.profiles p where p.id = uid and p.role in ('admin', 'teacher', 'committee')
  ) then
    raise exception 'AUTH: Akses Panitia Ujian diperlukan.';
  end if;

  select o.timezone into zone from public.organizations o where o.id = org;
  today := (clock_timestamp() at time zone zone)::date;
  selected_date := case when is_admin then coalesce((input->>'date')::date, today) else today end;
  day_start := selected_date::timestamp at time zone zone;
  day_end := (selected_date + 1)::timestamp at time zone zone;

  if not is_admin then
    select d.* into duty from private.exam_committee_duties d
    where d.organization_id = org and d.duty_date = today and d.profile_id = uid
      and d.replaced_at is null
    for share;
    can_operate := duty.confirmed_at is not null;
  end if;

  if op = 'list' then
    return jsonb_build_object(
      'date', selected_date, 'today', today, 'timezone', zone, 'expires_at', day_end,
      'status', case when is_admin or can_operate then 'confirmed'
                     when duty.id is not null then 'pending' else 'unassigned' end,
      'duties', case when is_admin then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'profile_id', d.profile_id, 'name', p.full_name,
          'confirmed_at', d.confirmed_at, 'replaced_at', d.replaced_at, 'replaces', old.full_name
        ) order by d.replaced_at nulls first, p.full_name, d.id)
        from private.exam_committee_duties d
        join public.profiles p on p.id = d.profile_id
        left join private.exam_committee_duties previous on previous.id = d.replaces_id
        left join public.profiles old on old.id = previous.profile_id
        where d.organization_id = org and d.duty_date = selected_date
      ), '[]') else '[]'::jsonb end,
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name, p.id)
        from public.profiles p where is_admin and p.organization_id = org and p.active
          and p.role in ('teacher', 'committee')
      ), '[]'),
      'supervisors', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name, p.id)
        from public.profiles p where can_operate and p.organization_id = org and p.active
          and p.role in ('teacher', 'supervisor')
      ), '[]'),
      'schedule', case when can_operate then coalesce((
        select jsonb_agg(to_jsonb(s) order by s.starts_at, s.room, s.id)
        from private.committee_schedule(org, day_start, day_end, statement_timestamp()) s
      ), '[]') else '[]'::jsonb end
    );
  end if;

  if op in ('assign', 'replace_committee', 'confirm_committee') then
    if not is_admin then raise exception 'AUTH: Hanya Admin mengelola tugas panitia.'; end if;
    if op <> 'assign' then
      select d.* into duty from private.exam_committee_duties d
      where d.id = target and d.organization_id = org and d.replaced_at is null
      for update;
      if not found then raise exception 'CONFLICT: Tugas panitia sudah berubah. Muat ulang daftar.'; end if;
      selected_date := duty.duty_date;
    end if;

    if op = 'confirm_committee' then
      if selected_date <> today then raise exception 'Kehadiran panitia hanya dapat dikonfirmasi pada hari tugas.'; end if;
      candidate := duty.profile_id;
    elsif selected_date < today or candidate = duty.profile_id then
      raise exception 'Tanggal atau panitia pengganti tidak valid.';
    end if;

    if not exists (
      select 1 from public.profiles p where p.id = candidate and p.organization_id = org
        and p.active and p.role in ('teacher', 'committee')
    ) then raise exception 'Pilih Guru atau Panitia Ujian yang aktif.'; end if;

    if op = 'confirm_committee' then
      update private.exam_committee_duties set confirmed_at = clock_timestamp(), confirmed_by = uid
      where id = target and confirmed_at is null;
      if not found then return '{"saved":true}'::jsonb; end if;
    else
      if op = 'replace_committee' then
        update private.exam_committee_duties set replaced_at = clock_timestamp() where id = target;
      end if;
      insert into private.exam_committee_duties (organization_id, duty_date, profile_id, replaces_id)
      values (org, selected_date, candidate, duty.id) returning id into target;
    end if;
  elsif op in ('confirm_supervisor', 'replace_supervisor') then
    if not can_operate then raise exception 'AUTH: Admin harus mengonfirmasi kehadiran panitia hari ini.'; end if;

    -- Use the assignment lock shared by the existing room and substitute operations.
    perform 1 from public.supervisor_assignments a
    where a.id = target and a.organization_id = org and a.active for update;
    if not found then raise exception 'CONFLICT: Penugasan pengawas sudah berubah.'; end if;
    perform 1 from public.exam_sessions s join public.supervisor_assignments a on a.session_id = s.id
    where a.id = target for share of s;
    perform 1 from public.exams e join public.supervisor_assignments a on a.exam_id = e.id
    where a.id = target for share of e;
    changed_at := clock_timestamp();
    if (changed_at at time zone zone)::date <> today then
      raise exception 'AUTH: Hari tugas telah berakhir.';
    end if;

    select * into schedule from private.committee_schedule(org, day_start, day_end, changed_at) s where s.id = target;
    if not found then raise exception 'AUTH: Jadwal pengawas berada di luar hari tugas.'; end if;
    if schedule.substitution_id is distinct from (input->>'substitution_id')::uuid then
      raise exception 'CONFLICT: Pengawas sudah berubah. Muat ulang daftar.';
    end if;

    if op = 'confirm_supervisor' then
      if not exists (select 1 from public.profiles p where p.id = schedule.supervisor_id and p.active) then
        raise exception 'Akun pengawas tidak aktif. Pilih pengganti.';
      end if;
      insert into private.supervisor_attendance (organization_id, assignment_id, substitution_id, profile_id, confirmed_by)
      values (org, target, schedule.substitution_id, schedule.supervisor_id, uid)
      on conflict (assignment_id, substitution_id) do nothing;
      if not found then return '{"saved":true}'::jsonb; end if;
    else
      if changed_at >= schedule.ends_at then raise exception 'Sesi pengawasan sudah berakhir.'; end if;
      if candidate = schedule.original_id or candidate = schedule.supervisor_id or not exists (
        select 1 from public.profiles p where p.id = candidate and p.organization_id = org
          and p.active and p.role in ('teacher', 'supervisor')
      ) then raise exception 'Pilih pengawas pengganti yang aktif dan berbeda.'; end if;
      update public.supervisor_substitutions set revoked_at = changed_at
      where assignment_id = target and revoked_at is null;
      insert into public.supervisor_substitutions (assignment_id, substitute_supervisor_id, effective_from, effective_until)
      values (target, candidate, changed_at, schedule.ends_at);
    end if;
  else
    raise exception 'Tindakan panitia tidak valid.';
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, target_type, target_id)
  values (org, uid, 'COMMITTEE_' || upper(op),
          case when op in ('confirm_supervisor', 'replace_supervisor') then 'supervisor_assignment' else 'committee_duty' end,
          target::text);
  return '{"saved":true}'::jsonb;
end;
$$;

create function public.committee_command(input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.committee_command(input)
$$;
revoke all on function private.committee_schedule(uuid, timestamptz, timestamptz, timestamptz),
  private.committee_command(jsonb), public.committee_command(jsonb) from public, anon, authenticated;
grant execute on function private.committee_command(jsonb), public.committee_command(jsonb) to authenticated;
