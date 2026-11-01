import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  createWriteStream,
} from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axe from "axe-core";
const route = `app/dashboard-check-${Date.now()}`,
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-dashboard-${Date.now()}`;
const originals = Object.fromEntries(
  ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
    p,
    existsSync(p) ? readFileSync(p, "utf8") : null,
  ]),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, server;
try {
  assert(!existsSync(route), "temporary fixture route already exists");
  mkdirSync(route);
  writeFileSync(
    route + "/page.tsx",
    `import {DashboardOverview} from '../../components/dashboard/overview';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;const role=p.role==='teacher'?'teacher':'admin';return <DashboardShell role={role} name={'Pengguna uji '+ 'Panjang'.repeat(24)}><DashboardOverview role={role} counts={[{label:'Pengguna',count:p.counts==='error'?null:p.counts==='zero'?0:132},{label:'Kelas',count:6},{label:'Mata pelajaran',count:12}]}/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/dashboard-browser-dev.log");
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
    if (n === 119) throw Error("Startup failed");
    await sleep(500);
  }
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.EDUTARA_TEST_CHROME || (await chromium.executablePath()),
    headless: true,
  });
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  let hold = null;
  let mode = "many",
    delay = 0,
    pending = 7,
    apiCalls = [];
  const exam = (n, extra = {}) => ({
    id: `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: `Ujian ${n} ${"JudulPanjang".repeat(12)}`,
    status: "scheduled",
    lifecycle: "Terjadwal",
    starts_at: "2026-11-01T00:00:00Z",
    ready: true,
    ...extra,
  });
  const exams = () =>
    mode === "empty"
      ? []
      : mode === "archived"
        ? [exam(1, { status: "archived", lifecycle: "Diarsipkan" })]
        : [
            exam(1, { lifecycle: "Berlangsung" }),
            exam(2, { status: "draft", lifecycle: "Draf", ready: false }),
            exam(3, { lifecycle: "Selesai" }),
            exam(4, { lifecycle: "Dinilai" }),
            exam(5, { lifecycle: "Dipublikasikan" }),
            ...Array.from({ length: 40 }, (_, i) => exam(i + 6)),
          ];
  page.on("request", async (r) => {
    try {
      const u = new URL(r.url());
      if (u.pathname === "/api/health") return void r.continue();
      if (!u.pathname.startsWith("/api/")) return void r.continue();
      apiCalls.push({ path: u.pathname, method: r.method() });
      assert.equal(r.method(), "GET", "dashboard should not mutate data");
      const currentMode = mode,
        currentDelay = delay;
      let data =
        u.pathname === "/api/workflow"
          ? { exams: exams(), server_now: "2026-11-01T00:00:00Z", admin: true }
          : { total: pending };
      if (currentMode === "invalid")
        data =
          u.pathname === "/api/workflow"
            ? { exams: null, server_now: "bad" }
            : { total: -1 };
      const currentHold = hold;
      if (currentHold) await currentHold;
      if (currentDelay) await sleep(currentDelay);
      if (currentMode === "network") return void r.abort("failed");
      if (currentMode === "html")
        return void r.respond({
          status: 200,
          contentType: "text/html",
          body: "not JSON",
        });
      await r.respond({
        status:
          currentMode === "expired" ? 401 : currentMode === "error" ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          currentMode === "error" || currentMode === "expired"
            ? { success: false, error: { message: "INTERNAL_DATABASE_DETAIL" } }
            : { success: currentMode !== "envelope", data },
        ),
      });
    } catch (e) {
      if (!String(e).includes("Request is already handled"))
        errors.push(String(e));
    }
  });
  const go = async (role = "admin", query = "") => {
    await page.goto(origin + "/" + route.slice(4) + "?role=" + role + query, {
      waitUntil: "networkidle0",
    });
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.waitForSelector(".dashboard-overview");
  };
  const settled = () =>
    page.waitForFunction(
      () =>
        !document.querySelector('button[aria-label="Perbarui agenda ujian"]')
          ?.disabled &&
        !document.querySelector(
          'button[aria-label="Perbarui ringkasan koreksi"]',
        )?.disabled,
    );
  const click = async (label) => {
    const h = await page.evaluateHandle(
      (t) =>
        [...document.querySelectorAll("button")].find(
          (e) =>
            e.getAttribute("aria-label") === t || e.textContent.trim() === t,
        ),
      label,
    );
    assert(await h.evaluate((e) => !!e), label);
    await h.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await h.click();
    await h.dispose();
  };
  const overflow = async (name) =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      name + " overflow",
    );
  const scan = async (name) => {
    await page.addScriptTag({ content: axe.source });
    const r = await page.evaluate(async () =>
      window.axe.run(
        { exclude: [["nextjs-portal"]] },
        {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        },
      ),
    );
    assert.deepEqual(
      r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      name + " axe",
    );
  };
  const dialog = async () => {
    await page.waitForSelector("[role=dialog]");
    assert(
      await page.$eval("[role=dialog]", (e) => {
        const r = e.getBoundingClientRect();
        return (
          r.x >= 0 &&
          r.y >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      }),
      "bounded dialog",
    );
    await overflow("dialog");
  };
  for (const role of ["admin", "teacher"])
    for (const [width, height] of [
      [320, 900],
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1440, 900],
      [844, 390],
      [320, 320],
    ]) {
      mode = "many";
      pending = 7;
      await page.setViewport({ width, height });
      await go(role);
      await settled();
      await overflow(role + " " + width + "x" + height);
      assert.equal(
        await page.$$eval(".agenda-list>li", (rows) => rows.length),
        6,
      );
      assert(
        (await page.$eval(".agenda-counts", (e) => e.textContent)).includes(
          "Ujian selesai3",
        ),
      );
      assert(
        (await page.$eval("time", (e) => e.textContent)).includes("07.00 WIB"),
      );
      const hrefs = await page.$$eval(".role-actions a", (nodes) =>
        nodes.map((e) => e.getAttribute("href")),
      );
      assert.equal(hrefs.includes("/dashboard/acceptance"), role === "admin");
      assert.equal(!!(await page.$(".organization-summary")), role === "admin");
      assert.equal(!!(await page.$(".grading-summary")), role === "teacher");
      if (width === 320) {
        await scan(role + " narrow");
        await click("Bantuan");
        await dialog();
        await scan(role + " help");
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          () => document.activeElement?.textContent.trim() === "Bantuan",
        );
      }
    }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await go("teacher");
  await settled();
  const target = await page.$eval('button[aria-label="Buka navigasi"]', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(target.x, target.y);
  await dialog();
  for (let i = 0; i < 24; i++) await page.keyboard.press("Tab");
  assert(
    await page.evaluate(
      () => !!document.activeElement.closest("[role=dialog]"),
    ),
  );
  await scan("mobile nav");
  assert.equal(
    await page.$$eval(
      '[role=dialog] a[href="/dashboard/acceptance"]',
      (n) => n.length,
    ),
    0,
  );
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await dialog();
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.id === "main-content",
  );
  await page.setViewport({
    width: 320,
    height: 568,
    isMobile: true,
    hasTouch: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await overflow("200% text");
  await click("Bantuan");
  await dialog();
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  for (const empty of ["empty", "archived"]) {
    mode = empty;
    pending = 0;
    await go("teacher");
    await settled();
    assert(await page.$(".empty-state"));
    assert.equal(await page.$$eval(".agenda-list>li", (n) => n.length), 0);
    assert(
      (await page.$eval(".grading-summary", (e) => e.textContent)).includes(
        "Tidak ada hasil peserta",
      ),
    );
    if (empty === "archived")
      assert(
        (await page.$eval(".empty-state", (e) => e.textContent)).includes(
          "diarsipkan",
        ),
      );
    await scan(empty);
  }
  mode = "many";
  await go("admin", "&counts=error");
  await settled();
  assert(
    (await page.$eval(".summary-counts", (e) => e.textContent)).includes(
      "Data belum dapat dimuat",
    ),
  );
  await click("Perbarui data madrasah");
  await settled();
  await go("admin", "&counts=zero");
  assert.equal(
    await page.$eval(".summary-counts .metric", (e) => e.textContent),
    "0",
  );
  for (const failure of [
    "error",
    "expired",
    "html",
    "invalid",
    "envelope",
    "network",
  ]) {
    mode = failure;
    await go("teacher");
    await settled();
    assert(
      (await page.$eval(".dashboard-agenda", (e) => e.textContent)).includes(
        "Agenda belum dapat dimuat",
      ),
    );
    assert(
      (await page.$eval(".grading-summary", (e) => e.textContent)).includes(
        "belum dapat dimuat",
      ),
    );
    assert(
      !(await page.$eval("body", (e) => e.innerText)).includes(
        "INTERNAL_DATABASE_DETAIL",
      ),
    );
    assert.equal(await page.$$eval(".agenda-list>li", (n) => n.length), 0);
    mode = "many";
    await click("Perbarui agenda ujian");
    await click("Perbarui ringkasan koreksi");
    await settled();
    assert.equal(await page.$$eval(".agenda-list>li", (n) => n.length), 6);
  }
  mode = "error";
  await click("Perbarui agenda ujian");
  await settled();
  assert.equal(await page.$$eval(".agenda-list>li", (n) => n.length), 6);
  assert(
    (await page.$eval(".dashboard-agenda", (e) => e.textContent)).includes(
      "data terakhir",
    ),
  );
  mode = "many";
  let releaseLoading;
  hold = new Promise((resolve) => (releaseLoading = resolve));
  const start = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/workflow",
  );
  await click("Perbarui agenda ujian");
  await start;
  assert(
    await page.$eval(
      'button[aria-label="Perbarui agenda ujian"]',
      (e) => e.disabled,
    ),
  );
  assert(
    (await page.$eval(".dashboard-agenda", (e) => e.textContent)).includes(
      "Memuat agenda",
    ),
  );
  releaseLoading();
  hold = null;
  await settled();
  delay = 0;
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) =>
      original(fn, ms === 15000 ? 60 : ms, ...args);
  });
  delay = 500;
  await click("Perbarui agenda ujian");
  await settled();
  assert(
    (await page.$eval(".dashboard-agenda", (e) => e.textContent)).includes(
      "Agenda belum dapat dimuat",
    ),
  );
  await sleep(600);
  delay = 0;
  mode = "many";
  await go("teacher");
  await settled();
  delay = 500;
  await click("Perbarui agenda ujian");
  await page.goto(origin + "/", { waitUntil: "networkidle0" });
  await sleep(600);
  delay = 0;
  await page.setViewport({ width: 320, height: 900 });
  await go("teacher");
  await settled();
  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("skip-link"),
    ),
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "main-content",
  );
  await scan("teacher final");
  await page.screenshot({ path: "/tmp/dashboard-mobile.png", fullPage: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await go("admin");
  await settled();
  await scan("admin final");
  await page.screenshot({ path: "/tmp/dashboard-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS dashboard production components: Admin/Guru, widths320/390/768/1024/1440, short/orientation/text200%, keyboard/touch/help/nav/axe, empty/archive/many, partial count error, refresh/loading/expired/malformed/timeout/stale/unmount; read-only API fixtures",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    browser?.process()?.kill("SIGKILL");
  } catch {}
  try {
    if (server) process.kill(-server.pid, "SIGTERM");
  } catch {}
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
  process.exit(process.exitCode || 0);
}
