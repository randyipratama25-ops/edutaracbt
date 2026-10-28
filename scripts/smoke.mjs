import { spawn } from "node:child_process";
const base = "http://127.0.0.1:3120";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3120",
  ],
  { stdio: "ignore" },
);
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Server did not start.");
  const cases = [
    ["home", "/", {}, 200],
    ["login", "/login", {}, 200],
    ["dashboard without session", "/dashboard", { redirect: "manual" }, 307],
    ["users anonymous", "/api/admin/users", {}, 403],
    [
      "CSRF login",
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      403,
    ],
    [
      "invalid credentials",
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({
          username: "nonexistent_smoke_user",
          password: "invalid-password",
          context: "staff",
        }),
      },
      401,
    ],
    [
      "media anonymous",
      "/api/media",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ operation: "upload", name: "test.png" }),
      },
      401,
    ],
  ];
  for (const [name, path, opts, expected] of cases) {
    const r = await fetch(base + path, opts);
    if (r.status !== expected)
      throw Error(
        `${name}: expected ${expected}, got ${r.status}; ${await r.text()}`,
      );
    console.log(`${name}: ${r.status} PASS`);
  }
} finally {
  server.kill("SIGTERM");
}
