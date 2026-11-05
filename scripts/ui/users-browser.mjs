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
const route = `app/users-check-${Date.now()}`,
  urlPath = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-users-${Date.now()}`,
  originals = Object.fromEntries(
    ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
      p,
      existsSync(p) ? readFileSync(p, "utf8") : null,
    ]),
  );
let browser, server;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  mkdirSync(route);
  writeFileSync(
    route + "/page.tsx",
    `import Users from '../dashboard/users/page';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><Users/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/users-browser-dev.log");
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
  page.on("console", (m) => {
    if (m.text().includes("Invalid regular expression")) errors.push(m.text());
  });
  await page.setRequestInterception(true);
  const id = (n) => `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const classId = id(900),
    seed = () =>
      Array.from({ length: 41 }, (_, i) => ({
        id: id(i + 1),
        username: "user-" + String(i + 1).padStart(2, "0"),
        full_name: i === 0 ? "NamaPanjang".repeat(13) : "Pengguna " + (i + 1),
        role: i === 0 ? "admin" : "student",
        active: true,
        archived_at: null,
      }));
  let users = seed(),
    audience = "admin",
    mode = "ok",
    classMode = "ok",
    previewMode = "ok",
    mutationMode = "ok",
    readHold = null,
    writeHold = null,
    infoDelay = 0,
    calls = [],
    nextId = 100;
  let observed = null;
  const count = (operation) =>
    calls.filter((c) => c.operation === operation).length;
  page.on("request", async (r) => {
    try {
      const u = new URL(r.url());
      if (!u.pathname.startsWith("/api/") || u.pathname === "/api/health")
        return void r.continue();
      const payload =
        r.method() === "POST" ? JSON.parse(r.postData() || "{}") : null;
      const operation =
        payload?.operation ||
        payload?.action ||
        (u.pathname === "/api/admin/master" ? "classes" : "list");
      calls.push({ operation, payload, url: u.toString() });
      observed?.(operation);
      let status = 200,
        data = {},
        error = "";
      const currentMode = mode,
        currentClass = classMode,
        currentMutation = mutationMode,
        currentPreview = previewMode,
        held = payload ? writeHold : readHold;
      if (u.pathname === "/api/admin/master") {
        data = {
          classes: [
            { id: classId, name: "=2+2", active: true },
            { id: id(901), name: "KelasPanjang".repeat(8), active: true },
          ],
        };
        if (currentClass === "error") {
          status = 503;
          error = "SECRET_CLASS_ERROR";
        }
      } else if (u.pathname === "/api/workflow") {
        data =
          currentPreview === "missing"
            ? []
            : payload.items.map((x) => ({
                username: x.username,
                error: users.some((v) => v.username === x.username)
                  ? "Username sudah digunakan."
                  : audience === "teacher" &&
                      (x.role !== "student" || x.class_id !== classId)
                    ? "Guru hanya boleh mengimpor siswa pada kelas penugasan."
                    : "",
              }));
      } else if (r.method() === "GET") {
        const q = (u.searchParams.get("q") || "").toLowerCase(),
          role = u.searchParams.get("role"),
          active = u.searchParams.get("active"),
          p = Number(u.searchParams.get("page") || 1);
        const filtered = (currentMode === "empty" ? [] : users)
          .filter(
            (x) =>
              (audience === "admin" || x.role === "student") &&
              (!q ||
                x.username.toLowerCase().includes(q) ||
                x.full_name.toLowerCase().includes(q)) &&
              (!role || x.role === role) &&
              (!active || String(x.active) === active),
          )
          .sort(
            (a, b) =>
              a.username.localeCompare(b.username) *
              (u.searchParams.get("sort") === "desc" ? -1 : 1),
          );
        data = {
          rows: filtered.slice((p - 1) * 20, p * 20),
          count: filtered.length,
          page: p,
          canManage: audience === "admin",
        };
        if (currentMode === "error") {
          status = 503;
          error = "SECRET_SQL_ERROR";
        }
        if (currentMode === "malformed")
          data = { rows: null, count: null, canManage: true };
      } else if (operation === "invitation_info") {
        const target = users.find((x) => x.id === payload.id);
        data = {
          email: target.username + "@example.test",
          eligible: target.active && currentMutation !== "confirmed",
          reason:
            currentMutation === "confirmed"
              ? "Email sudah dikonfirmasi. Gunakan Lupa password."
              : "",
        };
        if (infoDelay) await sleep(infoDelay);
      } else if (operation === "resend_invitation") {
        data = { sent: true, message: "Undangan berhasil dikirim ulang." };
      } else if (operation === "create") {
        const row = {
          id: id(nextId++),
          username: payload.username,
          full_name: payload.full_name,
          role: payload.role,
          active: true,
          archived_at: null,
        };
        if (currentMutation !== "reject") users.push(row);
        data = { id: row.id, username: row.username };
      } else {
        const row = users.find((x) => x.id === payload.id);
        if (currentMutation !== "reject") {
          if (operation === "archive") {
            row.active = false;
            row.archived_at = "2026-11-01T00:00:00Z";
          } else
            Object.assign(
              row,
              payload.full_name
                ? { full_name: payload.full_name }
                : {
                    active: payload.active,
                    ...(payload.active ? { archived_at: null } : {}),
                  },
            );
        }
        data = { saved: true };
      }
      if (
        payload &&
        operation !== "invitation_info" &&
        operation !== "import_preview"
      ) {
        if (currentMutation === "reject") {
          status = 422;
          error =
            "Perubahan ditolak. Admin aktif terakhir tidak boleh dinonaktifkan.";
        }
        if (currentMutation === "uncertain") {
          status = 503;
          error = "SECRET_PROVIDER_ERROR";
        }
      }
      if (held) await held;
      if (currentMode === "html" && !payload)
        return void r.respond({
          status: 200,
          contentType: "text/html",
          body: "not JSON",
        });
      await r.respond({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status < 400
            ? { success: true, data }
            : { success: false, error: { message: error } },
        ),
      });
    } catch (e) {
      if (!String(e).includes("Request is already handled"))
        errors.push(String(e));
    }
  });
  const go = async (role = "admin") => {
    audience = role;
    await page.goto(origin + urlPath + "?role=" + role, {
      waitUntil: "networkidle0",
    });
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.waitForSelector(".users-page");
  };
  const loaded = () =>
    page.waitForFunction(
      () =>
        document.querySelector(".users-table")?.getAttribute("aria-busy") ===
        "false",
    );
  const click = async (label, scope = "") => {
    const h = await page.evaluateHandle(
      ({ label, scope }) =>
        [
          ...document.querySelectorAll((scope ? scope + " " : "") + "button"),
        ].find(
          (e) =>
            e.getAttribute("aria-label") === label ||
            e.textContent.trim() === label,
        ),
      { label, scope },
    );
    assert(await h.evaluate((e) => !!e), label);
    if (!scope)
      await page.waitForFunction(
        () => getComputedStyle(document.body).pointerEvents !== "none",
      );
    await h.evaluate((e) => {
      const panel = e.closest('[role="tabpanel"][hidden]');
      if (panel) document.getElementById(panel.getAttribute("aria-labelledby"))?.click();
      e.closest("details.more-actions:not([open])")?.querySelector("summary")?.click();
      e.scrollIntoView({ block: "center" });
    });
    await h.click();
    await h.dispose();
  };
  const set = async (selector, value) => {
    await page.$eval(selector, (e) => {
      const panel = e.closest('[role="tabpanel"][hidden]');
      if (panel) document.getElementById(panel.getAttribute("aria-labelledby"))?.click();
      e.value = "";
    });
    await page.type(selector, value);
  };
  const overflow = async (label) =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      label + " overflow",
    );
  const dialog = async () => {
    await page.waitForSelector("[role=dialog]");
    await overflow("dialog");
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
  };
  const scan = async (label) => {
    await page.addScriptTag({ content: axe.source });
    const a = await page.evaluate(() =>
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
      a.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      label + " axe",
    );
  };
  const close = async () => {
    await click("Tutup dialog", "[role=dialog]");
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  };
  const fillCreate = async (username = "New-User") => {
    await set("[role=dialog] input[name=full_name]", "Pengguna Baru");
    await set("[role=dialog] input[name=username]", username);
    await set(
      "[role=dialog] input[name=email]",
      username.toLowerCase() + "@example.test",
    );
    await page.select("[role=dialog] select[name=class_id]", classId);
  };
  const confirmMutation = async (action) => {
    await click(action);
    await dialog();
    await click("Konfirmasi", "[role=dialog]");
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
    await loaded();
  };
  for (const role of ["admin", "teacher"])
    for (const [width, height] of process.env.EDUTARA_USERS_FOCUS
      ? [[390, 844]]
      : [
          [320, 900],
          [390, 844],
          [768, 1024],
          [1024, 768],
          [1440, 900],
          [844, 390],
          [320, 320],
        ]) {
      await page.setViewport({ width, height });
      await go(role);
      await loaded();
      await overflow(role + width);
      assert.equal(
        await page.$eval(
          ".users-table tbody tr th",
          (e) => getComputedStyle(e).position,
        ),
        "sticky",
      );
      await page.$eval(".users-table", (e) => (e.scrollLeft = 500));
      await overflow("scrolled table");
      if (role === "teacher")
        assert.equal(
          await page.$$eval('button[aria-label^="Arsipkan "]', (n) => n.length),
          0,
        );
      await click("Tambah pengguna");
      await dialog();
      assert.equal(
        await page.$eval("[role=dialog] form", (e) => e.method),
        "post",
      );
      if (role === "teacher")
        assert.equal(
          await page.$$eval(
            "[role=dialog] select[name=role] option",
            (n) => n.length,
          ),
          1,
        );
      if (width === 320) await scan(role + " form");
      await close();
    }
  console.log("PASS role layouts and form bounds");
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await go();
  await loaded();
  const t = await page.$$eval("button", (nodes) => {
    const e = nodes.find((e) => e.textContent.trim() === "Tambah pengguna");
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(t.x, t.y);
  await dialog();
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await dialog();
  }
  await close();
  await page.setViewport({
    width: 320,
    height: 568,
    isMobile: true,
    hasTouch: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await overflow("text200");
  await click("Tambah pengguna");
  await dialog();
  await close();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await go();
  await loaded();
  await set(".search-field input", "user-41");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-41",
  );
  await loaded();
  assert.equal(await page.$$eval(".users-table tbody tr", (n) => n.length), 1);
  await click("Reset filter");
  await loaded();
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-01",
  );
  const roleSelect = ".list-filters .toolbar>label:nth-of-type(1) select",
    statusSelect = ".list-filters .toolbar>label:nth-of-type(2) select",
    sortSelect = ".list-filters .toolbar>label:nth-of-type(3) select";
  await page.select(sortSelect, "desc");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-41",
  );
  await click("Reset filter");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-01",
  );
  await page.select(roleSelect, "admin");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-pagination")
      ?.textContent.includes("1 pengguna"),
  );
  await click("Reset filter");
  await loaded();
  await page.waitForFunction(() =>
    document
      .querySelector(".users-pagination")
      ?.textContent.includes("41 pengguna"),
  );
  await page.select(statusSelect, "true");
  await loaded();
  await click("Berikutnya");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-pagination")
      ?.textContent.includes("Halaman 2"),
  );
  await loaded();
  await click("Berikutnya");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-41",
  );
  await loaded();
  await confirmMutation("Arsipkan user-41");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-pagination")
      ?.textContent.includes("Halaman 2 dari 2"),
  );
  await loaded();
  await click("Reset filter");
  await loaded();
  await set(".search-field input", "user-41");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-table tbody tr")
      ?.textContent.includes("Diarsipkan"),
  );
  await confirmMutation("Aktifkan user-41");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-table tbody tr")
      ?.textContent.includes("Aktif"),
  );
  await click("Reset filter");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table tbody tr th")?.textContent ===
      "user-01",
  );
  await loaded();
  mutationMode = "reject";
  await click("Nonaktifkan user-01");
  await dialog();
  await click("Konfirmasi", "[role=dialog]");
  await page.waitForSelector("[role=dialog] [role=alert]");
  assert(
    (await page.$eval("[role=dialog]", (e) => e.textContent)).includes(
      "Admin aktif terakhir",
    ),
  );
  await close();
  mutationMode = "ok";
  await click("Ubah nama user-02");
  await dialog();
  await set("[role=dialog] input[name=full_name]", "Nama Diperbarui");
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await loaded();
  assert(
    (await page.$eval(".users-table", (e) => e.textContent)).includes(
      "Nama Diperbarui",
    ),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "users-list-title",
  );
  await click("Tambah pengguna");
  await dialog();
  await fillCreate();
  await set("[role=dialog] input[name=full_name]", "   ");
  const beforeInvalid = count("create");
  await click("Simpan", "[role=dialog]");
  await page.waitForSelector("[role=dialog] input[aria-invalid=true]");
  assert.equal(count("create"), beforeInvalid);
  await scan("invalid form");
  await set("[role=dialog] input[name=full_name]", "Nama Baru");
  let releaseWrite;
  writeHold = new Promise((resolve) => (releaseWrite = resolve));
  const beforeCreate = count("create");
  await page.evaluate(() => {
    const f = document.querySelector("[role=dialog] form");
    for (let i = 0; i < 2; i++)
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("[role=dialog] fieldset")?.disabled,
  );
  assert.equal(count("create"), beforeCreate + 1);
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  releaseWrite();
  writeHold = null;
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await loaded();
  assert.equal(
    calls.filter((c) => c.operation === "create").at(-1).payload.username,
    "new-user",
  );
  infoDelay = 500;
  await click("Kirim ulang undangan user-02");
  await dialog();
  await page.waitForSelector("[role=dialog] [role=status]");
  await close();
  await click("Kirim ulang undangan user-03");
  await dialog();
  infoDelay = 0;
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("user-03@example.test"),
  );
  await sleep(600);
  assert(
    !(await page.$eval("[role=dialog]", (e) => e.textContent)).includes(
      "user-02@example.test",
    ),
  );
  await close();
  mutationMode = "confirmed";
  await click("Kirim ulang undangan user-02");
  await dialog();
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Email sudah dikonfirmasi"),
  );
  assert(
    await page.$$eval(
      "[role=dialog] button",
      (buttons) =>
        buttons.find((e) => e.textContent.trim() === "Kirim undangan").disabled,
    ),
  );
  await close();
  mutationMode = "ok";
  await click("Kirim ulang undangan user-02");
  await dialog();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[role=dialog] button")].some(
      (e) => e.textContent.trim() === "Kirim undangan" && !e.disabled,
    ),
  );
  const beforeInvite = count("resend_invitation");
  writeHold = new Promise((resolve) => (releaseWrite = resolve));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role=dialog] button")].find(
      (e) => e.textContent.trim() === "Kirim undangan",
    );
    b.click();
    b.click();
  });
  await page.waitForFunction(() =>
    document.querySelector("[role=dialog]")?.textContent.includes("Mengirim"),
  );
  assert.equal(count("resend_invitation"), beforeInvite + 1);
  releaseWrite();
  writeHold = null;
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Undangan berhasil"),
  );
  await click("Periksa status lagi", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Undangan baru diproses"),
  );
  assert(
    await page.$$eval(
      "[role=dialog] button",
      (n) => n.find((e) => e.textContent.trim() === "Kirim undangan").disabled,
    ),
  );
  await close();
  const bulk =
    "import-a\tNama A\ta@example.test\tstudent\t" +
    classId +
    "\nimport-b\tNama B\tb@example.test\tstudent\t" +
    classId;
  await set(".users-import textarea", bulk);
  previewMode = "missing";
  await click("Pratinjau");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-import")
      ?.textContent.includes("Pemeriksaan server belum lengkap"),
  );
  assert(
    await page.$$eval(
      ".users-import button",
      (nodes) =>
        nodes.find((e) => e.textContent.trim() === "Impor baris valid")
          .disabled,
    ),
  );
  previewMode = "ok";
  await click("Pratinjau");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-import")
      ?.textContent.includes("2 baris valid"),
  );
  const beforeImport = count("create");
  await click("Impor baris valid (2)");
  await page.waitForFunction(() =>
    document.querySelector(".users-report")?.textContent.includes("Berhasil"),
  );
  await page.waitForFunction(() =>
    document.querySelector(".users-import")?.textContent.includes("2 berhasil"),
  );
  assert.equal(count("create"), beforeImport + 2);
  const refs = await page.$$eval(
    '.users-import a[download="referensi-kelas.tsv"]',
    (n) => decodeURIComponent(n[0].href.split(",")[1]),
  );
  assert(refs.includes("'=2+2"));
  assert(await page.$('a[download="hasil-impor-pengguna.tsv"]'));
  await set(
    ".users-import textarea",
    "uncertain-a\tNama A\tua@example.test\tstudent\t" +
      classId +
      "\nuncertain-b\tNama B\tub@example.test\tstudent\t" +
      classId,
  );
  await click("Pratinjau");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-import")
      ?.textContent.includes("2 baris valid"),
  );
  mutationMode = "uncertain";
  const beforeUnknown = count("create");
  await click("Impor baris valid (2)");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-report")
      ?.textContent.includes("Belum diproses"),
  );
  assert.equal(count("create"), beforeUnknown + 1);
  assert(
    !(await page.$eval(".users-import", (e) => e.textContent)).includes(
      "SECRET_PROVIDER_ERROR",
    ),
  );
  mutationMode = "ok";
  await loaded();
  mutationMode = "uncertain";
  await click("Tambah pengguna");
  await dialog();
  await fillCreate("Uncertain-Single");
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("belum dapat dipastikan"),
  );
  assert(
    await page.$$eval(
      "[role=dialog] button",
      (n) => n.find((e) => e.textContent.trim() === "Simpan").disabled,
    ),
  );
  await close();
  mutationMode = "ok";
  await click("Muat ulang");
  await loaded();
  classMode = "error";
  await go();
  await loaded();
  await page.waitForFunction(() =>
    document
      .querySelector(".users-import")
      ?.textContent.includes("Daftar kelas belum dapat dimuat"),
  );
  await click("Tambah pengguna");
  await dialog();
  assert(
    await page.$$eval(
      "[role=dialog] button",
      (n) => n.find((e) => e.textContent.trim() === "Simpan").disabled,
    ),
  );
  classMode = "ok";
  await click("Muat ulang kelas", "[role=dialog]");
  await page.waitForFunction(
    () =>
      document.querySelector("[role=dialog] select[name=class_id]")?.options
        .length > 1,
  );
  await close();
  for (const failure of ["empty", "error", "malformed", "html"]) {
    mode = failure;
    await go();
    await loaded();
    if (failure === "empty") assert(await page.$(".empty-state"));
    else {
      assert(await page.$(".list-filters [role=alert]"));
      assert(
        !(await page.$eval(".users-page", (e) => e.textContent)).includes(
          "SECRET_SQL_ERROR",
        ),
      );
    }
    await overflow(failure);
    mode = "ok";
    await click("Muat ulang");
    await loaded();
    assert.equal(
      await page.$$eval(".users-table tbody tr", (n) => n.length),
      20,
    );
  }
  // Hold the intercepted read explicitly; its start is observed before responding.
  let releaseRead;
  readHold = new Promise((resolve) => (releaseRead = resolve));
  await click("Muat ulang");
  await page.waitForFunction(
    () =>
      document.querySelector(".users-table")?.getAttribute("aria-busy") ===
      "true",
  );
  assert.equal(await page.$$eval(".users-table tbody tr", (n) => n.length), 0);
  releaseRead();
  readHold = null;
  await loaded();
  await click("Muat ulang kelas");
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".users-import")
        ?.textContent.includes("Daftar kelas belum dapat dimuat") &&
      !document
        .querySelector(".users-import")
        ?.textContent.includes("Memuat kelas"),
  );
  await page.evaluate(() => {
    const original = setTimeout;
    window.setTimeout = (fn, ms, ...args) =>
      original(fn, ms === 35000 ? 80 : ms, ...args);
  });
  await click("Tambah pengguna");
  await dialog();
  await fillCreate("Timeout-User");
  writeHold = new Promise((resolve) => (releaseWrite = resolve));
  const beforeTimeout = count("create");
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("belum dapat dipastikan"),
  );
  assert.equal(count("create"), beforeTimeout + 1);
  releaseWrite();
  writeHold = null;
  await close();
  users = seed();
  await page.setViewport({ width: 320, height: 900 });
  await go("teacher");
  await loaded();
  await scan("teacher final");
  await page.screenshot({ path: "/tmp/users-mobile.png", fullPage: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await go();
  await loaded();
  await scan("admin final");
  await page.screenshot({ path: "/tmp/users-desktop.png", fullPage: true });
  // An unmount halts a batch after its current request; no later rows are submitted.
  await set(
    ".users-import textarea",
    "leave-a\tNama A\tla@example.test\tstudent\t" +
      classId +
      "\nleave-b\tNama B\tlb@example.test\tstudent\t" +
      classId,
  );
  await click("Pratinjau");
  await page.waitForFunction(() =>
    document
      .querySelector(".users-import")
      ?.textContent.includes("2 baris valid"),
  );
  writeHold = new Promise((resolve) => (releaseWrite = resolve));
  const beforeLeave = count("create");
  await click("Impor baris valid (2)");
  await page.waitForFunction(() =>
    document.querySelector(".users-import")?.textContent.includes("Mengimpor"),
  );
  for (let n = 0; n < 100 && count("create") === beforeLeave; n++)
    await sleep(20);
  assert.equal(count("create"), beforeLeave + 1);
  await page.goto(origin + "/", { waitUntil: "networkidle0" });
  releaseWrite();
  writeHold = null;
  await sleep(300);
  assert.equal(count("create"), beforeLeave + 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS users production page components: Admin/Teacher; widths320/390/768/1024/1440, short/orientation/text200/touch/axe; literal search/filter/sort/reset/pagination/clamp, create/edit/status/archive, invitation race/eligibility/single-flight, TSV preview/import/partial/uncertain/cancel, class/list failure/retry/timeout; APIs simulated, no real invitations",
  );
} catch (e) {
  try {
    const p = (await browser.pages()).at(-1);
    await p.screenshot({ path: "/tmp/users-failure.png", fullPage: false });
    console.error(
      await p.evaluate(() => ({
        body: getComputedStyle(document.body).pointerEvents,
        button: [...document.querySelectorAll("button")]
          .filter((e) => e.textContent.trim() === "Tambah pengguna")
          .map((e) => {
            const r = e.getBoundingClientRect();
            return {
              disabled: e.disabled,
              rect: { x: r.x, y: r.y, width: r.width, height: r.height },
              hit: document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.outerHTML.slice(0, 250),
            };
          }),
      })),
    );
  } catch {}
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    browser?.process()?.kill("SIGKILL");
  } catch {}
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
  try {
    if (server) process.kill(-server.pid, "SIGTERM");
  } catch {}
  process.exit(process.exitCode || 0);
}
