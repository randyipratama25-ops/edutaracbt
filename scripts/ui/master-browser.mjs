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
const route = `app/master-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-master-${Date.now()}`,
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
    `import Master from '../dashboard/master-data/page';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><Master/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/master-browser-dev.log");
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  const id = (n) => `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let audience = "admin",
    mode = "ok",
    mutationMode = "ok",
    hold = null,
    heldRead = null,
    calls = [],
    next = 1000;
  const seed = () => ({
    classes: Array.from({ length: 41 }, (_, i) => ({
      id: id(i + 1),
      name:
        i === 0
          ? "Kelas " + "Panjang".repeat(10)
          : "Kelas " + String(i + 1).padStart(2, "0"),
      active: true,
    })),
    subjects: [
      { id: id(101), name: "IPS", active: true },
      { id: id(102), name: "Informatika", active: false },
    ],
    people: [
      { id: id(201), full_name: "Guru Aktif", role: "teacher", active: true },
      {
        id: id(202),
        full_name: "Guru Nonaktif",
        role: "teacher",
        active: false,
      },
      { id: id(203), full_name: "Siswa Aktif", role: "student", active: true },
      {
        id: id(204),
        full_name: "Siswa Nonaktif",
        role: "student",
        active: false,
      },
    ],
    assignments: Array.from({ length: 25 }, (_, i) => ({
      id: id(301 + i),
      teacher_id: id(i === 0 ? 202 : 201),
      class_id: id(i + 1),
      subject_id: id(101),
      active: true,
    })),
    enrollments: Array.from({ length: 25 }, (_, i) => ({
      id: id(401 + i),
      student_id: id(i === 0 ? 204 : 203),
      class_id: id(i + 1),
      active: true,
    })),
    canManage: true,
  });
  let data = seed();
  page.on("request", async (r) => {
    try {
      const u = new URL(r.url());
      if (u.pathname !== "/api/admin/master") return void r.continue();
      const payload = r.method() === "POST" ? JSON.parse(r.postData()) : null;
      calls.push({ method: r.method(), payload });
      const wait = payload ? hold : heldRead,
        current = mode,
        mutation = mutationMode;
      let status = 200,
        value;
      if (!payload)
        value =
          current === "empty"
            ? {
                classes: [],
                subjects: [],
                people: [],
                assignments: [],
                enrollments: [],
                canManage: audience === "admin",
              }
            : { ...structuredClone(data), canManage: audience === "admin" };
      else if (payload.kind === "classes" || payload.kind === "subjects") {
        const rows = data[payload.kind];
        if (mutation !== "reject") {
          if (payload.id) {
            Object.assign(
              rows.find((v) => v.id === payload.id),
              { name: payload.name, active: payload.active },
            );
            value = { id: payload.id };
          } else if (
            rows.some(
              (v) => v.name.toLowerCase() === payload.name.toLowerCase(),
            )
          ) {
            status = 422;
            value = "Nama sudah digunakan.";
          } else {
            const row = { id: id(next++), name: payload.name, active: true };
            rows.push(row);
            value = { id: row.id };
          }
        }
      } else {
        const key =
          payload.kind === "assignment" ? "assignments" : "enrollments";
        if (mutation !== "reject") {
          const existing = data[key].find((v) =>
            payload.id
              ? v.id === payload.id
              : v.class_id === payload.class_id &&
                (payload.kind === "assignment"
                  ? v.teacher_id === payload.user_id &&
                    v.subject_id === payload.subject_id
                  : v.student_id === payload.user_id),
          );
          if (existing) existing.active = payload.active ?? true;
          else
            data[key].push({
              id: id(next++),
              class_id: payload.class_id,
              active: true,
              ...(payload.kind === "assignment"
                ? {
                    teacher_id: payload.user_id,
                    subject_id: payload.subject_id,
                  }
                : { student_id: payload.user_id }),
            });
        }
        value = { saved: true };
      }
      if (payload && mutation === "reject") {
        status = 422;
        value = "Pilih referensi aktif yang tersedia.";
      }
      if (payload && mutation === "uncertain") {
        status = 503;
        value = "PRIVATE_DB_DETAIL";
      }
      if (!payload && current === "error") {
        status = 503;
        value = "PRIVATE_DB_DETAIL";
      }
      if (!payload && current === "malformed") value = { classes: null };
      if (wait) await wait;
      if (!payload && current === "html")
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
            ? { success: true, data: value }
            : { success: false, error: { message: value } },
        ),
      });
    } catch (e) {
      if (!String(e).includes("already handled")) errors.push(String(e));
    }
  });
  const main = ".master-page>section:first-child";
  const go = async (role = "admin") => {
    audience = role;
    await page.goto(origin + path + "?role=" + role, {
      waitUntil: "networkidle0",
    });
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.waitForSelector(".master-page");
  };
  const loaded = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector(".master-page .list-filters")
          ?.getAttribute("aria-busy") === "false",
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
    await h.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await h.click();
    await h.dispose();
  };
  const set = async (selector, value) => {
    await page.$eval(selector, (e) => (e.value = ""));
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
      "dialog bounded",
    );
    await overflow("dialog");
  };
  const close = async () => {
    await click("Tutup dialog", "[role=dialog]");
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
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
  const writes = () => calls.filter((c) => c.payload).length;
  for (const role of ["admin", "teacher"])
    for (const [width, height] of process.env.EDUTARA_MASTER_FOCUS
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
      assert(
        (await page.$eval(".master-relations", (e) => e.textContent)).includes(
          "Guru Nonaktif",
        ),
      );
      assert.equal(!!(await page.$(".master-assignment")), role === "admin");
      if (role === "admin") {
        await click("Tambah data");
        await dialog();
        assert.equal(
          await page.$eval("[role=dialog] form", (e) => e.method),
          "post",
        );
        if (width === 320) await scan("form " + role);
        await close();
      } else
        assert.equal(
          await page.$$eval(
            '.master-page button[aria-label^="Aktifkan "]',
            (n) => n.length,
          ),
          0,
        );
      if (width === 320) await scan("list " + role);
    }
  console.log("PASS master role layouts and dialogs");
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await go();
  await loaded();
  const target = await page.$$eval("button", (n) => {
    const e = n.find((e) => e.textContent.trim() === "Tambah data");
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(target.x, target.y);
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
  await click("Tambah data");
  await dialog();
  await close();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await go();
  await loaded();
  await set(main + " .search-field input", "Kelas");
  await click("Berikutnya", main);
  await click("Berikutnya", main);
  const selected = await page.$eval(
    ".master-main-table tbody th",
    (e) => e.textContent,
  );
  await click("Ubah atau arsipkan " + selected);
  await dialog();
  await set("[role=dialog] input[name=name]", "Rombel Baru");
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await loaded();
  await page.waitForFunction(() =>
    document
      .querySelector(".master-pagination")
      ?.textContent.includes("Halaman 2 dari 2"),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "master-list-title",
  );
  await click("Reset filter", main);
  await page.select(main + " select", "subjects");
  await loaded();
  await click("Tambah data");
  await dialog();
  await set("[role=dialog] input[name=name]", "  ");
  const beforeInvalid = writes();
  await click("Simpan", "[role=dialog]");
  await page.waitForSelector("[role=dialog] [role=alert]");
  assert.equal(writes(), beforeInvalid);
  await set("[role=dialog] input[name=name]", "Bahasa Arab");
  let release;
  hold = new Promise((r) => (release = r));
  const beforeSave = writes();
  await page.evaluate(() => {
    const f = document.querySelector("[role=dialog] form");
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("[role=dialog] fieldset")?.disabled,
  );
  assert.equal(writes(), beforeSave + 1);
  await page.keyboard.press("Escape");
  assert(await page.$("[role=dialog]"));
  release();
  hold = null;
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await loaded();
  assert.equal(calls.filter((c) => c.payload).at(-1).payload.kind, "subjects");
  await click("Ubah atau arsipkan Informatika");
  await dialog();
  await page.click("[role=dialog] input[name=active]");
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await loaded();
  assert(data.subjects.find((s) => s.name === "Informatika").active);
  const form = ".master-assignment form";
  assert(
    !(await page.$eval(form, (e) => e.textContent)).includes("Guru Nonaktif"),
  );
  await page.select(form + " [name=user_id]", id(201));
  await page.select(form + " [name=class_id]", id(2));
  await page.select(form + " [name=subject_id]", id(101));
  const beforeAssign = writes();
  await page.evaluate(() => {
    const f = document.querySelector(".master-assignment form");
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() =>
    document
      .querySelector(".master-assignment")
      ?.textContent.includes("Penugasan guru berhasil"),
  );
  await loaded();
  assert.equal(writes(), beforeAssign + 1);
  await page.select(form + " select:first-of-type", "enrollment");
  await page.select(form + " [name=user_id]", id(203));
  await page.select(form + " [name=class_id]", id(3));
  await click("Simpan penugasan", form);
  await page.waitForFunction(() =>
    document
      .querySelector(".master-assignment")
      ?.textContent.includes("Keanggotaan siswa berhasil"),
  );
  await loaded();
  assert.equal(
    calls.filter((c) => c.payload).at(-1).payload.kind,
    "enrollment",
  );
  for (const student of [false, true]) {
    const scope = student
      ? '[aria-label="Daftar keanggotaan siswa"]'
      : '[aria-label="Daftar penugasan guru"]';
    const label = await page.$eval(scope + " tbody button", (e) =>
      e.getAttribute("aria-label"),
    );
    await click(label, scope);
    await dialog();
    await click("Konfirmasi", "[role=dialog]");
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
    await loaded();
    await click("Berikutnya", scope);
    assert(
      (
        await page.$eval(scope + " .master-pagination", (e) => e.textContent)
      ).includes("Halaman 2"),
    );
  }
  await page.select(main + " select", "classes");
  await set(".master-bulk textarea", "Kelas 02\nBaru A\nbaru a\nBaru B");
  await click("Simpan data massal");
  await dialog();
  assert(
    (await page.$eval("[role=dialog]", (e) => e.textContent)).includes(
      "2 nama valid",
    ),
  );
  const beforeBulk = writes(),
    readsBefore = calls.filter((c) => !c.payload).length;
  await click("Konfirmasi simpan massal", "[role=dialog]");
  await page.waitForFunction(() =>
    document.querySelector(".master-bulk")?.textContent.includes("2 berhasil"),
  );
  await loaded();
  assert.equal(writes(), beforeBulk + 2);
  assert.equal(calls.filter((c) => !c.payload).length, readsBefore + 1);
  assert(await page.$(".master-report"));
  await set(".master-bulk textarea", "Belum Pasti A\nBelum Pasti B");
  await click("Simpan data massal");
  await dialog();
  mutationMode = "uncertain";
  const beforeUnknown = writes();
  await click("Konfirmasi simpan massal", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector(".master-report")
      ?.textContent.includes("Belum diproses"),
  );
  assert.equal(writes(), beforeUnknown + 1);
  mutationMode = "ok";
  await loaded();
  for (const failure of ["error", "malformed", "html", "empty"]) {
    mode = failure;
    await go();
    await loaded();
    if (failure === "empty") assert(await page.$(".empty-state"));
    else {
      assert(await page.$(main + " [role=alert]"));
      assert(
        !(await page.$eval(".master-page", (e) => e.textContent)).includes(
          "PRIVATE_DB_DETAIL",
        ),
      );
    }
    mode = "ok";
    await click("Muat ulang");
    await loaded();
    await page.waitForSelector(".master-main-table");
  }
  mode = "error";
  await click("Muat ulang");
  await page.waitForSelector(".master-page>section:first-child [role=alert]");
  await loaded();
  assert(
    (await page.$eval(".master-page", (e) => e.textContent)).includes(
      "data terakhir",
    ),
  );
  assert(
    await page.$$eval(
      main + " button",
      (n) => n.find((e) => e.textContent.trim() === "Tambah data").disabled,
    ),
  );
  mode = "ok";
  await click("Muat ulang");
  await page.waitForFunction(
    () =>
      !document.querySelector(".master-page>section:first-child [role=alert]"),
  );
  await loaded();
  await click("Tambah data");
  await dialog();
  await set("[role=dialog] input[name=name]", "Timeout Master");
  await page.evaluate(() => {
    const t = setTimeout;
    window.setTimeout = (fn, ms, ...args) =>
      t(fn, ms === 35000 ? 80 : ms, ...args);
  });
  hold = new Promise((r) => (release = r));
  const beforeTimeout = writes();
  await click("Simpan", "[role=dialog]");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=dialog]")
      ?.textContent.includes("belum dapat dipastikan"),
  );
  assert.equal(writes(), beforeTimeout + 1);
  release();
  hold = null;
  await close();
  data = seed();
  await page.setViewport({ width: 320, height: 900 });
  await go("teacher");
  await loaded();
  await scan("teacher final");
  await page.screenshot({ path: "/tmp/master-mobile.png", fullPage: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await go();
  await loaded();
  await scan("admin final");
  await page.screenshot({ path: "/tmp/master-desktop.png", fullPage: true });
  await set(".master-bulk textarea", "Tinggal A\nTinggal B");
  await click("Simpan data massal");
  await dialog();
  hold = new Promise((r) => (release = r));
  const beforeLeave = writes();
  await click("Konfirmasi simpan massal", "[role=dialog]");
  for (let i = 0; i < 100 && writes() === beforeLeave; i++) await sleep(20);
  assert.equal(writes(), beforeLeave + 1);
  await page.goto(origin + "/", { waitUntil: "networkidle0" });
  release();
  hold = null;
  await sleep(300);
  assert.equal(writes(), beforeLeave + 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS master production page: Admin/Teacher,320/390/768/1024/1440,short/orientation/text200/touch/axe; create/edit/archive/status,assignment/enrollment,read failure/retry/stale,bulk snapshot/partial/stop/cancel,timeout,single-flight,focus,pagination; API mutations simulated",
  );
} catch (e) {
  try {
    await page?.screenshot({
      path: "/tmp/master-failure.png",
      fullPage: false,
    });
  } catch {}
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(route, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
  try {
    browser?.process()?.kill("SIGKILL");
  } catch {}
  try {
    if (server) process.kill(-server.pid, "SIGTERM");
  } catch {}
  process.exit(process.exitCode || 0);
}
