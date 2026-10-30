import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  createWriteStream,
} from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const route = "app/stage6-check",
  dist = `.next-stage2-stage6-${Date.now()}`,
  port = 20000 + Math.floor(Math.random() * 10000),
  origin = `http://127.0.0.1:${port}`;
const originals = Object.fromEntries(
  ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
    p,
    existsSync(p) ? readFileSync(p, "utf8") : null,
  ]),
);
let server, browser;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (existsSync(route)) throw Error("Temporary route already exists");
try {
  mkdirSync(route);
  writeFileSync(
    `${route}/page.tsx`,
    readFileSync("tests/fixtures/stage6-ui.tsx"),
  );
  const log = createWriteStream("/tmp/edutara-stage6-dev.log");
  server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      env: {
        ...process.env,
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
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await sleep(500);
    if (n === 119) throw Error("Server startup failed");
  }
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  let fail = false;
  const rows = [];
  const calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/")) return void req.continue();
    let data = {
      ai_enabled: false,
      seb_enforced: false,
      rows,
      total: rows.length,
      candidate_sha: "a".repeat(40),
    };
    if (req.method() === "POST") {
      const v = JSON.parse(req.postData());
      calls.push(v);
      const r = {
        ...v,
        id: "00000000-0000-4000-8000-000000000001",
        recorded_at: new Date().toISOString(),
        actor_id: "operator",
      };
      rows.push(r);
      data = { id: r.id };
    }
    if (url.pathname === "/api/advanced/seb") {
      void req.respond({
        status: 200,
        contentType: "application/seb",
        headers: {
          "Content-Disposition":
            'attachment; filename="edutara-uji-kompatibilitas.seb"',
        },
        body: '<?xml version="1.0"?><plist version="1.0"><dict><key>allowQuit</key><true/></dict></plist>',
      });
      return;
    }
    void req.respond({
      status: fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail ? { error: { message: "Uji kegagalan koneksi" } } : { data },
      ),
    });
  });
  mkdirSync("/tmp/edutara-stage6-shots", { recursive: true });
  async function click(text) {
    const el = await page.waitForSelector("button");
    void el;
    const handle = await page.evaluateHandle(
      (t) =>
        [...document.querySelectorAll("button")].find(
          (x) => x.textContent.trim() === t,
        ),
      text,
    );
    assert(await handle.evaluate((x) => !!x), text);
    await handle.evaluate((x) => x.scrollIntoView({ block: "center" }));
    await handle.click();
  }

  const downloadPath = "/tmp/edutara-stage6-download";
  mkdirSync(downloadPath, { recursive: true });
  await (
    await page.createCDPSession()
  ).send("Page.setDownloadBehavior", { behavior: "allow", downloadPath });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(origin + "/stage6-check", { waitUntil: "networkidle0" });
    await page.waitForFunction(() =>
      document.body.textContent.includes("Belum ada pengamatan perangkat"),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
    assert(
      await page.evaluate(() => document.body.textContent.includes("Nonaktif")),
    );
    await page.screenshot({
      path: `/tmp/edutara-stage6-shots/advanced-${width}.png`,
      fullPage: true,
    });
  }
  await click("Periksa browser ini");
  await page.waitForFunction(() =>
    document.body.textContent.includes("canvas: tersedia"),
  );
  const inputs = await page.$$("fieldset input");
  assert.equal(inputs.length, 4);
  await inputs[1].type("Laptop lab 01");
  await inputs[2].type("SEB pengujian");
  await inputs[3].type("uat/lab-01/report.pdf");
  const selectors = await page.$$("fieldset select");
  assert.equal(selectors.length, 7);
  for (const sel of selectors.slice(1)) await sel.select("pass");
  await page.type("textarea", "Semua skenario diamati pada perangkat uji.");
  await click("Simpan hasil evaluasi");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Seluruh skenario dilaporkan lulus"),
  );
  assert.equal(calls.length, 1);
  assert.equal(Object.keys(calls[0].checks).length, 6);
  assert.equal(calls[0].candidate_sha, "a".repeat(40));
  await page.setViewport({ width: 320, height: 900 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "history overflow",
  );
  await page.screenshot({
    path: "/tmp/edutara-stage6-shots/history-320.png",
    fullPage: true,
  });
  await page.click('a[href="/api/advanced/seb"]');
  for (
    let n = 0;
    n < 40 && !existsSync(downloadPath + "/edutara-uji-kompatibilitas.seb");
    n++
  )
    await sleep(100);
  assert(
    readFileSync(
      downloadPath + "/edutara-uji-kompatibilitas.seb",
      "utf8",
    ).includes("allowQuit"),
  );
  fail = true;
  await click("Muat ulang evaluasi");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Evaluasi belum tersedia"),
  );
  fail = false;
  await click("Muat ulang evaluasi");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Seluruh skenario dilaporkan lulus"),
  );

  assert.deepEqual(errors, []);
  console.log(
    "PASS advanced responsive 320/390/768/1440, AI-off state, local probe, six manual observations/save/history, SEB pilot download and retry (mocked API)",
  );
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
}
