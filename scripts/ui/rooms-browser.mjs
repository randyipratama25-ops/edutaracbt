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
const route = `app/rooms-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-rooms-${Date.now()}`,
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
    `import {OperationsPanel} from '../../components/operations/panel';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Ruang, sesi dan pengawas</h1><OperationsPanel mode="rooms"/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/rooms-browser-dev.log");
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
  await page.emulateTimezone("America/Los_Angeles");
  const id = (n) => `09000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const room = (n) => ({
    id: id(n),
    name: "Ruang " + n,
    capacity: n === 1 ? 0 : 30,
    count: n === 1 ? 2 : 0,
  });
  let data = {
    rooms: Array.from({ length: 26 }, (_, i) => room(i + 1)),
    sessions: Array.from({ length: 26 }, (_, i) => ({
      id: id(100 + i),
      name: "Sesi " + (i + 1),
      starts_at: "2026-11-02T00:00:00Z",
      ends_at: "2026-11-02T02:00:00Z",
    })),
    eligible: Array.from({ length: 503 }, (_, i) => ({
      id: id(1000 + i),
      name: "Peserta " + i + " " + "Nama".repeat(25),
    })),
    roster: [
      { room_id: id(1), student_id: id(1000), name: "Peserta 0" },
      { room_id: id(1), student_id: id(1001), name: "Peserta 1" },
    ],
    assignments: Array.from({ length: 25 }, (_, i) => ({
      id: id(200 + i),
      room_id: id(1),
      session_id: id(100 + i),
      original_supervisor_id: id(900),
      effective_supervisor: id(900),
      active: true,
      substitutions: [],
    })),
  };
  const staff = [
    { id: id(900), name: "Guru Pertama", role: "teacher" },
    { id: id(901), name: "Pengawas Kedua", role: "supervisor" },
  ];
  let mode = "ok",
    postMode = "ok",
    posts = [],
    held = null,
    holdPost = null,
    reads = 0;
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
    if (u.pathname.endsWith("/live"))
      return r.respond({
        status: 200,
        contentType: "text/event-stream",
        body: ": ping\n\n",
      });
    if (r.method() === "POST") {
      const input = JSON.parse(r.postData());
      posts.push(input);
      if (postMode === "hold") {
        holdPost = r;
        return;
      }
      if (postMode === "uncertain") return respond(r, 503, null);
      if (input.action === "room_save") {
        const n = input.id ? data.rooms.find((x) => x.id === input.id) : null;
        if (n) Object.assign(n, { name: input.name, capacity: input.capacity });
        else
          data.rooms.push({
            id: id(50),
            name: input.name,
            capacity: input.capacity,
            count: 0,
          });
        return respond(r, 200, { id: input.id || id(50) });
      }
      if (input.action === "session_save")
        return respond(r, 200, { id: input.id || id(150) });
      if (input.action === "assign") return respond(r, 200, { id: id(250) });
      return respond(r, 200, { saved: true });
    }
    if (u.searchParams.get("action") === "rooms") {
      reads++;
      if (mode === "hold") {
        held = r;
        return;
      }
      return respond(
        r,
        mode === "error" ? 503 : 200,
        mode === "malformed" ? { rooms: null } : data,
      );
    }
    return respond(r, 200, {
      admin: true,
      organization_id: id(999),
      exams: [
        { id: id(800), title: "Ujian pertama " + "panjang".repeat(15) },
        { id: id(801), title: "Ujian kedua" },
      ],
      staff,
    });
  });
  const click = async(text,scope='')=>{
    await page.waitForFunction(({text,scope})=>{const root=scope?document.querySelector(scope):document;const button=root&&[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.matches(':disabled'));if(!button)return false;button.click();return true;},{timeout:15000},{text,scope});
    await sleep(100);
  };
  const fill = async (label, value) =>
    page.evaluate(
      ({ label, value }) => {
        const root = document.querySelector("[role=dialog]") || document;
        const l = [...root.querySelectorAll("label")].find((x) =>
          x.textContent.trim().startsWith(label),
        );
        const el = l?.querySelector("input,select") || (l?.htmlFor ? document.getElementById(l.htmlFor) : null);
        if (!el) throw Error(label);
        const proto =
          el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
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
      () => document.querySelectorAll(".rooms-overview tbody tr").length > 0,
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
          r.bottom <= innerHeight + 1
        );
      }),
      "dialog bounds",
    );
  const close = () => page.click('button[aria-label="Tutup dialog"]');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 844 });
    await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await ready();
    await overflow();
  }
  assert(
    await page.evaluate(() =>
      document
        .querySelector(".rooms-overview")
        .innerText.includes("Tanpa batas"),
    ),
  );
  await fill("Cari ruang", "Ruang 26");
  await page.waitForFunction(
    () =>
      document.querySelectorAll('section[aria-label="Daftar ruang"] tbody tr')
        .length === 1,
  );
  await fill("Cari ruang", "");
  await ready();
  await page.setViewport({ width: 390, height: 844 });
  await overflow();
  await page.screenshot({ path: "/tmp/rooms-mobile.png", fullPage: true });
  await click(
    "Ubah",
    'section[aria-label="Daftar ruang"] tbody tr:nth-child(2)',
  );
  await fill("Nama", "Ruang 2 diperbarui");
  await fill("Kapasitas", "40");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).id, id(2));
  posts = [];

  await click("Tambah ruang");
  await page.waitForSelector("[role=dialog]");
  await fill("Nama", "Ruang baru");
  await fill("Kapasitas", "0");
  postMode = "hold";
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(
    () => document.querySelector("[role=dialog] fieldset").disabled,
  );
  await close();
  assert(await page.$("[role=dialog]"));
  assert.equal(posts.length, 1);
  postMode = "ok";
  await respond(holdPost, 200, { id: id(50) });
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await ready();
  assert.equal(posts.at(-1).capacity, 0);
  await click("Ubah", 'section[aria-label="Daftar sesi"] article:first-child');
  await page.waitForSelector("[role=dialog]");
  assert.equal(
    await page.$eval("input[type=datetime-local]", (x) => x.value),
    "2026-11-02T07:00",
  );
  await fill("Selesai", "2026-11-02T06:00");
  await click("Konfirmasi", "[role=dialog]");
  assert(await page.$("[role=dialog]"));
  await fill("Selesai", "2026-11-02T09:00");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).starts_at, "2026-11-02T00:00:00.000Z");
  await click("Tugaskan pengawas");
  await page.waitForSelector("[role=dialog]");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "assign");
  await click(
    "Tambah peserta",
    'section[aria-label="Daftar ruang"] tbody tr:first-child',
  );
  await page.waitForSelector("[role=dialog]");
  assert.equal(
    (await page.$$(".rooms-roster input[type=checkbox]")).length,
    25,
  );
  await click("Pilih hasil · maks. 500", "[role=dialog]");
  await page.waitForFunction(() =>
    document.querySelector(".rooms-roster").textContent.includes("500 / 500"),
  );
  await click("Berikutnya", "[role=dialog]");
  await fits();
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).student_ids.length, 500);
  await click(
    "Keluarkan peserta",
    'section[aria-label="Daftar ruang"] tbody tr:first-child',
  );
  await page.waitForSelector("[role=dialog]");
  await click("Pilih hasil · maks. 500", "[role=dialog]");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "roster_remove");
  await click(
    "Tunjuk pengganti",
    'section[aria-label="Daftar penugasan"] tbody tr:first-child',
  );
  await page.waitForSelector("[role=dialog]");
  await fill("Mulai", "2026-11-02T07:00");
  await fill("Selesai", "2026-11-02T08:00");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).supervisor_id, id(901));
  data.assignments[0].substitutions = [
    {
      id: id(500),
      revoked_at: null,
      effective_from: "2026-11-02T00:00:00Z",
      effective_until: "2026-11-02T01:00:00Z",
    },
  ];
  await click("Muat ulang");
  await ready();
  await click(
    "Cabut pengganti",
    'section[aria-label="Daftar penugasan"] tbody tr:first-child',
  );
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "revoke");
  await click(
    "Nonaktifkan tugas",
    'section[aria-label="Daftar penugasan"] tbody tr:first-child',
  );
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "unassign");
  await click(
    "Hapus",
    'section[aria-label="Daftar ruang"] tbody tr:nth-child(2)',
  );
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "room_delete");
  await click("Berikutnya", 'section[aria-label="Daftar sesi"]');
  await click("Hapus", 'section[aria-label="Daftar sesi"] article:first-child');
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).action, "session_delete");
  await click("Tambah ruang");
  await fill("Nama", "Ruang idempoten");
  postMode = "uncertain";
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      .innerText.includes("Hasil tindakan perlu"),
  );
  const requestId = posts.at(-1).request_id;
  await click("Tutup dan periksa ulang", "[role=dialog]");
  await ready();
  postMode = "ok";
  await click("Tambah ruang");
  await fill("Nama", "Ruang idempoten");
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(posts.at(-1).request_id, requestId);
  mode = "malformed";
  await click("Muat ulang");
  await page.waitForFunction(() =>
    document.querySelector(".rooms-page [role=alert]"),
  );
  assert.equal(await page.$(".rooms-overview"), null);
  mode = "ok";
  await click("Muat ulang");
  await ready();
  mode = "hold";
  await click("Muat ulang");
  await sleep(100);
  const before = reads;
  await sleep(5200);
  assert.equal(reads, before);
  const old = held;
  mode = "ok";
  await page.select(".toolbar select", id(801));
  await ready();
  await respond(old, 200, { rooms: null });
  await ready();
  assert.equal(await page.$(".rooms-page [role=alert]"), null);
  await click("Berikutnya", 'section[aria-label="Daftar ruang"]');
  data.rooms = data.rooms.slice(0, 2);
  await click("Muat ulang");
  await ready();
  assert(
    await page.evaluate(() =>
      document
        .querySelector('section[aria-label="Daftar ruang"] nav')
        .innerText.includes("1 / 1"),
    ),
  );
  for (const [width, height] of [
    [844, 390],
    [320, 320],
    [390, 844],
  ]) {
    await page.setViewport({ width, height });
    await overflow();
    await click("Tambah ruang");
    await page.waitForSelector("[role=dialog]");
    await fits();
    await close();
  }
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await overflow();
  await click("Tambah ruang");
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
  await close();
  scan = await page.evaluate(() =>
    window.axe.run(document.querySelector(".rooms-page"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  assert.deepEqual(errors, []);
  data = { rooms: [], sessions: [], eligible: [], roster: [], assignments: [] };
  await click("Muat ulang");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Belum ada ruang."),
  );
  assert(
    await page.evaluate(() =>
      document.body.innerText.includes("Belum ada sesi."),
    ),
  );
  console.log(
    "PASS rooms:320–1440,orientation,text200,axe,CRUD/zero capacity,WIB from LA timezone,assign/substitute/revoke/unassign,roster500/pagination,lock,uncertainty/idempotency,malformed/single-flight/stale response,page clamp,empty; API writes simulated",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({ path: "/tmp/rooms-failure.png", fullPage: true });
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
