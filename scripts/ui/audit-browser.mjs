import fs from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axe from "axe-core";
const route = `app/audit-check-${Date.now()}`,
  path = "/" + route.slice(4),
  dist = `.next-stage2-audit-${Date.now()}`,
  port = 24000 + Math.floor(Math.random() * 1000),
  origin = `http://127.0.0.1:${port}`,
  originals = Object.fromEntries(
    ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
      p,
      fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null,
    ]),
  );
let server, browser, page;
try {
  fs.mkdirSync(route);
  fs.writeFileSync(
    route + "/page.tsx",
    `import {SystemPanel} from '../../components/system/panel';import {DashboardShell} from '../../components/layout/dashboard-shell';import {PageHeading} from '../../components/layout/page-heading';export default function Page(){return <DashboardShell role="admin" name="Admin Uji"><PageHeading title="Audit aktivitas"/><SystemPanel mode="audit"/></DashboardShell>;}`,
  );
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
        EDUTARA_UI_TEST_DIST: dist,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "ignore",
    },
  );
  for (let n = 0; n < 120; n++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) break;
    } catch {}
    if (n === 119) throw Error("Startup");
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.EDUTARA_TEST_CHROME || (await chromium.executablePath()),
    headless: true,
  });
  page = await browser.newPage();
  const errors = [],
    calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let exportHold=false,exportStarted=0;
  let mode = "ok",
    total = 51;
  const row = (n) => ({
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    created_at: "2026-11-02T01:00:00Z",
    actor:
      n === 1 ? ' \t=HYPERLINK("test")' : "Nama" + n + "panjang".repeat(20),
    action: "LOGIN",
    target_type: "profiles",
    target_id: "sasaran".repeat(25),
  });
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (u.pathname != "/api/system") return void r.continue();
    calls.push({ url: u, method: r.method() });
    if(exportHold && u.searchParams.has("until")){exportStarted++;await new Promise(resolve=>setTimeout(resolve,1500));}
    const p = Number(u.searchParams.get("page") || 1),
      search = u.searchParams.get("search");
    if (search === "lama")
      await new Promise((resolve) => setTimeout(resolve, 800));
    let data = {
      rows: Array.from(
        { length: Math.max(0, Math.min(50, total - (p - 1) * 50)) },
        (_, i) => ({ ...row((p - 1) * 50 + i + 1), action: search || "LOGIN" }),
      ),
      total,
    };
    if (search === "kosong") data = { rows: [], total: 0 };
    if (mode === "malformed") data = { rows: null, total };
    try {
      await r.respond({
        status: mode === "error" ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          mode === "error"
            ? { error: { message: "Layanan audit gagal" } }
            : { success: true, data },
        ),
      });
    } catch {}
  });
  const click = async (text, scope) =>
    page.waitForFunction(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        if (!root) return false;
        const b = [...root.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === text && !b.matches(":disabled"),
        );
        if (!b) return false;
        b.focus();
        b.click();
        return true;
      },
      { timeout: 15000 },
      { text, scope },
    );
  const ready = async () =>
    page.waitForFunction(
      () =>
        document.querySelector(".list-filters")?.getAttribute("aria-busy") ===
        "false",
    );
  const fill = async (selector, value) =>
    page.$eval(
      selector,
      (e, v) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      },
      value,
    );
  const fits = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "document overflow",
    );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(origin + path, { waitUntil: "networkidle0" });
    await ready();
    await fits();
    assert.equal(
      await page.$eval("time", (e) => e.textContent.includes("08.00")),
      true,
    );
    await click("Detail", ".audit-table");
    await page.waitForSelector("[role=dialog]");
    assert(
      await page.evaluate(() => {
        const r = document
          .querySelector("[role=dialog]")
          .getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      }),
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.textContent === "Detail",
    );
  }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(origin + path, { waitUntil: "networkidle0" });
  await ready();
  await page.addScriptTag({ content: axe.source });
  let scan = await page.evaluate(() =>
    window.axe.run(document.querySelector(".audit-page"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await click("Detail", ".audit-table");
  scan = await page.evaluate(() =>
    window.axe.run(document.querySelector("[role=dialog]"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await page.keyboard.press("Escape");
  await click("Berikutnya");
  await ready();
  assert(
    await page.$eval(".audit-page nav", (e) =>
      e.textContent.includes("halaman 2"),
    ),
  );
  total = 1;
  await click("Muat ulang");
  await ready();
  await page.waitForFunction(() =>
    document
      .querySelector(".audit-page nav")
      ?.textContent.includes("halaman 1 / 1"),
  );
  await fill("input[type=search]", "lama");
  await new Promise((r) => setTimeout(r, 350));
  await fill("input[type=search]", "baru");
  await page.waitForFunction(() =>
    document.querySelector(".audit-table")?.textContent.includes("baru"),
  );
  await new Promise((r) => setTimeout(r, 1000));
  assert(
    !(await page.$eval(".audit-table", (e) => e.textContent.includes("lama"))),
  );
  mode = "error";
  await click("Muat ulang");
  await ready();
  assert(await page.$("[role=alert]"));
  assert(
    !(await page.$eval(".audit-page nav", (e) =>
      e.textContent.includes("0 catatan"),
    )),
  );
  mode = "malformed";
  await click("Muat ulang");
  await ready();
  assert(await page.$("[role=alert]"));
  mode = "ok";
  await click("Muat ulang");
  await ready();
  await fill("input[type=search]", "kosong");
  await ready();
  await page.waitForFunction(() =>
    document
      .querySelector(".empty-state")
      ?.textContent.includes("Belum ada catatan"),
  );
  await click("Reset filter");
  await ready();
  await fill("input[type=datetime-local]", "2026-11-02T08:00");
  await ready();
  assert(
    calls.at(-1).url.searchParams.get("from") === "2026-11-02T01:00:00.000Z",
  );
  await page.$$eval("input[type=datetime-local]", (es) => {
    const e = es[1];
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(e, "2026-11-02T07:00");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ready();
  assert(await page.$("[role=alert]"));
  await click("Reset filter");
  await ready();
  await page.evaluate(() => {
    window.csv = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      blob.text().then((text) => window.csv.push(text));
      return orig.call(this, blob);
    };
  });
  await click("Ekspor CSV");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".audit-page [role=status]")].some((e) =>
      e.textContent.includes("diekspor"),
    ),
  );
  assert((await page.evaluate(() => window.csv[0])).includes("' \t=HYPERLINK"));
  assert(calls.at(-1).url.searchParams.has("until"));
  exportHold=true;
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.audit-page button')].find(b=>b.textContent==='Ekspor CSV');b.click();b.click();});
  for(let n=0;n<50&&!exportStarted;n++)await new Promise(r=>setTimeout(r,50));
  assert.equal(exportStarted,1);
  await click("Batalkan ekspor");
  await page.waitForFunction(()=>[...document.querySelectorAll('.audit-page [role=status]')].some(e=>e.textContent.includes('dibatalkan')));
  await new Promise(r=>setTimeout(r,1700));
  assert.equal(await page.evaluate(()=>window.csv.length),1);exportHold=false;
  for (const [width, height] of [
    [844, 390],
    [320, 320],
    [390, 844],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await ready();
    await fits();
    await click("Detail", ".audit-table");
    await page.waitForSelector("[role=dialog]");
    assert(
      await page.evaluate(() => {
        const r = document
          .querySelector("[role=dialog]")
          .getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight + 1;
      }),
    );
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { hidden: true });
  }
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await fits();
  await page.screenshot({ path: "/tmp/audit-text200.png", fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
    document.activeElement?.blur();
    document.querySelector(".table-wrap").scrollLeft = 0;
  });
  await page.screenshot({ path: "/tmp/audit-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert(calls.every((c) => c.method === "GET"));
  console.log(
    "PASS audit:320–1440,rotation,text200,touch,axe,detail focus,filters,WIB,stale abort,pagination clamp,error/malformed/empty,retry,CSV escaped + upper bound,cancel + double-click lock; mocked read APIs only",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({ path: "/tmp/audit-failure.png", fullPage: true });
    console.log(
      await page.evaluate(
        () => document.querySelector(".audit-page")?.innerText,
      ),
    );
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {}
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  fs.rmSync(route, { recursive: true, force: true });
  fs.rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, s);
  }
}
