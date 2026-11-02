-- Preserve media authorization/reference checks and the existing JSON/page contract.
-- Search only persisted ID/path; original filenames were never stored for legacy local uploads.
do $migration$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('private.media_command(jsonb)'::regprocedure);
 anchor:=$old$(coalesce(input->>'mime','')='' or m.mime_type like (input->>'mime')||'%')) select$old$;
 replacement:=$new$(coalesce(input->>'mime','')='' or m.mime_type like (input->>'mime')||'%') and position(lower(left(coalesce(input->>'search',''),100)) in lower(m.id::text||' '||m.object_path))>0) select$new$;
 if position(anchor in definition)=0 then raise exception 'Media search anchor changed; review migration';end if;
 definition:=replace(definition,anchor,replacement);
 -- The existing table alias m conflicts with the PL/pgSQL media row variable.
 definition:=replace(definition,'declare target uuid:=',E'#variable_conflict use_column\ndeclare target uuid:=');
 anchor:=$old$if input->>'action'='cleanup_done' then update$old$;
 replacement:=$new$if input->>'action'='cleanup_done' then if exists(select 1 from storage.objects so where so.bucket_id='exam-media' and so.name=result->>'path') then raise exception 'Berkas Storage belum terhapus; pembersihan tetap tertunda';end if;update$new$;
 if position(anchor in definition)=0 then raise exception 'Media cleanup anchor changed; review migration';end if;
 definition:=replace(definition,anchor,replacement);
 definition:=replace(definition,'jsonb_agg(to_jsonb(v) order by v.created_at desc)','jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id desc)');
 definition:=replace(definition,'select * from filtered order by created_at desc limit 50','select * from filtered order by created_at desc,id desc limit 50');
 execute definition;
end $migration$;

-- Admin retains visibility of a cleanup target after its media row has been removed.
-- Reuse the existing scoped helper, including its backup/reference protections.
alter policy media_own_select on storage.objects using(
 bucket_id='exam-media' and private.actor_org() is not null and (
  (storage.foldername(name))[1]=auth.uid()::text
  or (private.is_admin() and exists(select 1 from public.media_assets m where m.object_path=name and m.organization_id=private.actor_org()))
  or (private.is_admin() and private.source_delete_allowed(name))
 )
);
