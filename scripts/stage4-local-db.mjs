import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
export async function stagingDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema extensions;create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;create function vault.create_secret(value text,name text) returns uuid language sql as $$insert into vault.secrets(secret,name) values(value,name) returning id$$;create function vault.update_secret(target uuid,value text) returns void language sql as $$update vault.secrets set secret=value where id=target$$;create schema cron;create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(jobname,schedule,command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;create schema net;create table net.requests(id bigint generated always as identity,body jsonb);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$insert into net.requests(body) values(body) returning id$$;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text,name text,statements text[]);create schema realtime;create table realtime.messages(id int,topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;create extension pgcrypto with schema extensions;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;grant usage on schema auth,storage,extensions to authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb default '{}',owner_id text,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:greatest(0,array_length(string_to_array(name,'/'),1)-1)]$$;grant execute on function storage.foldername(text) to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync("supabase/migrations/" + file, "utf8");
    await db.exec(
      sql.replace(
        /-- bootstrap_extensions:[\s\S]*?-- end_bootstrap_extensions/,
        "",
      ),
    );
    await db.query(
      "insert into supabase_migrations.schema_migrations values($1,$2,$3)",
      [file.split("_")[0], file.slice(15, -4), [sql]],
    );
  }
  return db;
}
if (process.argv[1]?.endsWith("stage4-local-db.mjs")) {
  const db = await stagingDatabase();
  try {
    if (process.argv[2]) await db.exec(readFileSync(process.argv[2], "utf8"));
    console.log(
      "PASS complete Stage 4 schema in isolated PGlite/Postgres with auth/storage test facades",
    );
  } finally {
    await db.close();
  }
}
