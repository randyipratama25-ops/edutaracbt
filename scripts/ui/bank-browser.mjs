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
const route = `app/bank-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-bank-audit-${Date.now()}`,
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
    `import {BankPanel} from '../../components/bank/panel';import {DashboardShell} from '../../components/layout/dashboard-shell';import {PageHeading} from '../../components/layout/page-heading';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><PageHeading title="Bank soal"/><BankPanel/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/bank-browser-dev.log");
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
      "Bank browser fixture build failed; see /tmp/bank-browser-dev.log",
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
  const id = (n) => `09000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const q = (type) => ({
    type,
    stem: "<p>Soal " + type + " $2+2$</p>",
    points: type === "Esai" ? 5 : 1,
    options:
      type === "Esai"
        ? []
        : type === "BS"
          ? [{ id: "s1", text: "Pernyataan benar" }]
          : type === "JODOH"
            ? [
                { id: "s1", text: "Indonesia" },
                { id: "s2", text: "Jepang" },
              ]
            : [
                { id: "A", text: "Pilihan A" },
                { id: "B", text: "Pilihan B" },
              ],
    key:
      type === "Esai"
        ? []
        : type === "BS"
          ? ["true"]
          : type === "JODOH"
            ? ["Jakarta", "Tokyo"]
            : ["A"],
    rubric: type === "Esai" ? "Pemahaman konsep" : "",
    required: true,
    canvas: { enabled: false, width: 1000, height: 600 },
    attachments: [],
    direction: "ltr",
    explanation: "",
    keywords: [],
    distractors: [],
    minChars: 0,
  });
  const meta = {
    subject_id: id(90),
    class_ids: [id(91)],
    topic: "Materi utama",
    indicator: "Memahami materi",
    difficulty: "medium",
    cognitive: "C2",
  };
  let audience = "admin",
    mode = "ok",
    detailMode = "ok",
    writeMode = "ok",
    metaMode = "ok",
    listSize = 51,
    calls = [],
    heldDetail,
    heldWrite;
  const states = new Map(),
    extra = [];
  const row = (n) => ({
    id: id(n),
    metadata: meta,
    state: states.get(n) || "draft",
    version: 2,
    owner_id: id(92),
    payload: q("PG"),
    can_edit: audience === "admin" || n === 1,
    can_review: audience === "admin" || n === 2,
  });
  const list = () =>
    [...extra, ...Array.from({ length: listSize }, (_, i) => row(i + 1))].map(
      (r) => ({
        ...r,
        can_edit: audience === "admin" || r.id === id(1),
        can_review: audience === "admin" || r.id === id(2),
      }),
    );
  const detail = (n) => ({
    item: row(n),
    versions: [
      { version: 2, payload: q("PG"), reason: "Versi terbaru" },
      {
        version: 1,
        payload: { ...q("PG"), stem: "<p>Versi lama</p>" },
        reason: "Versi awal",
      },
    ],
    reviews: [],
    similar: 0,
    usage: [],
  });
  const masters = () => ({
    classes: Array.from({ length: 35 }, (_, i) => ({
      id: id(91 + i),
      name: "Kelas " + (i + 1) + " " + "Nama panjang ".repeat(3),
      active: i !== 34,
    })),
    subjects: [{ id: id(90), name: "IPS", active: true }],
    exams: Array.from({ length: 4 }, (_, i) => ({
      id: id(200 + i),
      title: "Ujian " + (i + 1),
      status: "draft",
      subject_id: id(90),
    })),
    examClasses: [{ exam_id: id(200), class_id: id(91) }],
  });
  const respond = async (r, status, data) => {
    try {
      await r.respond({
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
                      ? "CONFLICT: Versi berubah"
                      : "Layanan belum tersedia.",
                },
              },
        ),
      });
    } catch {}
  };
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return r.continue();
    if (u.pathname === "/api/authoring")
      return respond(
        r,
        metaMode === "error" ? 503 : 200,
        u.searchParams.has("exam")
          ? { questions: [{ payload: q("PG") }, { payload: q("BS") }] }
          : masters(),
      );
    if (r.method() === "GET" && u.pathname === "/api/bank") {
      const a = u.searchParams.get("action");
      if (a === "detail") {
        if (detailMode === "hold") {
          heldDetail = r;
          return;
        }
        return respond(
          r,
          detailMode === "error" ? 503 : 200,
          detail(Number(u.searchParams.get("id").slice(-12))),
        );
      }
      if (a === "quality")
        return respond(r, 200, { eligible: 0, limit: 300, items: [] });
      let rows = list();
      if (u.searchParams.get("search") === "none") rows = [];
      const total = rows.length,
        p = Number(u.searchParams.get("page") || 1);
      return respond(
        r,
        mode === "error" ? 503 : 200,
        mode === "malformed"
          ? { rows: null }
          : { rows: rows.slice((p - 1) * 25, p * 25), total },
      );
    }
    if (r.method() === "POST" && u.pathname === "/api/bank") {
      const input = JSON.parse(r.postData());
      calls.push(input);
      if (writeMode === "hold") {
        heldWrite = r;
        return;
      }
      if (writeMode === "uncertain") return respond(r, 503, null);
      if (writeMode === "malformed") return respond(r, 200, { saved: false });
      if (input.action === "save") {
        const result = id(1001 + extra.length);
        extra.unshift({
          ...row(1001 + extra.length),
          id: result,
          payload: input.payload,
          metadata: input.meta,
        });
        return respond(r, 200, { id: input.id || result });
      }
      if (input.action === "review") {
        states.set(Number(input.id.slice(-12)), input.decision);
        return respond(r, 200, { saved: true });
      }
      if (input.action === "import")
        return respond(
          r,
          200,
          input.items.map((_, i) => ({
            row: i + 1,
            saved: true,
            id: id(500 + i),
          })),
        );
      if (input.action === "preview")
        return respond(
          r,
          200,
          input.exam_ids.flatMap((exam_id) =>
            input.rules.map((rule) => ({ exam_id, rule, available: 20 })),
          ),
        );
      return respond(
        r,
        200,
        input.exam_ids.map((exam_id) => ({
          exam_id,
          count: input.rules.reduce((n, r) => n + r.count, 0),
          pack_id: id(700),
        })),
      );
    }
    return respond(r, 200, []);
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
        b.closest("details.more-actions:not([open])")?.querySelector("summary")?.click();
        b.focus();
        b.click();
      },
      { text, scope },
    );
  };
  const value = async (label, value, scope = "[role=dialog]") =>
    page.evaluate(
      ({ label, value, scope }) => {
        const root = document.querySelector(scope);
        const l = [...root.querySelectorAll("label")].find((l) =>
          [...l.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .trim()
            .startsWith(label),
        );
        if (!l) throw Error("Label " + label);
        const el = l.control || l.querySelector("input,select,textarea");
        if (!el) throw Error("Control " + label);
        const proto =
          el.tagName === "INPUT"
            ? HTMLInputElement.prototype
            : el.tagName === "TEXTAREA"
              ? HTMLTextAreaElement.prototype
              : HTMLSelectElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { label, value, scope },
    );
  const ready = async () =>
    page.waitForFunction(
      () =>
        !document.querySelector(".bank-page .state-loading") &&
        !!document.querySelector(".bank-page table"),
    );
  const go = async (role = "admin") => {
    audience = role;
    await page.goto(origin + path + "?role=" + role, {
      waitUntil: "networkidle0",
    });
    await ready();
  };
  const fits = async () =>
    assert(
      await page.$eval("[role=dialog]", (e) => {
        const r = e.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1 &&
          e.scrollWidth <= e.clientWidth + 1
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
  const close = async () => {
    await page.click('[aria-label="Tutup dialog"]');
    await page.waitForSelector("[role=dialog]", { hidden: true });
  };
  const taxonomy = async () => {
    await value("Mata pelajaran", id(90));
    await value("Materi", "Materi uji");
    await value("Indikator", "Memahami materi uji");
    await page.click("[role=dialog] input[type=checkbox]");
  };
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await go();
  await click("Berikutnya");
  await ready();
  await click("Berikutnya");
  await ready();
  listSize = 1;
  await click("Muat ulang");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Halaman 1 / 1"),
  );
  listSize = 51;
  await click("Muat ulang");
  await ready();
  mode = "malformed";
  await click("Muat ulang");
  await page.waitForSelector(".list-filters [role=alert]");
  mode = "ok";
  await click("Muat ulang");
  await ready();
  await value("Cari materi", "none", ".bank-page");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Belum ada soal pada filter ini"),
  );
  await click("Reset filter");
  await ready();
  detailMode = "hold";
  await click("Detail & review");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Memuat versi"),
  );
  await close();
  detailMode = "ok";
  await click("Tambah soal bank");
  await respond(heldDetail, 200, detail(1));
  assert(await page.$("[role=dialog] form"));
  await close();
  await click("Tambah soal bank");
  await taxonomy();
  await value("Catatan versi", "Catatan penambahan soal");
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
    await fits();
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
  writeMode = "hold";
  await click("Simpan draf soal");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[role=dialog] form")
        ?.getAttribute("aria-busy") === "true",
  );
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  await page.evaluate(() =>
    document
      .querySelector("[role=dialog] form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.equal(calls.length, 1);
  const original = structuredClone(calls[0]);
  writeMode = "uncertain";
  await respond(heldWrite, 503, null);
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Periksa / ulangi tindakan"),
  );
  await click("Tutup sementara");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  await click("Kembali ke tindakan tertunda");
  writeMode = "ok";
  await click("Periksa / ulangi tindakan");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  await ready();
  assert.deepEqual(calls[1], original);
  for (const type of ["PG_KOMPLEKS", "BS", "JODOH", "Esai"]) {
    await click("Tambah soal bank");
    await taxonomy();
    await value("Tipe soal", type);
    if (type === "Esai") {
      await click("Tambah kriteria");
      await value("Kriteria 1", "Pemahaman");
      await value("Bobot", "5");
    }
    await value("Catatan versi", "Catatan soal " + type);
    await click("Simpan draf soal");
    await page.waitForSelector("[role=dialog]", { hidden: true });
    await ready();
    assert.equal(calls.at(-1).payload.type, type);
  }
  await click("Detail & review");
  await page.waitForSelector(".question-preview");
  await value("Versi", "1");
  assert(await page.$eval("[role=dialog] form button", (b) => b.disabled));
  const before = calls.length;
  await page.evaluate(() =>
    document
      .querySelector("[role=dialog] form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.equal(calls.length, before);
  await value("Versi", "2");
  await value("Catatan review", "Peninjauan versi terbaru");
  await click("Simpan keputusan review");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  await ready();
  assert.equal(calls.at(-1).expected_version, 2);
  await click("Detail & review");
  await page.waitForSelector(".question-preview");
  await click("Hitung statistik kualitas");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Belum ada hasil final resmi"),
  );
  await close();
  await click("Impor / ambil dari ujian");
  await taxonomy();
  await value("Data JSON", JSON.stringify([{ bad: "invalid" }, q("BS")]));
  await click("Pratinjau impor bank");
  await page.waitForFunction(() =>
    document.querySelector("[role=dialog]")?.textContent.includes("BS valid"),
  );
  await value("Catatan impor", "Catatan impor soal");
  await click("Impor soal valid");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Baris 2: Berhasil"),
  );
  await fits();
  await close();
  await click("Susun paket dari kisi-kisi");
  await page.click("[role=dialog] input[type=checkbox]");
  await value("Jumlah", "2");
  await click("Periksa kandidat kisi-kisi");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("20 tersedia / 2"),
  );
  await value("Jumlah", "3");
  assert(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("[role=dialog] button")].find(
          (b) => b.textContent === "Susun paket ujian",
        ).disabled,
    ),
  );
  await click("Periksa kandidat kisi-kisi");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("20 tersedia / 3"),
  );
  await click("Susun paket ujian");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  assert.equal(calls.at(-1).action, "assemble");
  await go("teacher");
  await click("Detail & review");
  await page.waitForSelector(".question-preview");
  assert(
    await page.$$eval("[role=dialog] form select option", (xs) =>
      xs.every((x) => !["approved", "revision"].includes(x.value)),
    ),
  );
  await close();
  listSize = 0;
  extra.length = 0;
  await go();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Belum ada soal"),
  );
  listSize = 51;
  await click("Muat ulang");
  await ready();
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await click("Tambah soal bank");
  await fits();
  await overflow();
  await page.screenshot({ path: "/tmp/bank-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS bank production fixture: 51 rows/page clamp,malformed/error/no result,late detail,all5types,rubric,save lock,uncertain close/reopen same request,version-review guard,quality,source-row import report,preview invalidation/assembly,teacher boundaries,320–1440/orientation/text200/touch/axe/viewport,no pageerror. All writes simulated.",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/bank-failure.png",
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
