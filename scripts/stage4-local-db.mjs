import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
export async function stagingDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema extensions;create schema realtime;create table realtime.messages(id int,topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;create extension pgcrypto with schema extensions;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;grant usage on schema auth,storage,extensions to authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb default '{}',owner_id text,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:greatest(0,array_length(string_to_array(name,'/'),1)-1)]$$;grant execute on function storage.foldername(text) to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
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
