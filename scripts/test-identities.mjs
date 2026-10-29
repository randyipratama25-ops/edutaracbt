// Owner-only reproducible pre-production smoke fixtures. Never run with real school data.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
if (process.env.EDUTARA_ALLOW_TEST_FIXTURES !== "1")
  throw Error(
    "Explicit test fixture opt-in required. Use an empty pre-production project.",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw Error("Owner server-only credentials required in environment.");
const client = createClient(url, key, { auth: { persistSession: false } });
const file = "/tmp/edutara-http-fixtures.json",
  resources = "/tmp/edutara-http-resources.json";
const check = (error) => {
  if (error) throw Error("Test fixture database operation failed.");
};
if (process.argv[2] === "seed") {
  const { count, error } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true });
  check(error);
  if (count) throw Error("Refusing to seed a project with existing profiles.");
  const users = [];
  for (const role of ["admin", "teacher", "supervisor", "student"]) {
    const row = {
      id: randomUUID(),
      role,
      username: "http_fixture_" + role,
      email: "http-" + randomUUID() + "@example.invalid",
      password: randomBytes(32).toString("base64url"),
    };
    const { data, error } = await client.auth.admin.createUser({
      email: row.email,
      password: row.password,
      email_confirm: true,
    });
    check(error);
    row.id = data.user.id;
    const { error: profileError } = await client
      .from("profiles")
      .insert({
        id: row.id,
        organization_id: "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
        username: row.username,
        full_name: "HTTP synthetic test",
        role,
      });
    check(profileError);
    users.push(row);
    writeFileSync(file, JSON.stringify(users), { mode: 0o600 });
  }
  console.log(
    "Four synthetic identities created; private fixture file written. No email sent.",
  );
} else if (process.argv[2] === "cleanup") {
  if (!existsSync(file)) throw Error("No local fixture manifest.");
  const users = JSON.parse(readFileSync(file, "utf8"));
  if (
    !users.every(
      (x) =>
        x.email.endsWith("@example.invalid") &&
        x.username.startsWith("http_fixture_"),
    )
  )
    throw Error("Refusing non-fixture identity cleanup.");
  const ids = users.map((x) => x.id);
  check(
    (await client.from("teacher_assignments").delete().in("teacher_id", ids))
      .error,
  );
  check(
    (await client.from("student_enrollments").delete().in("student_id", ids))
      .error,
  );
  if (existsSync(resources)) {
    const r = JSON.parse(readFileSync(resources, "utf8"));
    if (r.class_id)
      check((await client.from("classes").delete().eq("id", r.class_id)).error);
    if (r.subject_id)
      check(
        (await client.from("subjects").delete().eq("id", r.subject_id)).error,
      );
    unlinkSync(resources);
  }
  check((await client.from("profiles").delete().in("id", ids)).error);
  for (const u of users)
    check((await client.auth.admin.deleteUser(u.id)).error);
  check((await client.from("audit_logs").delete().in("actor_id", ids)).error);
  unlinkSync(file);
  console.log("Synthetic identities removed.");
} else throw Error("Expected seed or cleanup.");
