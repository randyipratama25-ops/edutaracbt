import { spawn } from "node:child_process";
const base = "http://127.0.0.1:3126";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3126",
  ],
  { stdio: "ignore" },
);
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Server did not start");
  for (const [path, method, origin, status] of [
    ["/api/attempts", "GET", base, 403],
    ["/api/attempts", "POST", base, 403],
    ["/api/attempts", "POST", "https://invalid.example", 403],
    ["/api/attempts/canvas", "POST", base, 403],
    ["/api/attempts/canvas?id=invalid", "GET", base, 403],
    ["/api/attempts/media?id=invalid", "GET", base, 403],
    ["/api/attempts/latex", "POST", base, 403],
    ["/api/review", "GET", base, 403],
    ["/api/review", "POST", base, 403],
  ]) {
    const r = await fetch(base + path, {
      method,
      headers: { origin, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (r.status !== status)
      throw Error(`${method} ${path}: ${r.status}, expected ${status}`);
    console.log(
      `PASS ${method} ${path} blocks unauthorized/cross-origin request`,
    );
  }
  for (const path of ["/student", "/dashboard/monitor"]) {
    const r = await fetch(base + path, { redirect: "manual" });
    if (r.status !== 307 || !r.headers.get("location")?.endsWith("/login"))
      throw Error("Private page did not redirect");
    console.log("PASS " + path + " redirects unauthenticated visitor");
  }
} finally {
  server.kill();
}
