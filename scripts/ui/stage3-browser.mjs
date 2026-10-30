import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  createWriteStream,
  existsSync,
} from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const route = "app/stage3-check",
  port = 20000 + Math.floor(Math.random() * 10000),
  origin = `http://127.0.0.1:${port}`,
  logPath = "/tmp/edutara-stage3-dev.log";
const log = createWriteStream(logPath);
let server, browser;
const dist = `.next-stage2-stage3-${Date.now()}`;
const originals = Object.fromEntries(
  ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((path) => [
    path,
    existsSync(path) ? readFileSync(path, "utf8") : null,
  ]),
);
if (existsSync(route))
  throw Error(
    "Temporary verification route already exists; refusing to overwrite.",
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = "/tmp/edutara-stage3-shots";
mkdirSync(shots, { recursive: true });
async function waitUntil(fn, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(350);
  }
  throw Error("Timed out waiting for dev server");
}
try {
  mkdirSync(route, { recursive: true });
  writeFileSync(
    `${route}/page.tsx`,
    readFileSync("tests/fixtures/stage3-ui.tsx", "utf8"),
  );
  server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        EDUTARA_UI_TEST_DIST: dist,
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  await waitUntil(async () => {
    try {
      return (await fetch(origin + "/login")).ok;
    } catch {
      return false;
    }
  });
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  let created = false,
    questions = false,
    published = false,
    teacher = false,
    help = [],
    resolved = false,
    extension = false;
  const eid = "03000000-0000-4000-8000-000000000001",
    classId = "03000000-0000-4000-8000-000000000002",
    aid = "03000000-0000-4000-8000-000000000003";
  const calls = [];
  const readiness = () => ({
    id: eid,
    title: "Asesmen IPS Terpandu",
    status: published ? "scheduled" : "draft",
    lifecycle: published ? "Terjadwal" : questions ? "Siap Ditinjau" : "Draf",
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 90000000).toISOString(),
    duration_minutes: 45,
    ready: questions,
    participants: 132,
    unconfirmed: 2,
    question_count: questions ? 20 : 0,
    checks: [
      {
        code: "questions",
        label: "Soal dan kunci",
        ok: questions,
        blocking: true,
        detail: questions ? "20 soal tersimpan" : "Bank soal belum tersedia",
        href: "/dashboard/exams?exam=" + eid,
      },
      {
        code: "accounts",
        label: "Aktivasi akun",
        ok: false,
        blocking: false,
        detail: "2 peserta belum konfirmasi email",
        href: "/dashboard/users",
      },
    ],
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/favicon.ico")
      return void request.respond({ status: 204 });
    if (url.origin === origin && url.pathname.startsWith("/api/")) {
      const input = JSON.parse(request.postData() || "{}");
      let result = { saved: true };
      if (request.method() === "POST")
        calls.push({ path: url.pathname, input });
      if (url.pathname === "/api/workflow") {
        const action =
          input.action || url.searchParams.get("action") || "preparation";
        if (action === "preparation")
          result = {
            admin: !teacher,
            exams: created ? [readiness()] : [],
            server_now: new Date().toISOString(),
          };
        if (action === "publish") {
          published = true;
          result = { published: true };
        }
        if (action === "signals")
          result = [
            {
              attempt_id: aid,
              last_seen_at: new Date(Date.now() - 60000).toISOString(),
              connection: "stale",
              help_count: help.filter((h) => !h.resolved_at).length,
            },
          ];
        if (action === "help_list") result = help;
        if (action === "help") {
          help = [
            {
              id: eid,
              attempt_id: aid,
              student: "Siswa Pengujian",
              message: input.message,
              created_at: new Date().toISOString(),
              resolved_at: null,
              resolution: null,
              can_resolve: true,
            },
          ];
          result = {
            message: "Permintaan tercatat. Tunggu tanggapan pengawas.",
          };
        }
        if (action === "resolve") {
          help = help.map((h) => ({
            ...h,
            resolution: input.reason,
            resolved_at: new Date().toISOString(),
          }));
          resolved = true;
        }
        if (action === "extend") extension = true;
        if (action === "import_preview")
          result = input.items.map((i) => ({
            username: i.username,
            error:
              i.username === "sudah_ada" ? "Username sudah digunakan." : "",
          }));
      }
      if (url.pathname === "/api/authoring") {
        if (request.method() === "GET")
          result = {
            classes: [{ id: classId, name: "IX A" }],
            subjects: [{ id: classId, name: "IPS" }],
          };
        else {
          created = true;
          result = { id: eid };
        }
      }
      if (url.pathname === "/api/admin/users") {
        result =
          request.method() === "GET"
            ? { rows: [], count: 0, canManage: !teacher }
            : { saved: true };
      }
      if (url.pathname === "/api/admin/master")
        result = { classes: [{ id: classId, name: "IX A", active: true }] };
      return void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: result }),
      });
    }
    void request.continue();
  });
  const goto = async (mode = "preparation", width = 390, role = "admin") => {
    teacher = role === "teacher";
    await page.setViewport({ width, height: 900 });
    await page.goto(`${origin}/stage3-check?mode=${mode}&role=${role}`, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector(`[data-mode="${mode}"]`);
  };
  const clickText = async (text) => {
    await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===text&&el.getClientRects().length&&!el.disabled),{timeout:15000},text);
    const h = await page.evaluateHandle(
      (t) =>
        [...document.querySelectorAll("button")].find(
          (e) => e.textContent.trim() === t && e.getClientRects().length,
        ),
      text,
    );
    assert.ok(h.asElement(), `Missing button ${text}`);
    await h.asElement().click();
    await h.dispose();
  };
  const overflow = async (label) =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Overflow ${label}`,
    );
  const inputLabel = async (label, value) => {
    const el = await page.evaluateHandle(
      (label) =>
        [...document.querySelectorAll('[role="dialog"] label')]
          .find((e) => e.textContent.startsWith(label))
          ?.querySelector("input"),
      label,
    );
    assert.ok(el.asElement(), label);
    await el.asElement().evaluate((e, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(e, value);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await el.dispose();
  };
  await goto();
  await clickText("Buat ujian terpandu");
  await page.waitForSelector('[role="dialog"]');
  await inputLabel("Judul ujian", "Asesmen IPS Terpandu");
  await page.select('[role="dialog"] select', classId);
  await clickText("Lanjut");
  await page.click('[role="dialog"] input[type="checkbox"]');
  await clickText("Lanjut");
  await inputLabel("Mulai", "2026-12-01T08:00");
  await inputLabel("Akhir", "2026-12-01T09:00");
  await inputLabel("Durasi", "45");
  await inputLabel("PIN", "123456");
  await clickText("Simpan draf & lanjut");
  await waitUntil(
    async () =>
      await page.evaluate(
        () => !!document.querySelector('[role="dialog"] a[target="_blank"]'),
      ),
    15000,
  );
  assert.equal(calls.filter((c) => c.input.action === "publish").length, 0);
  assert.equal(
    calls.find((c) => c.input.action === "exam").input.exam.status,
    "draft",
  );
  await overflow("wizard mobile");
  await page.screenshot({ path: `${shots}/wizard-mobile.png`, fullPage: true });
  questions = true;
  await clickText("Lanjut");
  await clickText("Simpan draf & lanjut");
  await waitUntil(
    async () =>
      await page.evaluate(
        () => !!document.querySelector('[role="dialog"] .readiness-list'),
      ),
    15000,
  );
  await clickText("Lanjut");
  await inputLabel("Ketik PUBLIKASIKAN", "PUBLIKASIKAN");
  await clickText("Publikasikan jadwal");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(published, true);
  for (const width of [320, 390, 768, 1440]) {
    await goto("preparation", width);
    await overflow(`readiness ${width}`);
  }
  await page.screenshot({
    path: `${shots}/preparation-desktop.png`,
    fullPage: true,
  });
  await goto("preparation", 390, "teacher");
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll("button")].some(
        (e) => e.textContent === "Buat ujian terpandu",
      ),
    ),
    false,
  );
  await goto("help");
  await clickText("Minta bantuan");
  await page.type(
    '[role="dialog"] textarea',
    "Gambar soal belum tampil dengan baik",
  );
  await clickText("Kirim permintaan");
  await waitUntil(async () => help.length === 1, 5000);
  await page.keyboard.press("Escape");
  await goto("incidents");
  await clickText("Tangani");
  await page.type(
    '[role="dialog"] textarea',
    "Silakan muat ulang status melalui alat ujian.",
  );
  await clickText("Tandai ditangani");
  await waitUntil(async () => resolved, 5000);
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.select(".incident-actions select", aid);
  await page.waitForSelector('[role="dialog"]');
  await page.type(
    '[role="dialog"] textarea',
    "Gangguan jaringan selama lima menit",
  );
  await inputLabel("Ketik TAMBAH WAKTU", "TAMBAH WAKTU");
  await clickText("Berikan dispensasi");
  await waitUntil(async () => extension, 5000);
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  for (const width of [320, 390, 768, 1440]) {
    await goto("incidents", width);
    await overflow(`monitor ${width}`);
  }
  await page.screenshot({
    path: `${shots}/incidents-desktop.png`,
    fullPage: true,
  });
  await goto("users");
  await page.type(
    "textarea",
    "username\tfull_name\temail\trole\tclass_id\nsudah_ada\tSiswa Satu\tsatu@example.com\tstudent\t" +
      classId +
      "\nsiswa_baru\tSiswa Baru\tbaru@example.com\tstudent\t" +
      classId +
      "\nsiswa_baru\tDuplikat\tduplikat@example.com\tstudent\t" +
      classId,
  );
  await clickText("Pratinjau");
  await waitUntil(
    async () =>
      await page.evaluate(() =>
        document.body.textContent.includes("Username sudah digunakan."),
      ),
    5000,
  );
  assert.ok(
    await page.evaluate(() =>
      document.body.textContent.includes("Username duplikat dalam berkas."),
    ),
  );
  await clickText("Impor baris valid");
  await waitUntil(
    async () =>
      await page.evaluate(() =>
        document.body.textContent.includes("Unduh hasil impor"),
      ),
    5000,
  );
  assert.equal(
    calls.filter(
      (c) => c.path === "/api/admin/users" && c.input.operation === "create",
    ).length,
    1,
  );
  await overflow("import mobile");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "PASS",
      viewports: [320, 390, 768, 1440],
      checks: [
        "seven-step wizard",
        "draft before publication",
        "role-aware actions",
        "readiness",
        "student help",
        "supervisor response",
        "Admin time allowance",
        "import preflight and duplicates",
        "row report",
        "responsive overflow",
      ],
      screenshots: shots,
    }),
  );
} finally {
  if (browser) await browser.close();
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* Server already stopped. */
    }
  }
  log.end();
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [path, content] of Object.entries(originals)) {
    if (content === null) rmSync(path, { force: true });
    else writeFileSync(path, content);
  }
}
