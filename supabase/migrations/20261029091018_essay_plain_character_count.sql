create function private.essay_plain(value text) returns text language plpgsql immutable set search_path='' as $function$
declare plain text;begin
plain:=regexp_replace(coalesce(value,''),'<[^>]*>','','g');
plain:=regexp_replace(plain,'&[A-Za-z#0-9]+;',' ','g');
plain:=regexp_replace(plain,$rx$\$\$[^$]*\$\$|\$[^$]*\$$rx$,'','g');
plain:=regexp_replace(plain,'[^[:alnum:][:space:]]','','g');return trim(plain);end $function$;
revoke all on function private.essay_plain(text) from public,anon,authenticated;
do $patch$ declare definition text;begin select pg_get_functiondef('private.answer_complete(jsonb,jsonb)'::regprocedure) into definition;execute replace(definition,$old$plain:=trim(regexp_replace(coalesce(answer->>'text',''),'<[^>]*>','','g'));$old$,$new$plain:=private.essay_plain(answer->>'text');$new$);end $patch$;
