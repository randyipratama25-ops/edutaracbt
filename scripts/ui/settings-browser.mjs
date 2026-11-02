import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  createWriteStream,
} from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axe from "axe-core";
const route = `app/settings-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-settings-${Date.now()}`,
  originals = Object.fromEntries(
    ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
      p,
      existsSync(p) ? readFileSync(p, "utf8") : null,
    ]),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, server, page;
try {
  mkdirSync(route);
  writeFileSync(
    route + "/page.tsx",
    `import {SystemPanel} from '../../components/system/panel';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Pengaturan aplikasi</h1><SystemPanel mode={p.mode==='jobs'?'jobs':p.mode==='audit'?'audit':'settings'}/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/settings-browser-dev.log");
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        EDUTARA_UI_TEST_DIST: dist,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  for (let n = 0; n < 120; n++) {
    try {
      if (
        (
          await fetch(origin + "/api/health", {
            signal: AbortSignal.timeout(1500),
          })
        ).ok
      )
        break;
    } catch {}
    if (n === 119) throw Error("Startup");
    await sleep(500);
  }
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.EDUTARA_TEST_CHROME || (await chromium.executablePath()),
    headless: true,
  });
  page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  const id = "10000000-0000-4000-8000-000000000001";
  let dto = {
    name: "EDUTARA CBT",
    subtitle: "Madrasah " + "panjang".repeat(22),
    timezone: "Asia/Jakarta",
    login_logo_id: null,
    login_background_id: null,
    violation_limit: 3,
    canvas_enabled: true,
    results_enabled: true,
    automation_enabled: false,
    reminders_enabled: false,
    retention_days: 180,
    smtp_sender: "",
    reminder_template:
      "Halo {{nama}}, periode {{periode}}, kekurangan {{kekurangan}}. Buka {{tautan}}.",
    version: 1,
    secrets: {},
    scheduler: "Supabase Cron",
    secret_readback: false,
    worker_capabilities: { smtp: false, backup: true, retention: false },
  };
  let readMode = "ok",
    postMode = "ok",
    posts = [],
    heldPost = null,
    jobs = [];
  const respond = (r, status, data) =>
    r
      .respond({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? { success: true, data }
            : {
                success: false,
                error: {
                  message:
                    status === 409
                      ? "CONFLICT: Pengaturan berubah"
                      : "Layanan sementara gagal",
                },
              },
        ),
      })
      .catch(() => {});
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return r.continue();
    if (r.method() === "POST") {
      const input = JSON.parse(r.postData());
      posts.push(input);
      if (postMode === "hold") {
        heldPost = r;
        return;
      }
      if (postMode === "uncertain" || postMode === "conflict")
        return respond(r, postMode === "conflict" ? 409 : 503, null);
      if (input.action === "save") {
        dto = { ...dto, ...input.settings, version: dto.version + 1 };
        return respond(r, 200, { saved: true });
      }
      if (input.action === "secret") {
        dto.secrets[input.key] = true;
        return respond(r, 200, { configured: true, readback: false });
      }
      if (input.action === "smtp_probe" || input.action === "backup")
        return respond(r, 200, { id, queued: true });
      return respond(r, 200, { cancelled: true });
    }
    if (u.searchParams.get("action") === "jobs") return respond(r, 200, jobs);
    if (u.searchParams.get("action") === "audit")
      return respond(r, 200, { rows: [], total: 0 });
    return respond(
      r,
      readMode === "error" ? 503 : 200,
      readMode === "malformed"
        ? { ...dto, secrets: { smtp_password: "must-not-render" } }
        : dto,
    );
  });
  const click = async (text, scope = "") => {
    await page.waitForFunction(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        const b =
          root &&
          [...root.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === text && !b.matches(":disabled"),
          );
        if (!b) return false;
        b.click();
        return true;
      },
      { timeout: 15000 },
      { text, scope },
    );
    await sleep(100);
  };
  const fill = async (label, value) =>
    page.evaluate(
      ({ label, value }) => {
        const root = document.querySelector("[role=dialog]") || document;
        const l = [...root.querySelectorAll("label")].find((x) =>
          x.textContent.trim().startsWith(label),
        );
        const el =
          l?.querySelector("input,select,textarea") ||
          (l?.htmlFor ? document.getElementById(l.htmlFor) : null);
        if (!el) throw Error(label);
        const proto =
          el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(
          new Event(el instanceof HTMLSelectElement ? "change" : "input", {
            bubbles: true,
          }),
        );
      },
      { label, value },
    );
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector(".settings-summary") &&
        !document.querySelector(".settings-controls")?.disabled,
    );
  const overflow = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "horizontal overflow",
    );
  const fits = async () =>
    assert(
      await page.$eval("[role=dialog]", (d) => {
        const r = d.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.top >= 0 &&
          r.bottom <= innerHeight + 1 &&
          d.scrollWidth <= d.clientWidth + 1
        );
      }),
      "dialog bounds",
    );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 844 });
    await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await ready();
    await overflow();
  }
  assert(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Simpan pengaturan",
        ).disabled,
    ),
  );
  await fill("Nama aplikasi", "Draf madrasah");
  await click("Muat ulang status");
  await page.waitForSelector("[role=dialog]");
  await fits();
  await click("Lanjutkan mengedit", "[role=dialog]");
  assert.equal(
    await page.$eval(".settings-grid input", (x) => x.value),
    "Draf madrasah",
  );
  await fill("Nilai kredensial baru", "synthetic-test-password");
  postMode = "hold";
  await click("Simpan kredensial baru");
  await page.waitForFunction(
    () => document.querySelector(".settings-controls").disabled,
  );
  await page.evaluate(() =>
    document
      .querySelector('form[aria-label="Kredensial rahasia"]')
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.equal(posts.length, 1);
  postMode = "ok";
  dto.secrets.smtp_password = true;
  await respond(heldPost, 200, { configured: true, readback: false });
  await ready();
  assert.equal(
    await page.$eval(".settings-grid input", (x) => x.value),
    "Draf madrasah",
  );
  assert.equal(await page.$eval("input[type=password]", (x) => x.value), "");
  await fill("Nilai kredensial baru", "another-test-password");
  await fill("Jenis kredensial", "ai_api_key");
  assert.equal(await page.$eval("input[type=password]", (x) => x.value), "");
  await fill("Jenis kredensial", "smtp_password");
  await fill("Zona waktu sekolah", "not/a/timezone");
  const before = posts.length;
  await click("Simpan pengaturan");
  assert.equal(posts.length, before);
  await fill("Zona waktu sekolah", "Asia/Makassar");
  await click("Simpan pengaturan");
  await ready();
  assert.equal(posts.at(-1).version, 1);
  assert.equal(posts.at(-1).settings.timezone, "Asia/Makassar");
  assert.equal(
    await page.$eval(".settings-grid input", (x) => x.value),
    "Draf madrasah",
  );
  await fill("Nama aplikasi", "Draf konflik");
  postMode = "conflict";
  await click("Simpan pengaturan");
  await page.waitForFunction(() => document.querySelector(".settings-notice"));
  assert.equal(
    await page.$eval(".settings-grid input", (x) => x.value),
    "Draf konflik",
  );
  postMode = "ok";
  await click("Muat ulang status");
  await click("Abaikan draf dan muat ulang", "[role=dialog]");
  await ready();
  await fill("Nama aplikasi", "Tersimpan gagal refresh");
  readMode = "error";
  await click("Simpan pengaturan");
  await page.waitForFunction(() =>
    document
      .querySelector(".settings-page")
      .innerText.includes("status terbaru belum"),
  );
  assert(await page.$eval(".settings-controls", (x) => x.disabled));
  readMode = "ok";
  await click("Muat ulang status");
  await click("Abaikan draf dan muat ulang", "[role=dialog]");
  await ready();
  dto.worker_capabilities = { smtp: false, backup: true, retention: false };
  dto.reminders_enabled = true;
  await click("Muat ulang status");
  await ready();
  const policy = "input[type=checkbox]";
  assert.equal(await page.$$eval(policy, (xs) => xs.at(-1).disabled), false);
  await page.$$eval(policy, (xs) => xs.at(-1).click());
  assert.equal(await page.$$eval(policy, (xs) => xs.at(-1).checked), false);
  await click("Simpan pengaturan");
  await ready();
  dto = {
    ...dto,
    smtp_sender: "test@example.invalid",
    secrets: { smtp_password: true },
    worker_capabilities: { smtp: true, backup: true, retention: true },
  };
  await click("Muat ulang status");
  await ready();
  await fill("Email pengirim", "changed@example.invalid");
  assert(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Jadwalkan uji koneksi SMTP",
        ).disabled,
    ),
  );
  await click("Muat ulang status");
  await click("Abaikan draf dan muat ulang", "[role=dialog]");
  await ready();
  postMode = "uncertain";
  await click("Jadwalkan uji koneksi SMTP");
  await page.waitForFunction(() => document.querySelector(".settings-notice"));
  const requestId = posts.at(-1).request_id;
  postMode = "ok";
  await click("Muat ulang status");
  await ready();
  await click("Jadwalkan uji koneksi SMTP");
  await ready();
  assert.equal(posts.at(-1).request_id, requestId);
  assert(
    await page.evaluate(() =>
      document.body.innerText.includes("belum berarti koneksi berhasil"),
    ),
  );
  await page.setViewport({ width: 390, height: 844 });
  await overflow();
  await page.screenshot({ path: "/tmp/settings-mobile.png", fullPage: true });
  for (const [width, height] of [
    [844, 390],
    [320, 320],
    [390, 844],
  ]) {
    await page.setViewport({ width, height });
    await fill("Nama aplikasi", "Draf orientasi");
    await click("Muat ulang status");
    await fits();
    await click("Lanjutkan mengedit", "[role=dialog]");
    await overflow();
  }
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await overflow();
  await click("Muat ulang status");
  await fits();
  await page.addScriptTag({ content: axe.source });
  let scan = await page.evaluate(() =>
    window.axe.run(document.querySelector("[role=dialog]"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await click("Abaikan draf dan muat ulang", "[role=dialog]");
  await ready();
  scan = await page.evaluate(() =>
    window.axe.run(document.querySelector(".settings-page"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  readMode = "malformed";
  await click("Muat ulang status");
  await page.waitForFunction(() =>
    document.querySelector(".settings-page [role=alert]"),
  );
  assert(
    !(await page.evaluate(() =>
      document.body.innerText.includes("must-not-render"),
    )),
  );
  readMode = "ok";
  await click("Coba muat pengaturan");
  await ready();
  await page.goto(origin + path + "?mode=jobs", { waitUntil: "networkidle0" });
  await page.waitForFunction(() =>
    document.body.innerText.includes("Buat backup manual"),
  );
  await click("Buat backup manual");
  assert.equal(posts.at(-1).action, "backup");
  await page.goto(origin + path + "?mode=audit", { waitUntil: "networkidle0" });
  await page.waitForFunction(() =>
    document.body.innerText.includes("0 catatan"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Settings:SystemPanel320–1440,orientation,text200,axe,dirty/discard,secret isolation/lock/clear,version CAS,conflict/uncertain/refresh failure,timezone,reminder disable,SMTP saved-state/idempotency/queued truth,malformed recovery,Jobs/Audit regression; API writes simulated",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/settings-failure.png",
      fullPage: true,
    });
    console.log(
      await page.evaluate(() =>
        document.querySelector("main")?.innerText.slice(-2600),
      ),
    );
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    if (browser) {
      await Promise.race([browser.close(), sleep(5000)]);
      browser.process()?.kill("SIGKILL");
    }
  } catch {}
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((r) => server.once("exit", r)),
      sleep(1500),
    ]);
  }
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
}
