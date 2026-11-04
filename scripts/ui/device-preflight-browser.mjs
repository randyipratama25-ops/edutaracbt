import fs from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const route = "app/device-preflight-check",
  dist = ".next-stage2-device-preflight",
  port = 26500 + Math.floor(Math.random() * 500),
  origin = `http://127.0.0.1:${port}`;
let server, browser, builder;
const originals = Object.fromEntries(
  ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
    p,
    fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null,
  ]),
);
if (fs.existsSync(route + "/page.tsx"))
  throw Error("Refusing to overwrite test route");
try {
  fs.mkdirSync(route, { recursive: true });
  fs.writeFileSync(
    route + "/page.tsx",
    '"use client";import {StudentPortal} from "../../components/attempts/player";export default function Page(){return <StudentPortal studentId="fixture-student"/>;}',
  );
  // Production fixtures avoid Fast Refresh restarting a check when lazy sample chunks load.
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
      stdio: "ignore",
    },
  );
  const code = await new Promise((resolve, reject) => {
    builder.once("exit", resolve);
    builder.once("error", reject);
  });
  if (code !== 0) throw Error("Preflight fixture build failed");
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
      env: { ...process.env, EDUTARA_UI_TEST_DIST: dist },
      stdio: "ignore",
    },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (n === 99) throw Error("Server startup");
  }
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.EDUTARA_TEST_CHROME || (await chromium.executablePath()),
    headless: true,
  });
  const page = await browser.newPage(),
    errors = [],
    calls = [];
  let failure = false;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().includes("/api/attempts/preflight"))
      return void r.respond({
        status: failure ? 403 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          failure
            ? { error: { message: "Silakan masuk sebagai siswa." } }
            : { data: { ready: true } },
        ),
      });
    if (!r.url().endsWith("/api/attempts")) return void r.continue();
    if (r.method() === "GET")
      return void r.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            exams: [
              {
                id: "new",
                title: "Ujian baru",
                starts_at: new Date().toISOString(),
                ends_at: new Date(Date.now() + 3600000).toISOString(),
                duration_minutes: 60,
                status: "active",
                attempt: null,
              },
              {
                id: "existing",
                title: "Ujian berjalan",
                starts_at: new Date().toISOString(),
                ends_at: new Date(Date.now() + 3600000).toISOString(),
                duration_minutes: 60,
                status: "active",
                attempt: {
                  id: "attempt",
                  status: "in_progress",
                  finalized_at: null,
                },
              },
            ],
          },
        }),
      });
    calls.push(JSON.parse(r.postData()));
    return void r.respond({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Fixture: perintah diterima tanpa membuat attempt" },
      }),
    });
  });
  const click = async (label) =>
    page.evaluate((label) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      );
      if (!b || b.disabled) throw Error("Button unavailable " + label);
      b.click();
    }, label);
  const enabled = (label) =>
    page.evaluate((label) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      );
      return b && !b.disabled;
    }, label);
  const goto = async (width) => {
    await page.setViewport({ width, height: 900 });
    await page.goto(origin + "/device-preflight-check", {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector(".device-preflight");
  };
  for (const width of [320, 390, 768, 1440]) {
    await goto(width);
    assert.equal(await enabled("Mulai ujian"), false);
    assert.equal(await enabled("Lanjutkan / lihat status"), true);
    await click("Periksa perangkat");
    await page.waitForSelector(".device-check-list");
    assert.equal(
      await page.$$(".device-check-list li").then((x) => x.length),
      6,
    );
    await page.click(".device-preflight > details > summary");
    await page.waitForSelector(".device-samples .katex", { visible: true });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "overflow " + width,
    );
  }
  await click("Lanjutkan / lihat status");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Fixture:"),
  );
  assert.equal(calls.at(-1).action, "resume");
  await page.type('input[placeholder^="Ketik"]', "contoh jawaban");
  const canvas = await page.$(".device-test-canvas");
  await canvas.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 70, { steps: 8 });
  await page.mouse.up();
  assert(
    await canvas.evaluate((e) =>
      e
        .getContext("2d")
        .getImageData(0, 0, e.width, e.height)
        .data.some((x) => x !== 0),
    ),
    "drawing works",
  );
  await click("Bersihkan contoh gambar");
  assert(
    await canvas.evaluate((e) =>
      e
        .getContext("2d")
        .getImageData(0, 0, e.width, e.height)
        .data.every((x) => x === 0),
    ),
  );
  assert.equal((await fetch(origin + "/preflight-tone.wav")).status, 200);
  await page.click(".device-preflight input[type=checkbox]");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Mulai ujian" && !b.disabled,
    ),
  );
  await page.type("input[name=pin]", "1234");
  await click("Mulai ujian");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Fixture:"),
  );
  assert.equal(calls.at(-1).action, "start");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Mulai ujian" && b.disabled,
    ),
  );
  failure = true;
  await click("Periksa perangkat");
  await page.waitForSelector(".device-check-list");
  assert.equal(await enabled("Mulai ujian"), false);
  assert(
    await page.$eval(".device-check-list", (e) =>
      e.textContent.includes("Sesi siswa"),
    ),
  );
  failure = false;
  await page.evaluate(() => {
    localStorage.setItem("edutara:draft:test", "keep");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("edutara:preflight:localStorage:")) throw Error("Quota");
      return original.call(this, k, v);
    };
  });
  await click("Periksa ulang perangkat");
  await page.waitForFunction(() =>
    document
      .querySelector(".device-check-list")
      ?.textContent.includes("Penyimpanan terblokir/penuh"),
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("edutara:draft:test")),
    "keep",
  );
  await page.click(".device-preflight input[type=checkbox]");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Mulai ujian" && !b.disabled,
    ),
  );
  await page.evaluate(() => {
    const now = performance.now.bind(performance);
    Object.defineProperty(performance, "now", { value: () => now() + 300001 });
  });
  await page.waitForFunction(() =>
    document.body.textContent.includes("kedaluwarsa"),
  );
  assert.equal(await enabled("Mulai ujian"), false);
  await goto(390);
  await click("Periksa perangkat");
  await page.waitForSelector(".device-check-list");
  await page.click(".device-preflight > details > summary");
  await page.waitForSelector(".device-samples .katex", { visible: true });
  await page.screenshot({
    path: "/tmp/device-preflight-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS device gate, student connection errors/retry, storage warning/draft isolation, offline invalidation, expiry, resume access, typing/math/media/drawing and 320/390/768/1440 (mock APIs)",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {}
  if (builder && builder.exitCode === null) {
    try {
      process.kill(-builder.pid, "SIGTERM");
    } catch {}
  }
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((r) => server.once("exit", r)),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  fs.rmSync(route, { recursive: true, force: true });
  fs.rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, s);
  }
}
