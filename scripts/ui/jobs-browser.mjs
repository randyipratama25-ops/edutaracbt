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
const route = `app/jobs-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-jobs-${Date.now()}`,
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
    `import {SystemPanel} from '../../components/system/panel';import {OperationalHealth} from '../../components/system/health';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Otomasi dan backup</h1><OperationalHealth/><SystemPanel mode="jobs"/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/jobs-browser-dev.log");
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
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const row = (n, extra = {}) => ({
    id: id(n),
    kind: "backup",
    status: "failed",
    progress: 20,
    attempts: 1,
    error: null,
    created_at: "2026-11-04T01:00:00Z",
    outcome: null,
    ...extra,
  });
  let jobs = Array.from({ length: 100 }, (_, i) => row(i + 1));
  let health = {
    observed_at: new Date().toISOString(),
    heartbeat_at: null,
    last_passed_drill_at: null,
    automation_enabled: false,
    worker_approved: false,
    job_issues: 2,
    stalled_jobs: 0,
    backup: null,
    drills: [],
  };
  let jobsMode = "hold",
    healthMode = "ok",
    writeMode = "ok",
    partMode = "ok",
    heldReads = [],
    heldParts = [],
    heldWrites = [],
    posts = [],
    getCount = 0;
  const respond = (r, status, data) =>
    r
      .respond({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? { success: true, data }
            : { success: false, error: { message: "Layanan sementara gagal" } },
        ),
      })
      .catch(() => {});
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return r.continue();
    if (r.method() === "POST") {
      const input = JSON.parse(r.postData());
      posts.push({ path: u.pathname, ...input });
      if (writeMode === "hold") {
        heldWrites.push(r);
        return;
      }
      if (writeMode === "unknown") return respond(r, 503, null);
      if (writeMode === "malformed") return respond(r, 200, {});
      return respond(
        r,
        200,
        input.action === "backup"
          ? { id: id(900), queued: true }
          : input.action === "retry"
            ? { queued: true }
            : input.action === "cancel_backup"
              ? { cancelled: true }
              : { saved: true },
      );
    }
    if (u.pathname === "/api/operational")
      return respond(
        r,
        200,
        healthMode === "malformed" ? { drills: null } : health,
      );
    if (u.searchParams.get("action") === "jobs") {
      getCount++;
      if (jobsMode === "hold") {
        heldReads.push(r);
        return;
      }
      return respond(
        r,
        jobsMode === "error" ? 503 : 200,
        jobsMode === "malformed" ? {} : jobs,
      );
    }
    if (u.searchParams.get("action") === "parts") {
      if (partMode === "hold") {
        heldParts.push(r);
        return;
      }
      return respond(r, 200, [
        { number: 0, kind: "metadata", bytes: 1024, sha256: "b".repeat(64) },
      ]);
    }
    return respond(r, 200, {});
  });
  const click = async (text, scope = "") => {
    await page.waitForFunction(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        const b =
          root &&
          [...root.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === text && !b.disabled,
          );
        if (!b) return false;
        b.focus();
        b.click();
        return true;
      },
      { timeout: 15000 },
      { text, scope },
    );
    await sleep(60);
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
        document.querySelector(".jobs-table") &&
        !document.querySelector(".jobs-page .list-filters[aria-busy=true]"),
    );
  const overflow = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "page overflow",
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
      "dialog overflow",
    );
  await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".jobs-page [data-state=loading]");
  for (let n = 0; n < 100 && getCount === 0; n++) await sleep(100);
  assert(getCount > 0, "initial request started");
  await sleep(500);
  const initialReads = getCount;
  await sleep(5500);
  assert.equal(getCount, initialReads, "deduplicate pending poll");
  jobsMode = "ok";
  for (const r of heldReads.splice(0)) await respond(r, 200, jobs);
  await ready();
  assert.equal(
    await page.$$eval(".jobs-table tbody tr", (xs) => xs.length),
    10,
  );
  await fill("Cari pekerjaan", "not-found");
  await page.waitForSelector(".jobs-page [data-state=no-results]");
  await click("Reset pencarian");
  await ready();
  await click("Berikutnya");
  assert(
    await page.$eval(".jobs-pagination", (x) =>
      x.innerText.includes("Halaman 2"),
    ),
  );
  await fill("Status pekerjaan", "running");
  await page.waitForSelector(".jobs-page [data-state=no-results]");
  await click("Reset pencarian");
  await ready();
  // Refresh failures preserve last known data, but never allow mutation on it.
  jobsMode = "malformed";
  await click("Muat ulang", ".jobs-page");
  await page.waitForSelector(".jobs-page [role=alert]");
  assert(
    await page.evaluate(
      () =>
        [...document.querySelectorAll(".jobs-page button")].find(
          (x) => x.textContent === "Buat backup manual",
        ).disabled,
    ),
  );
  jobsMode = "ok";
  await click("Muat ulang", ".jobs-page");
  await ready();
  // Native validation, whitespace validation, synchronous lock, modal copy.
  await click("Batalkan backup");
  await fits();
  assert(
    !(await page.$eval("[role=dialog]", (x) =>
      x.innerText.includes("Email yang"),
    )),
  );
  let before = posts.length;
  await click("Konfirmasi tindakan", "[role=dialog]");
  assert.equal(posts.length, before);
  await fill("Alasan pemeriksaan", "     ");
  await fill("Ketik KONFIRMASI", "KONFIRMASI");
  await click("Konfirmasi tindakan", "[role=dialog]");
  assert.equal(posts.length, before);
  await fill("Alasan pemeriksaan", "Alasan pembatalan uji");
  writeMode = "hold";
  await click("Konfirmasi tindakan", "[role=dialog]");
  await page.$eval("[role=dialog] form", (f) => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(posts.length, before + 1);
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  assert(
    await page.$eval("[role=dialog] textarea", (x) => x.matches(":disabled")),
  );
  writeMode = "ok";
  jobsMode = "error";
  await respond(heldWrites.shift(), 200, { cancelled: true });
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await page.waitForFunction(
    () =>
      document
        .querySelector(".jobs-page")
        .innerText.includes("Backup dibatalkan.") &&
      document.querySelector(".jobs-page [role=alert]"),
  );
  jobsMode = "ok";
  await click("Muat ulang", ".jobs-page");
  await ready();
  // Unknown backup outcome needs a fresh read and retains request identity.
  writeMode = "unknown";
  await click("Buat backup manual");
  await page.waitForFunction(() =>
    document
      .querySelector(".jobs-page")
      .innerText.includes("belum dapat dipastikan"),
  );
  const backupRequest = posts.at(-1).request_id;
  writeMode = "ok";
  await click("Muat ulang", ".jobs-page");
  await ready();
  await click("Coba ulang");
  await ready();
  writeMode = "hold";
  before = posts.length;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".jobs-page button")].find(
      (x) => x.textContent === "Buat backup manual",
    );
    b.click();
    b.click();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".jobs-page button")].find(
        (x) => x.textContent === "Buat backup manual",
      ).disabled,
  );
  assert.equal(posts.length, before + 1);
  assert.equal(posts.at(-1).request_id, backupRequest);
  writeMode = "ok";
  await respond(heldWrites.shift(), 200, { id: id(900), queued: true });
  await ready();
  // Backup parts: close old request, open another backup, late response cannot leak.
  jobs = [
    row(1, { status: "succeeded" }),
    row(2, { status: "succeeded" }),
    row(3, { outcome: "retention_pending" }),
    row(4, { outcome: "retired" }),
    row(5, { outcome: "cancelled" }),
    row(6, { kind: "smtp_probe", status: "uncertain" }),
    row(7, { kind: "reminder", status: "uncertain", error: "x".repeat(220) }),
  ];
  await click("Muat ulang", ".jobs-page");
  await ready();
  assert.equal(
    await page.$$eval(
      ".jobs-table tbody tr:nth-child(3) button",
      (xs) => xs.length,
    ),
    0,
  );
  assert.equal(
    await page.$$eval(
      ".jobs-table tbody tr:nth-child(6) button",
      (xs) => xs.length,
    ),
    0,
  );
  partMode = "hold";
  await click("Lihat bagian");
  await page.waitForSelector("[role=dialog] [data-state=loading]");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await ready();
  await page.$$eval(".jobs-table tbody tr:nth-child(2) button", (xs) =>
    xs.find((x) => x.textContent === "Lihat bagian").click(),
  );
  await page.waitForSelector("[role=dialog] [data-state=loading]");
  while (heldParts.length < 2) await sleep(30);
  await respond(heldParts[1], 200, [
    { number: 0, kind: "metadata", bytes: 20, sha256: "b".repeat(64) },
  ]);
  await page.waitForSelector(".jobs-parts");
  await respond(heldParts[0], 200, [
    { number: 9, kind: "old", bytes: 20, sha256: "a".repeat(64) },
  ]);
  await sleep(100);
  assert(
    !(await page.$eval("[role=dialog]", (x) =>
      x.innerText.includes("Bagian 9"),
    )),
  );
  assert(
    await page.$eval(".jobs-parts a", (x) =>
      x.getAttribute("href").includes("000000000002"),
    ),
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 844 });
    await overflow();
    await fits();
  }
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
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await ready();
  await click("Konfirmasi belum terkirim");
  assert(
    await page.$eval("[role=dialog]", (x) =>
      x.innerText.includes("pengiriman ganda"),
    ),
  );
  await fill("Alasan pemeriksaan", "Sudah diperiksa di layanan email");
  await fill("Ketik KONFIRMASI", "KONFIRMASI");
  await click("Konfirmasi tindakan", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).resolution, "not_sent");
  // Operational failure cannot crash rendering; form has own lock and receipt validation.
  healthMode = "malformed";
  await click("Periksa sekarang");
  await page.waitForSelector(".jobs-health [role=alert]");
  healthMode = "ok";
  await click("Periksa sekarang");
  await page.waitForFunction(
    () => !document.querySelector(".jobs-health [role=alert]"),
  );
  await click("Catat latihan pemulihan");
  await fill("ID backup", id(1));
  await fill("SHA-256 manifest", "a".repeat(64));
  await fill("Waktu selesai", "2026-11-04T12:00");
  await fill("Durasi", "12");
  await fill("Lokasi bukti", "Laporan latihan terisolasi");
  await fill("Hasil perbandingan", "Data dan media sesuai hasil pemeriksaan.");
  await fill("Ketik KONFIRMASI", "KONFIRMASI");
  writeMode = "malformed";
  await click("Simpan catatan latihan");
  await page.waitForFunction(() =>
    document
      .querySelector(".jobs-health")
      .innerText.includes("belum dapat dipastikan"),
  );
  const drillRequest = posts.at(-1).request_id;
  assert.equal(
    await page.$eval("[name=evidence]", (x) => x.value),
    "Laporan latihan terisolasi",
  );
  await click("Periksa status sebelum mengulang");
  await page.waitForFunction(
    () => !document.querySelector("#recovery-drill-form fieldset").disabled,
  );
  writeMode = "hold";
  before = posts.length;
  await click("Simpan catatan latihan");
  await page.$eval("#recovery-drill-form", (f) =>
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.equal(posts.length, before + 1);
  assert.equal(posts.at(-1).request_id, drillRequest);
  writeMode = "ok";
  await respond(heldWrites.shift(), 200, { saved: true });
  await page.waitForFunction(
    () => !document.querySelector("#recovery-drill-form"),
  );
  // Empty lists and responsive stress with long job error and checksums.
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [844, 390],
    [320, 320],
  ]) {
    await page.setViewport({ width, height });
    await overflow();
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await overflow();
  await click("Lihat bagian");
  partMode = "ok";
  while (heldParts.length < 3) await sleep(30);
  await respond(heldParts[2], 200, [
    { number: 0, kind: "metadata", bytes: 1, sha256: "a".repeat(64) },
  ]);
  await page.waitForSelector(".jobs-parts");
  await fits();
  await page.keyboard.press("Escape");
  await page.$eval(".jobs-health-details", (d) => (d.open = true));
  scan = await page.evaluate(() =>
    window.axe.run(document.querySelector("main"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await page.$eval(".jobs-health-details", (d) => (d.open = false));
  await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await page
    .$(".jobs-page")
    .then((el) => el.screenshot({ path: "/tmp/jobs-list-mobile.png" }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/jobs-mobile.png", fullPage: false });
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await ready();
  await fill("Cari pekerjaan", "sentuhan");
  await page.waitForSelector(".search-clear");
  await page.tap(".search-clear");
  assert.equal(await page.$eval(".search-field input", (x) => x.value), "");
  const visibleReads = getCount;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(5500);
  assert.equal(getCount, visibleReads, "hidden page pauses polling");
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ready();
  jobs = [];
  await click("Muat ulang", ".jobs-page");
  await page.waitForSelector(".jobs-page [data-state=empty]");
  assert.deepEqual(errors, []);
  console.log(
    "PASS Jobs: single-flight polling, locks/idempotency, native/Zod validation, malformed/error/empty/search/pagination, retained-artifact guards, backup-parts stale-response isolation, reconciliation, recovery-drill receipts and draft,320–1440,orientation,text200,axe,no pageerrors; all API writes simulated",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/jobs-failure.png",
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
