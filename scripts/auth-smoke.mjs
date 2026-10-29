// Temporary pre-production identities are provisioned externally for this run, never stored in git.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const users = JSON.parse(
  readFileSync("/tmp/edutara-http-fixtures.json", "utf8"),
);
const base = "http://127.0.0.1:3121";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3121",
  ],
  { stdio: "ignore" },
);
const results = [];
const jars = {};
async function req(role, path, method = "GET", data, expected = 200) {
  const jar = jars[role] || {};
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    },
    body: data ? JSON.stringify(data) : undefined,
    redirect: "manual",
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const i = pair.indexOf("=");
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  jars[role] = jar;
  let json;
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  if (response.status !== expected)
    throw Error(
      `${role} ${path}: expected ${expected}, received ${response.status}; ${JSON.stringify(json)}`,
    );
  return { json, response };
}
const log = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Server did not start");
  for (const role of ["admin", "teacher"]) {
    const u = users.find((x) => x.role === role);
    const { response } = await req(role, "/api/auth/login", "POST", {
      username: u.username,
      password: u.password,
      context: "staff",
    });
    if (!response.headers.getSetCookie().some((c) => c.includes("HttpOnly")))
      throw Error("Missing HttpOnly cookie");
    log(role + " username/password login and HttpOnly session");
  }
  const c = await req("admin", "/api/admin/master", "POST", {
    kind: "classes",
    name: "HTTP synthetic class",
  });
  const s = await req("admin", "/api/admin/master", "POST", {
    kind: "subjects",
    name: "HTTP synthetic subject",
  });
  writeFileSync(
    "/tmp/edutara-http-resources.json",
    JSON.stringify({ class_id: c.json.data.id, subject_id: s.json.data.id }),
    { mode: 0o600 },
  );
  log("admin creates class and subject");
  await req("admin", "/api/admin/master", "POST", {
    kind: "assignment",
    user_id: users.find((x) => x.role === "teacher").id,
    class_id: c.json.data.id,
    subject_id: s.json.data.id,
  });
  await req("admin", "/api/admin/master", "POST", {
    kind: "enrollment",
    user_id: users.find((x) => x.role === "student").id,
    class_id: c.json.data.id,
  });
  log("exact teacher assignment and student enrollment");
  await req(
    "teacher",
    "/api/admin/master",
    "POST",
    { kind: "classes", name: "Forbidden class" },
    403,
  );
  log("teacher cannot modify master");
  const list = await req("teacher", "/api/admin/users");
  if (
    list.json.data.rows.length !== 1 ||
    list.json.data.rows[0].role !== "student" ||
    JSON.stringify(list.json).includes("password")
  )
    throw Error("User DTO scope failure");
  log("teacher sees assigned student only, no passwords");
  const target = users.find((x) => x.role === "student");
  await req("teacher", "/api/admin/users", "POST", {
    operation: "update",
    id: target.id,
    full_name: "Updated synthetic student",
  });
  await req(
    "teacher",
    "/api/admin/users",
    "POST",
    { operation: "archive", id: target.id },
    403,
  );
  log("teacher name edit allowed; archive denied");
  const admin = users.find((x) => x.role === "admin");
  await req(
    "admin",
    "/api/admin/users",
    "POST",
    { operation: "update", id: admin.id, active: false },
    422,
  );
  log("last administrator protection");
  const sup = users.find((x) => x.role === "supervisor");
  await req(
    "supervisor",
    "/api/auth/login",
    "POST",
    { username: sup.username, password: sup.password, context: "supervisor" },
    403,
  );
  log("unassigned supervisor denied");
  await req(
    "student",
    "/api/auth/login",
    "POST",
    {
      username: target.username,
      password: target.password,
      context: "student",
      pin: "12345",
    },
    409,
  );
  log("student cannot start unfinished exam service");
  await req("admin", "/api/admin/users", "POST", {
    operation: "update",
    id: users.find((x) => x.role === "teacher").id,
    active: false,
  });
  await req("teacher", "/api/admin/users", "GET", undefined, 403);
  log("deactivation invalidates existing session access");
  await req("admin", "/api/auth/logout", "POST");
  await req("admin", "/api/admin/users", "GET", undefined, 403);
  log("logout revokes access");
} finally {
  server.kill("SIGTERM");
  writeFileSync(
    "/tmp/edutara-auth-smoke-report.json",
    JSON.stringify(results, null, 2),
  );
}
