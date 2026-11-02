-- Stable audit pagination when multiple events share a timestamp.
-- Preserve the existing function body, tenant guards, privileges and all other actions.
do $audit$
declare
  definition text := pg_get_functiondef('private.system_command(jsonb)'::regprocedure);
  old_page text := 'from(select * from f order by created_at desc limit 50 offset';
  new_page text := 'from(select * from f order by created_at desc,id desc limit 50 offset';
  old_aggregate text := 'to_jsonb(v) order by v.created_at desc)';
  new_aggregate text := 'to_jsonb(v) order by v.created_at desc,v.id desc)';
begin
  perform set_config('lock_timeout','5s',true);
  if position(new_page in definition)>0 and position(new_aggregate in definition)>0 then return;end if;
  if (length(definition)-length(replace(definition,old_page,'')))/length(old_page)<>1
     or (length(definition)-length(replace(definition,old_aggregate,'')))/length(old_aggregate)<>1 then
    raise exception 'Audit ordering patch: unexpected function definition';
  end if;
  execute replace(replace(definition,old_page,new_page),old_aggregate,new_aggregate);
end
$audit$;
