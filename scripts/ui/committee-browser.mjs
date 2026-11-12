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
const route = `app/committee-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-committee-audit-${Date.now()}`,
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
    `import {CommitteePanel} from '../../components/operations/committee-panel';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const {portal}=await searchParams;return portal?<main id="main-content" tabIndex={-1} className="workspace supervisor-workspace committee-workspace"><h1>Ruang Panitia Ujian</h1><CommitteePanel admin={false}/></main>:<DashboardShell role="admin" name="Admin Uji"><h1>Panitia Ujian</h1><CommitteePanel admin/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/committee-browser-dev.log");
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  const id = (n) => `07000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const today = "2026-11-12";
  const future = "2026-11-13";
  const moment = "2026-11-12T01:00:00+00:00";
  const expires_at = new Date(Date.now() + 3600000).toISOString();
  const people = [
    { id: id(501), name: "Petugas pengganti" },
    { id: id(502), name: "Petugas cadangan" },
  ];
  let portal = false,
    pending = true,
    failRead = false,
    failWrite = false,
    hold,
    posts = [];
  let empty = false;
  const duties = Array.from({ length: 27 }, (_, i) => ({
    id: id(i + 1),
    profile_id: id(i + 100),
    name: i === 0 ? "Nama".repeat(70) : `Petugas ${i + 1}`,
    confirmed_at: null,
    replaced_at: null,
    replaces: null,
  }));
  const schedule = [
    {
      id: id(801),
      exam: "Ujian".repeat(75),
      room: "Ruang".repeat(45),
      session: "Sesi 1",
      starts_at: moment,
      ends_at: "2026-11-12T02:00:00+00:00",
      original_id: id(600),
      original_name: "Pengawas Awal",
      supervisor_id: id(600),
      supervisor_name: "Pengawas Awal",
      substitution_id: null,
      confirmed_at: null,
      original_confirmed_at: null,
      can_replace: true,
    },
  ];
  const list = (date) => ({
    date,
    today,
    expires_at,
    timezone: "Asia/Jakarta",
    status: portal && pending ? "pending" : "confirmed",
    candidates: portal ? [] : people,
    supervisors: portal && !pending ? people : [],
    duties: portal || empty || date !== today ? [] : duties,
    schedule: portal && !pending ? schedule : [],
  });
  const respond = (request, status, data) =>
    request
      .respond({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? { success: true, data }
            : { success: false, error: { message: data } },
        ),
      })
      .catch(() => {});
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/committee") return request.continue();
    if (request.method() === "GET") {
      const date = url.searchParams.get("date") || today;
      if (failRead) return respond(request, 503, "Layanan sementara gagal.");
      if (date === future) {
        hold = request;
        return;
      }
      return respond(request, 200, list(date));
    }
    const input = JSON.parse(request.postData());
    posts.push(input);
    await sleep(100);
    if (failWrite) return respond(request, 503, "Tanda terima hilang.");
    if (input.action === "assign")
      duties.push({
        id: id(91),
        profile_id: input.profile_id,
        name: people.find((p) => p.id === input.profile_id).name,
        confirmed_at: null,
        replaced_at: null,
        replaces: null,
      });
    if (input.action === "confirm_committee")
      duties.find((d) => d.id === input.id).confirmed_at = moment;
    if (input.action === "replace_committee") {
      const old = duties.find((d) => d.id === input.id);
      old.replaced_at = moment;
      duties.push({
        id: id(92),
        profile_id: input.profile_id,
        name: people.find((p) => p.id === input.profile_id).name,
        confirmed_at: null,
        replaced_at: null,
        replaces: old.name,
      });
    }
    if (input.action === "confirm_supervisor")
      schedule[0].confirmed_at = moment;
    if (input.action === "replace_supervisor")
      Object.assign(schedule[0], {
        supervisor_id: input.profile_id,
        supervisor_name: people.find((p) => p.id === input.profile_id).name,
        substitution_id: id(990),
        original_confirmed_at: schedule[0].confirmed_at,
        confirmed_at: null,
      });
    return respond(request, 200, { saved: true });
  });

  const waitText = (value, scope = ".committee-page") =>
    page.waitForFunction(
      ({ value, scope }) =>
        document.querySelector(scope)?.innerText.includes(value),
      {},
      { value, scope },
    );
  const click = async (label, scope = ".committee-page") => {
    await page.waitForFunction(
      ({ label, scope }) =>
        [
          ...(document.querySelector(scope)?.querySelectorAll("button") ?? []),
        ].some(
          (button) => button.textContent.trim() === label && !button.disabled,
        ),
      {},
      { label, scope },
    );
    await page.evaluate(
      ({ label, scope }) =>
        [...document.querySelector(scope).querySelectorAll("button")]
          .find(
            (button) => button.textContent.trim() === label && !button.disabled,
          )
          .click(),
      { label, scope },
    );
  };
  const fits = async () =>
    assert(
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (document.documentElement.scrollWidth > innerWidth + 1) return false;
        if (!dialog) return true;
        const box = dialog.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.right <= innerWidth + 1 &&
          box.top >= 0 &&
          box.bottom <= innerHeight + 1 &&
          dialog.scrollWidth <= dialog.clientWidth + 1
        );
      }),
    );
  await page.setViewport({
    width: 320,
    height: 720,
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(origin + path, { waitUntil: "networkidle0" });
  await waitText("Halaman 1 dari 3");
  await click("Berikutnya");
  await waitText("Halaman 2 dari 3");
  await click("Sebelumnya");
  await waitText("Halaman 1 dari 3");
  await page.type(".committee-page input[type=search]", "Petugas 27");
  await waitText("1 hasil");
  await click("Reset filter");
  const setDate = (value) =>
    page.$eval(
      ".committee-page input[type=date]",
      (input, next) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(input, next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      value,
    );
  await setDate(future);
  await waitText("Memuat tugas panitia");
  assert.equal(
    await page.$eval(
      ".committee-page input[type=date]",
      (input) => input.value,
    ),
    future,
  );
  await click("Hari ini");
  await waitText("Halaman 1 dari 3");
  if (hold) await respond(hold, 200, list(future));
  assert.equal(
    await page.$eval(
      ".committee-page input[type=date]",
      (input) => input.value,
    ),
    today,
  );
  await page.select(".committee-person-form select", id(501));
  await click("Tambahkan tugas");
  await waitText("Perubahan tersimpan");
  await waitText("28 hasil");
  await page.evaluate(() => {
    const button = [
      ...document.querySelectorAll(".committee-card button"),
    ].find((node) => node.textContent.trim() === "Konfirmasi hadir");
    button.click();
    button.click();
  });
  await waitText("Dikonfirmasi");
  assert.equal(
    posts.filter((input) => input.action === "confirm_committee").length,
    1,
  );
  await click("Tunjuk pengganti");
  await waitText("Periksa nama", '[role="dialog"]');
  for (const [width, height] of [
    [320, 720],
    [700, 330],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewport({
      width,
      height,
      hasTouch: width < 900,
      isMobile: width < 900,
      isLandscape: width > height,
    });
    await fits();
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await click("Tunjuk pengganti");
  await page.select('[role="dialog"] select', id(502));
  await click("Simpan pengganti", '[role="dialog"]');
  await waitText("Digantikan");
  assert.ok(posts.some((input) => input.action === "replace_committee"));
  failRead = true;
  await click("Muat ulang");
  await waitText("Data belum dapat diproses");
  failRead = false;
  empty = true;
  await click("Muat ulang");
  await waitText("Belum ada panitia pada tanggal ini");
  empty = false;

  portal = true;
  await page.goto(origin + path + "?portal=1", { waitUntil: "networkidle0" });
  await waitText("Menunggu konfirmasi Admin");
  pending = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitText("Jadwal pengawas hari ini");
  await page.setViewport({
    width: 320,
    height: 700,
    isMobile: true,
    hasTouch: true,
  });
  await fits();
  failWrite = true;
  await click("Konfirmasi hadir");
  await waitText("Hasil perubahan belum dapat dipastikan");
  failWrite = false;
  await click("Konfirmasi hadir");
  await waitText("Dikonfirmasi");
  await click("Tunjuk pengganti");
  await page.select('[role="dialog"] select', id(501));
  await click("Simpan pengganti", '[role="dialog"]');
  await waitText("Pengawas awal hadir");
  await click("Konfirmasi hadir");
  await waitText("Dikonfirmasi");
  assert.equal(
    posts.filter((input) => input.action === "confirm_supervisor").at(-1)
      .substitution_id,
    id(990),
  );
  await page.addScriptTag({ content: axe.source });
  const scan = await page.evaluate(() =>
    window.axe.run(document.querySelector(".committee-page"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map(({ id }) => id),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Committee: date races, loading/error/empty, 27 rows/search/pages, assign/confirm/replace, duplicate clicks, portal refresh, supervisor replacement, resize, orientation, viewport and axe; API simulated",
  );
} catch (error) {
  console.error(error);
  try {
    await page?.screenshot({
      path: "/tmp/committee-browser-failure.png",
      fullPage: true,
    });
  } catch {}
  process.exitCode = 1;
} finally {
  if (browser) await Promise.race([browser.close(), sleep(5000)]);
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      sleep(1500),
    ]);
  }
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [name, original] of Object.entries(originals)) {
    if (original === null) rmSync(name, { force: true });
    else writeFileSync(name, original);
  }
}
