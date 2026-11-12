-- Reserve every newly assigned student password, including passwords from failed
-- provisioning, so the same password is never deliberately reissued.
-- The digest is not a password authenticator; Auth stores its own salted hash.
create extension if not exists pgcrypto with schema extensions;

create table private.student_password_registry (
  password_sha256 bytea primary key,
  reserved_at timestamptz not null default now()
);
alter table private.student_password_registry enable row level security;
revoke all on private.student_password_registry from public, anon, authenticated;

-- Service-role-only function. Compare candidate against existing (legacy)
-- Auth password hashes as well as our new registry. No plaintext is persisted.
-- Unsupported hash formats fail closed rather than silently skipping a match.
create or replace function public.reserve_student_password(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  if candidate is null
     or candidate !~ '^[A-HJ-NP-RT-Z2346789]{11}[!@#$*?]$'
     or substring(candidate from 1 for 11) !~ '[A-HJ-NP-RT-Z]'
     or substring(candidate from 1 for 11) !~ '[2346789]' then
    raise exception 'Student password policy rejected' using errcode = '22023';
  end if;

  if exists (
    select 1 from auth.users u
    where nullif(u.encrypted_password, '') is not null
      and u.encrypted_password = extensions.crypt(candidate, u.encrypted_password)
  ) then
    return false;
  end if;

  insert into private.student_password_registry(password_sha256)
    values (extensions.digest(candidate, 'sha256'))
    on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
revoke all on function public.reserve_student_password(text) from public, anon, authenticated;
grant execute on function public.reserve_student_password(text) to service_role;
