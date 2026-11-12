-- Qualify the upload path: card_jobs.path is empty until the worker finishes.
create or replace function private.card_object(path text, writing boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.card_jobs j
    where j.id::text = split_part($1, '/', 2)
      and j.requested_by::text = split_part($1, '/', 1)
      and private.card_access(j.id)
      and (not $2 or (
        j.status = 'running'
        and j.lease::text = split_part($1, '/', 3)
        and j.lease_until > clock_timestamp()
      ))
  )
$$;

-- The PL/pgSQL routine uses column precedence, so input in an UPDATE
-- expression must explicitly refer to the RPC argument.
do $$
declare
  definition text := pg_get_functiondef('private.card_command(jsonb)'::regprocedure);
  change record;
begin
  for change in select * from (values
    ('least(95,(input->>''progress'')::int)', 'least(95,(card_command.input->>''progress'')::int)'),
    ('error=left(input->>''message'',500)', 'error=left(card_command.input->>''message'',500)'),
    ('progress=100,path=input->>''path''', 'progress=100,path=card_command.input->>''path''')
  ) as edits(anchor, replacement)
  loop
    if strpos(definition, change.anchor) = 0 then
      raise exception 'Missing card command anchor: %', change.anchor;
    end if;
    definition := replace(definition, change.anchor, change.replacement);
  end loop;
  execute definition;
end
$$;
