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
const route = `app/student-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-student-${Date.now()}`,
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
    `import Fixture from '../../tests/fixtures/student-audit-ui';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <Fixture mode={p.mode||"portal"}/>;}`,
  );
  const log = createWriteStream("/tmp/student-browser-dev.log");
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
      "Student browser fixture build failed; see /tmp/student-browser-dev.log",
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
  const id = (n) => `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const q = (n, type) => ({
    id: id(100 + n),
    version: 1,
    position: n + 1,
    payload: {
      type,
      stem: "<p>Pertanyaan " + (n + 1) + " tentang lingkungan.</p>",
      options:
        type === "Esai"
          ? []
          : [
              { id: "A", text: "Pilihan pertama" },
              { id: "B", text: "Pilihan kedua" },
            ],
      choices: ["Pasangan pertama", "Pasangan kedua", "Pengecoh"],
      points: 10,
      required: true,
      minChars: type === "Esai" ? 6 : 0,
      direction: "ltr",
      attachments: [],
      canvas: { enabled: false, width: 1200, height: 800 },
      distractors: ["Pengecoh"],
      key: ["PRIVATE_KEY"],
      rubric: "PRIVATE_RUBRIC",
    },
  });
  let attempt = {
    id: id(10),
    exam_id: id(1),
    title: "Ujian IPS " + "judul panjang ".repeat(7),
    status: "in_progress",
    deadline_at: new Date(Date.now() + 1800000).toISOString(),
    server_now: new Date().toISOString(),
    epoch: 1,
    finalized_at: null,
    questions: [
      "PG",
      "PG_KOMPLEKS",
      "BS",
      "JODOH",
      "Esai",
      ...Array(65).fill("PG"),
    ].map((t, n) => q(n, t)),
    answers: [],
    grading_pending: 1,
    score: null,
    result_visible: false,
    review_reason: null,
  };
  const baseExam = {
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    duration_minutes: 30,
    status: "active",
  };
  let exams = [
    {
      ...baseExam,
      id: id(1),
      title: attempt.title,
      attempt: { id: id(10), status: "in_progress", finalized_at: null },
    },
    { ...baseExam, id: id(2), title: "Ujian baru", attempt: null },
    {
      ...baseExam,
      id: id(3),
      title: "Ujian ditutup",
      status: "closed",
      attempt: null,
    },
  ];
  let listMode = "ok",
    resumeMode = "ok",
    submitMode = "ok",
    canvasMode = "ok",
    helpMode = "ok",
    posts = [],
    held = [],
    heldSubmit = [],
    heldCanvas = [],
    help = [],
    revisions = {};
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
                      ? "DEVICE_CONFLICT: Sesi sedang digunakan perangkat lain."
                      : "Layanan belum dapat diakses.",
                },
              },
        ),
      })
      .catch(() => {});
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return r.continue();
    if (u.pathname === "/api/attempts/preflight")
      return respond(r, 200, { ready: true });
    if (u.pathname === "/api/attempts" && r.method() === "GET")
      return respond(
        r,
        listMode === "error" ? 503 : 200,
        listMode === "malformed"
          ? { exams: [null] }
          : listMode === "empty"
            ? { exams: [] }
            : { exams, server_now: new Date().toISOString() },
      );
    if (u.pathname === "/api/attempts/canvas") {
      if (r.method() === "GET")
        return r.respond({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      posts.push({ action: "canvas" });
      if (canvasMode === "hold") {
        heldCanvas.push(r);
        return;
      }
      return respond(r, 200, canvasMode === "malformed" ? {} : { id: id(99) });
    }
    if (u.pathname === "/api/workflow" && r.method() === "GET")
      return respond(
        r,
        helpMode === "error" ? 503 : 200,
        helpMode === "malformed" ? {} : help,
      );
    if (r.method() === "POST") {
      const input = JSON.parse(r.postData() || "{}");
      posts.push(input);
      if (["start", "resume"].includes(input.action)) {
        if (resumeMode === "hold") {
          held.push(r);
          return;
        }
        if (resumeMode === "error" || resumeMode === "conflict")
          return respond(r, resumeMode === "conflict" ? 409 : 503, null);
        if (resumeMode === "malformed")
          return respond(r, 200, { id: id(10), status: "in_progress" });
        return respond(r, 200, {
          ...attempt,
          server_now: new Date().toISOString(),
        });
      }
      if (input.action === "takeover") {
        attempt = { ...attempt, epoch: attempt.epoch + 1 };
        return respond(r, 200, {
          ...attempt,
          server_now: new Date().toISOString(),
        });
      }
      if (input.action === "save") {
        const acks = input.answers.map((a) => {
          revisions[a.question_id] = (revisions[a.question_id] || 0) + 1;
          attempt.answers = attempt.answers
            .filter((r) => r.question_id !== a.question_id)
            .concat([
              {
                question_id: a.question_id,
                revision: revisions[a.question_id],
                value: a.value,
              },
            ]);
          return {
            question_id: a.question_id,
            saved: true,
            revision: revisions[a.question_id],
          };
        });
        return respond(r, 200, { acknowledgements: acks });
      }
      if (input.action === "submit") {
        if (submitMode === "hold") {
          heldSubmit.push(r);
          return;
        }
        if (submitMode === "unknown") return respond(r, 503, null);
        attempt = {
          ...attempt,
          status: "submitted",
          finalized_at: new Date().toISOString(),
          questions: [],
          answers: [],
        };
        exams[0].attempt = {
          id: attempt.id,
          status: attempt.status,
          finalized_at: attempt.finalized_at,
        };
        return respond(r, 200, attempt);
      }
      if (input.action === "help") {
        if (helpMode === "malformed") return respond(r, 200, {});
        help = [
          {
            id: id(88),
            attempt_id: id(10),
            student: "Siswa Uji",
            message: input.message,
            created_at: new Date().toISOString(),
            resolved_at: null,
            resolution: null,
            can_resolve: false,
          },
        ];
        return respond(r, 200, {
          id: id(88),
          message: "Permintaan tercatat. Tunggu tanggapan pengawas.",
        });
      }
      return respond(r, 200, { recorded: true });
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
    await sleep(80);
  };
  const fill = async (selector, value) =>
    page.$eval(
      selector,
      (el, value) => {
        Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        ).set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      value,
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
      "dialog bounds",
    );
  const portal = () => page.waitForSelector(".exam-card");
  const player = () => page.waitForSelector(".question-reading input");
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin + path, { waitUntil: "networkidle0" });
  await portal();
  assert.equal(
    await page.$eval("#exam-" + id(3), (e) => e.querySelector("form")),
    null,
  );
  listMode = "malformed";
  await click("Perbarui daftar");
  await page.waitForSelector("[data-state=error]");
  listMode = "empty";
  await click("Coba muat ulang");
  await page.waitForSelector("[data-state=empty]");
  listMode = "ok";
  await click("Periksa lagi");
  await portal();
  const normalExams = exams;
  exams = exams.concat(
    Array.from({ length: 40 }, (_, i) => ({
      ...baseExam,
      id: id(400 + i),
      title: "Ujian " + "panjang".repeat(20),
      status: "closed",
      attempt: null,
    })),
  );
  await click("Perbarui daftar");
  await page.waitForFunction(
    () => document.querySelectorAll(".exam-card").length === 43,
  );
  for (const width of [320, 1440]) {
    await page.setViewport({ width, height: 844 });
    await overflow();
  }
  exams = normalExams;
  await click("Perbarui daftar");
  await page.waitForFunction(
    () => document.querySelectorAll(".exam-card").length === 3,
  );
  await page.setViewport({ width: 390, height: 844 });

  // Device preflight and native PIN validation cannot start an exam accidentally.
  await sleep(200);
  await page.click(".device-preflight button");
  await page.waitForSelector(
    ".device-preflight input[type=checkbox]:not(:disabled)",
  );
  await page.click(".device-preflight input[type=checkbox]");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Mulai ujian" && !b.matches(":disabled"),
    ),
  );
  let before = posts.filter((p) => p.action === "start").length;
  await click("Mulai ujian");
  assert.equal(posts.filter((p) => p.action === "start").length, before);
  // An unavailable list never crashes; opening is locked before React commits busy state.
  resumeMode = "hold";
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent === "Lanjutkan / lihat status",
    );
    b.click();
    b.click();
  });
  for (let n = 0; n < 100 && !held.length; n++) await sleep(50);
  assert.equal(posts.filter((p) => p.action === "resume").length, 1);
  resumeMode = "ok";
  await respond(held.shift(), 200, attempt);
  await player();
  assert(
    !(await page.evaluate(() =>
      document.body.innerText.includes("PRIVATE_KEY"),
    )),
  );
  await page.click(".question-reading input[type=radio]");
  await page.waitForFunction(() =>
    document
      .querySelector(".exam-status")
      .innerText.includes("Semua perubahan tersimpan"),
  );
  // Rotation blocks interaction without replacing the player or saved answer.
  const desktopAgent = await browser.userAgent();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36");
  const rotationDeadline = attempt.deadline_at;
  await page.setViewport({ width: 390, height: 844, isLandscape: false });
  await page.waitForSelector(".landscape-required-dialog");
  await fits();
  const rotationClock = await page.$eval("[role=timer]", e => e.textContent);
  await page.waitForFunction(previous => document.querySelector("[role=timer]")?.textContent !== previous, {}, rotationClock);
  await page.screenshot({ path: "/tmp/student-landscape-required.png", fullPage: false });
  assert.equal(await page.$(".landscape-required-dialog .dialog-close"), null);
  await page.keyboard.press("Escape");
  assert(await page.$(".landscape-required-dialog"));
  await page.keyboard.press("Tab");
  assert(await page.$eval(".landscape-required-dialog", e => e.contains(document.activeElement)));
  await page.setViewport({ width: 844, height: 390, isLandscape: true });
  await page.waitForFunction(() => !document.querySelector(".landscape-required-dialog"));
  assert(await page.$eval(".question-reading input[type=radio]", e => e.checked));
  assert.equal(attempt.deadline_at, rotationDeadline);
  await page.setUserAgent(desktopAgent);
  await page.setViewport({ width: 390, height: 844, isLandscape: false });
  // Reload failures remain visible without replacing the working player or its answer.
  await page.$eval(".exam-tools", (e) => (e.open = true));
  resumeMode = "error";
  await click("Muat status server");
  await click("Simpan dan muat status server", "[role=dialog]");
  await page.waitForSelector(".student-session-feedback [role=alert]");
  assert(
    await page.$eval(".question-reading input[type=radio]", (e) => e.checked),
  );
  resumeMode = "conflict";
  await page.$eval(".exam-tools", (e) => (e.open = true));
  await click("Muat status server");
  await click("Simpan dan muat status server", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.innerText.includes("Gunakan perangkat ini?"),
  );
  await fits();
  const deadline = attempt.deadline_at;
  await click("Gunakan perangkat ini", "[role=dialog]");
  await player();
  assert.equal(attempt.deadline_at, deadline);
  assert.equal(attempt.epoch, 2);
  resumeMode = "ok";
  // Visit all five answer types and retain saves through navigation.
  await click("Berikutnya");
  await page.waitForSelector("input[type=checkbox]");
  await page.click(".question-reading input[type=checkbox]");
  await click("Berikutnya");
  await page.waitForSelector(".statement-answer select");
  await page.select(".statement-answer select", "true");
  await click("Berikutnya");
  await page.waitForSelector(".statement-answer select");
  await page.select(".statement-answer select", "Pasangan pertama");
  await click("Berikutnya");
  await page.waitForSelector(".question-reading textarea");
  await fill(
    ".question-reading textarea",
    "Jawaban esai siswa yang tetap tersimpan.",
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".exam-status")
      .innerText.includes("Semua perubahan tersimpan"),
  );
  // Help has its own loading/error/receipt path and retains text on uncertain writes.
  await page.$eval(".exam-tools", (e) => (e.open = true));
  helpMode = "malformed";
  await click("Minta bantuan");
  await page.waitForSelector("[role=dialog] [data-state=error]");
  helpMode = "ok";
  await click("Coba muat bantuan", "[role=dialog]");
  await page.waitForFunction(
    () => !document.querySelector("[role=dialog] textarea").disabled,
  );
  await fill("[role=dialog] textarea", "Kendala layar pada perangkat uji");
  helpMode = "malformed";
  await click("Kirim permintaan", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      .innerText.includes("belum dapat dipastikan"),
  );
  assert.equal(
    await page.$eval("[role=dialog] textarea", (e) => e.value),
    "Kendala layar pada perangkat uji",
  );
  const helpRequest = posts
    .filter((p) => p.action === "help")
    .at(-1).request_id;
  helpMode = "ok";
  await click("Kirim permintaan", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      .innerText.includes("Permintaan tercatat"),
  );
  assert.equal(
    posts.filter((p) => p.action === "help").at(-1).request_id,
    helpRequest,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await page.$eval(".exam-tools", (e) => (e.open = false));
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
  await click("Daftar soal");
  await page.waitForSelector("[role=dialog]");
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
  await page.click('[role=dialog] [aria-label^="Soal 1,"]');
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert(
    await page.$eval(
      ".question-heading h2",
      (e) => e === document.activeElement,
    ),
  );
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await overflow();
  await page.$eval(".exam-tools", (e) => (e.open = true));
  await overflow();
  await page.$eval(".exam-tools", (e) => (e.open = false));
  scan = await page.evaluate(() =>
    window.axe.run(document.querySelector("main"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
  await page.screenshot({
    path: "/tmp/student-player-mobile.png",
    fullPage: false,
  });
  // Submit locks modal closure and uses the same identity after a lost response.
  submitMode = "hold";
  await click("Akhiri ujian");
  await click("Ya, akhiri ujian", "[role=dialog]");
  for (let n = 0; n < 100 && !heldSubmit.length; n++) await sleep(50);
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  submitMode = "unknown";
  await respond(heldSubmit.shift(), 503, null);
  await page.waitForFunction(() =>
    document.body.innerText.includes("Pengumpulan belum dapat dipastikan"),
  );
  const requestId = posts
    .filter((p) => p.action === "submit")
    .at(-1).request_id;
  assert(
    await page.$eval(".question-reading input", (e) => e.matches(":disabled")),
  );
  await page.$eval(".exam-tools", (e) => (e.open = true));
  await click("Muat status server");
  await click("Simpan dan muat status server", "[role=dialog]");
  await page.waitForFunction(
    () =>
      !document.querySelector("[role=dialog]") &&
      !document.querySelector(".student-session-feedback"),
  );
  assert(
    await page.$eval(".question-reading input", (e) => e.matches(":disabled")),
    "uncertain reload must retain edit lock",
  );
  submitMode = "ok";
  await click("Periksa / ulangi pengumpulan");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Bukti pengumpulan"),
  );
  assert.equal(
    posts.filter((p) => p.action === "submit").at(-1).request_id,
    requestId,
  );
  await click("Kembali ke daftar ujian");
  await portal();
  // Standalone canvas: malformed uploads retain draft; a later valid upload succeeds.
  await page.goto(origin + path + "?mode=canvas", {
    waitUntil: "networkidle0",
  });
  await page.waitForSelector("canvas");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.includes("Simpan / coba") && !b.disabled,
    ),
  );
  canvasMode = "malformed";
  const rect = await page.$eval("canvas", (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.x + 20, y: r.y + 20 };
  });
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + 30, rect.y + 20);
  await page.mouse.up();
  await page.waitForFunction(() =>
    document.body.innerText.includes("Respons unggahan belum dapat dipastikan"),
  );
  assert(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("edutara:canvas:")),
    ),
  );
  canvasMode = "ok";
  await click("Simpan / coba unggah canvas lagi");
  await page.waitForFunction(() =>
    document.querySelector("#canvas-state").innerText.includes("000000000099"),
  );
  await overflow();
  assert.deepEqual(errors, []);
  console.log(
    "PASS Student: list empty/error/malformed/43 exams,70 questions,preflight/PIN, synchronous opening lock, visible reload/conflict/takeover, all five answer types, help retry/receipt/draft, map focus, mobile portrait fullscreen gate/Escape/focus/timer/answer retention,320–1440/orientation/text200/axe/no overflow, submit uncertain identity and receipt/back, canvas fault recovery; all API writes simulated",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/student-failure.png",
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
