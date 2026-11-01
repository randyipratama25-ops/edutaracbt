-- Serialize the version check with configuration changes after a provider test.
do $patch$ declare d text;begin
 d:=pg_get_functiondef('private.ai_worker(jsonb)'::regprocedure);
 if position($old$select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider';$old$ in d)=0 then raise exception 'AI test configuration lock anchor changed';end if;
 execute replace(d,$old$select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider';$old$,$new$select * into c from private.ai_provider_configs where organization_id=org and provider=input->>'provider' for update;$new$);
end $patch$;
