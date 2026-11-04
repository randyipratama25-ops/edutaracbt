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
const route = `app/preparation-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-preparation-audit-${Date.now()}`,
  originals = Object.fromEntries(
    ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
      p,
      existsSync(p) ? readFileSync(p, "utf8") : null,
    ]),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, server, builder, page;
try {
  mkdirSync(route);
  writeFileSync(
    route + "/page.tsx",
    `import {PreparationPanel} from '../../components/workflow/preparation';import {DashboardShell} from '../../components/layout/dashboard-shell';import {PageHeading} from '../../components/layout/page-heading';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><PageHeading title="Persiapan ujian"/><PreparationPanel/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/preparation-browser-dev.log");
  builder = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
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
  builder.stdout.pipe(log, { end: false });
  builder.stderr.pipe(log, { end: false });
  const buildCode = await new Promise((resolve, reject) => {
    builder.once("exit", resolve);
    builder.once("error", reject);
  });
  if (buildCode !== 0)
    throw Error(
      "Preparation browser fixture build failed; see /tmp/preparation-browser-dev.log",
    );
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
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
  const id = (n) => `08000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let mode = "ok",
    metaMode = "ok",
    writeMode = "ok",
    publishMode = "ok",
    created = false,
    published = false,
    heldMeta,
    heldWrite,
    heldPublish,
    calls = [],
    metaCalls = 0,
    rows = 51;
  const e = (n) => ({
    id: id(n),
    title: "Ujian " + n + " " + (n === 1 ? "Nama panjang ".repeat(18) : "IPS"),
    status: n === 1001 && published ? "scheduled" : "draft",
    lifecycle: n === 1001 && published ? "Terjadwal" : "Draf",
    starts_at: "2031-01-10T01:00:00Z",
    ends_at: "2031-01-10T02:00:00Z",
    duration_minutes: 60,
    ready: true,
    participants: 31,
    unconfirmed: 0,
    question_count: 2,
    checks: [
      {
        code: "identity",
        label: "Identitas dan kelas",
        ok: true,
        blocking: true,
        detail: "Mata pelajaran dan kelas aktif. " + "Informasi ".repeat(20),
        href: "/dashboard/exams?exam=" + id(n),
      },
      {
        code: "rooms",
        label: "Ruang dan pengawas",
        ok: false,
        blocking: false,
        detail: "Periksa penugasan pengawas.",
        href: "/dashboard/rooms",
      },
    ],
  });
  const data = () => ({
    admin: audience === "admin",
    server_now: "2026-11-04T16:00:00Z",
    exams: [
      ...Array.from({ length: rows }, (_, i) => e(i + 1)),
      ...(created ? [e(1001)] : []),
    ],
  });
  let audience = "admin";
  const reply = async (r, status, value) => {
    try {
      await r.respond({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? { success: true, data: value }
            : {
                success: false,
                error: {
                  message:
                    status === 422
                      ? "Periksa kesiapan sebelum publikasi."
                      : "Layanan belum tersedia.",
                },
              },
        ),
      });
    } catch {}
  };
  const meta = () => ({
    canManage: true,
    classes: Array.from({ length: 70 }, (_, i) => ({
      id: id(200 + i),
      name: "Kelas " + (i + 1) + " " + "Panjang ".repeat(5),
      active: i !== 69,
    })),
    subjects: [
      { id: id(90), name: "Ilmu Pengetahuan Sosial", active: true },
      { id: id(91), name: "Nonaktif", active: false },
    ],
  });
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return r.continue();
    if (r.method() === "GET" && u.pathname === "/api/workflow")
      return reply(
        r,
        mode === "error" ? 503 : 200,
        mode === "malformed" ? { exams: null } : data(),
      );
    if (r.method() === "GET" && u.pathname === "/api/authoring") {
      metaCalls++;
      if (metaMode === "hold") {
        heldMeta = r;
        return;
      }
      return reply(r, metaMode === "error" ? 503 : 200, meta());
    }
    if (r.method() === "POST") {
      const input = JSON.parse(r.postData());
      calls.push(input);
      if (u.pathname === "/api/authoring") {
        if (writeMode === "hold") {
          heldWrite = r;
          return;
        }
        if (writeMode === "uncertain") return reply(r, 503, null);
        created = true;
        return reply(
          r,
          200,
          writeMode === "malformed" ? { saved: true } : { id: id(1001) },
        );
      }
      if (input.action === "publish") {
        if (publishMode === "hold") {
          heldPublish = r;
          return;
        }
        if (publishMode === "uncertain") return reply(r, 503, null);
        if (publishMode === "invalid")
          return reply(r, 200, { published: true, id: id(999) });
        if (publishMode === "rejected") return reply(r, 422, null);
        published = true;
        return reply(r, 200, { published: true, id: input.exam_id });
      }
    }
    return reply(r, 200, []);
  });
  const click = async (text, scope = "") => {
    await page.waitForFunction(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        return (
          !!root &&
          [...root.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === text && !b.matches(":disabled"),
          )
        );
      },
      { timeout: 15000 },
      { text, scope },
    );
    await page.evaluate(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        const b = [...root.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === text && !b.matches(":disabled"),
        );
        b.focus();
        b.click();
      },
      { text, scope },
    );
  };
  const set = async (selector, value) =>
    page.$eval(
      selector,
      (el, value) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      value,
    );
  const fill = async (selector, value) => {
    await page.focus(selector);
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type(selector, value);
  };
  const step = async (title) =>
    page.waitForFunction(
      (t) => document.querySelector("[role=dialog] h3")?.textContent === t,
      {},
      title,
    );
  const ready = async () =>
    page.waitForFunction(
      () =>
        !document.querySelector(".preparation-page .state-loading") &&
        !!document.querySelector(".preparation-page select"),
    );
  const go = async (role = "admin", query = "") => {
    audience = role;
    await page.goto(origin + path + "?role=" + role + query, {
      waitUntil: "networkidle0",
    });
    await ready();
  };
  const fit = async () =>
    assert(
      await page.$eval("[role=dialog]", (el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1 &&
          el.scrollWidth <= el.clientWidth + 1
        );
      }),
      "dialog viewport",
    );
  const overflow = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "page overflow",
    );
  await page.emulateTimezone("America/New_York");
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await go("admin", "&exam=" + id(9999));
  assert.equal(
    await page.$eval(".preparation-page select", (s) => s.value),
    id(1),
  );
  mode = "malformed";
  await click("Periksa ulang kesiapan");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Kesiapan belum dapat dimuat"),
  );
  assert(
    await page.$eval(".preparation-page form fieldset", (f) => f.disabled),
  );
  mode = "ok";
  await click("Coba muat kesiapan");
  await ready();
  metaMode = "hold";
  const before = metaCalls;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Buat ujian terpandu",
    );
    b.click();
    b.click();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Buat ujian terpandu",
      )?.disabled,
  );
  assert.equal(metaCalls, before + 1);
  metaMode = "ok";
  await reply(heldMeta, 200, meta());
  await step("Identitas");
  await fit();
  await fill("[role=dialog] input", "Ujian terpandu baru");
  await page.select("[role=dialog] select", id(90));
  assert.equal(
    await page.$$eval("[role=dialog] select option", (x) => x.length),
    2,
  );
  await click("Lanjut", "[role=dialog]");
  await step("Peserta");
  await fit();
  assert.equal(
    await page.$$eval(".preparation-classes input", (x) => x.length),
    69,
  );
  await click("Lanjut", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Pilih minimal satu kelas"),
  );
  await page.click(".preparation-classes input");
  await click("Lanjut", "[role=dialog]");
  await step("Jadwal");
  await set(
    "[role=dialog] input[type=datetime-local]:nth-of-type(1)",
    "2031-01-10T08:00",
  );
  await page.$$eval("[role=dialog] input[type=datetime-local]", (els) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    for (const [e, v] of [
      [els[0], "2031-01-10T08:00"],
      [els[1], "2031-01-10T09:00"],
    ]) {
      setter.call(e, v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await fill("[role=dialog] input[type=password]", "1234");
  await set("[role=dialog] input[type=number]", "120");
  await click("Simpan draf & lanjut", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Durasi ujian harus muat"),
  );
  assert.equal(calls.length, 0);
  await set("[role=dialog] input[type=number]", "60");
  writeMode = "hold";
  await click("Simpan draf & lanjut", "[role=dialog]");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[role=dialog] form")
        ?.getAttribute("aria-busy") === "true",
  );
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  assert(await page.$eval(".preparation-fields", (f) => f.disabled));
  await page.evaluate(() =>
    document
      .querySelector("[role=dialog] form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].exam.starts_at, "2031-01-10T01:00:00.000Z");
  writeMode = "uncertain";
  await reply(heldWrite, 503, null);
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Periksa / ulangi penyimpanan"),
  );
  const draft = structuredClone(calls[0]);
  await click("Tutup wizard", "[role=dialog]");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  assert(
    await page.$eval(".preparation-page .actions button", (b) => b.disabled),
  );
  await click("Periksa tindakan tertunda");
  await step("Jadwal");
  writeMode = "ok";
  mode = "error";
  await click("Periksa / ulangi penyimpanan", "[role=dialog]");
  await step("Soal");
  assert.deepEqual(calls[1], draft);
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Draf tersimpan, tetapi kesiapan"),
  );
  assert(
    await page.$eval(
      "[role=dialog] button[type=submit], [role=dialog] .actions button:not([type])",
      (b) => b.disabled,
    ),
  );
  mode = "ok";
  await click("Periksa ulang di dialog", "[role=dialog]");
  await page.waitForFunction(
    () => !document.querySelector("[role=dialog] .state-error"),
  );
  await click("Lanjut", "[role=dialog]");
  await step("Aturan");
  for (const [width, height] of [
    [320, 800],
    [390, 844],
    [768, 900],
    [1024, 800],
    [1440, 900],
    [844, 390],
    [320, 320],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await overflow();
    await fit();
  }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
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
  await click("Simpan draf & lanjut", "[role=dialog]");
  await step("Pemeriksaan");
  assert.equal(calls[2].exam.id, id(1001));
  assert(!("pin" in calls[2].exam));
  assert.notEqual(calls[2].request_id, draft.request_id);
  assert(
    await page.$$eval("[role=dialog] .readiness-list a", (as) =>
      as.every((a) => a.target === "_blank"),
    ),
  );
  await click("Lanjut", "[role=dialog]");
  await step("Publikasi");
  await fill("[role=dialog] input", "PUBLIKASIKAN");
  publishMode = "hold";
  await page.focus("[role=dialog] input");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[role=dialog] form")
        ?.getAttribute("aria-busy") === "true",
  );
  await page.click('[aria-label="Tutup dialog"]');
  assert(await page.$("[role=dialog]"));
  publishMode = "invalid";
  await reply(heldPublish, 200, { published: true, id: id(999) });
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Periksa / ulangi publikasi"),
  );
  const publication = structuredClone(calls.at(-1));
  publishMode = "ok";
  await click("Periksa / ulangi publikasi", "[role=dialog]");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  assert.deepEqual(calls.at(-1), publication);
  assert(published);
  await page.select(".preparation-page>label select", id(2));
  await fill(".preparation-page form input", "PUBLIKASIKAN");
  publishMode = "uncertain";
  await click("Publikasikan jadwal");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Hasil tindakan belum pasti"),
  );
  const second = structuredClone(calls.at(-1));
  assert.equal(second.exam_id, id(2));
  assert.notEqual(second.request_id, publication.request_id);
  assert(await page.$eval(".preparation-page>label select", (s) => s.disabled));
  publishMode = "ok";
  await click("Periksa / ulangi publikasi");
  assert.deepEqual(calls.at(-1), second);
  await go("teacher");
  assert.equal(await page.$(".preparation-page form"), null);
  assert(
    !(await page.evaluate(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Buat ujian terpandu",
      ),
    )),
  );
  assert(
    await page.$$eval(".readiness-list a", (as) =>
      as.every((a) => !a.href.endsWith("/rooms")),
    ),
  );
  await overflow();
  created = false;
  rows = 0;
  await go();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Belum ada ujian"),
  );
  rows = 51;
  await click("Periksa ulang kesiapan");
  await ready();
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await overflow();
  await click("Buat ujian terpandu");
  await fit();
  await page.screenshot({
    path: "/tmp/preparation-final-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS preparation production fixture: 51 exams/69 active classes; malformed/error/empty, metadata lock, wizard7, native validation, WIB on New York device, draft uncertain identity/close/reopen, failed refresh, frozen fields, Enter publication and wrong-receipt retry, separate exam request_id, teacher boundaries,320–1440/orientation/text200/touch/axe/viewport/no pageerror. Writes simulated.",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/preparation-failure.png",
      fullPage: true,
    });
    console.log(
      await page.evaluate(() =>
        document.querySelector("main")?.innerText.slice(-2400),
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
