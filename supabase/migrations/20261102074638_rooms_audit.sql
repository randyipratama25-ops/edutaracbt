-- Preserve operational authorization/idempotency/audit; reject an update with no matching session.
do $migration$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('private.ops_command(jsonb)'::regprocedure);
 anchor:=$old$else update public.exam_sessions set name=input->>'name',starts_at=(input->>'starts_at')::timestamptz,ends_at=(input->>'ends_at')::timestamptz where id=target and organization_id=org and exam_id=eid;end if;result:=jsonb_build_object('id',target);$old$;
 replacement:=$new$else update public.exam_sessions set name=input->>'name',starts_at=(input->>'starts_at')::timestamptz,ends_at=(input->>'ends_at')::timestamptz where id=target and organization_id=org and exam_id=eid;if not found then raise exception 'CONFLICT: Sesi tidak tersedia; muat ulang daftar';end if;end if;result:=jsonb_build_object('id',target);$new$;
 if position(anchor in definition)=0 then raise exception 'Session update anchor changed';end if;
 execute replace(definition,anchor,replacement);
end
$migration$;
