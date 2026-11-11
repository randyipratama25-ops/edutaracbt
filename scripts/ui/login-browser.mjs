import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  createWriteStream,
} from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axe from "axe-core";
const port = 22000 + Math.floor(Math.random() * 5000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-login-${Date.now()}`;
const originals = Object.fromEntries(
  ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
    p,
    existsSync(p) ? readFileSync(p, "utf8") : null,
  ]),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, browser, builder;
try {
  const log = createWriteStream("/tmp/login-browser-dev.log");
  // Verify the deployed rendering path, including no-JS fallback, rather than dev streaming.
  builder = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    detached: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      EDUTARA_UI_TEST_DIST: dist,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  builder.stdout.pipe(log, { end: false });
  builder.stderr.pipe(log, { end: false });
  const buildCode = await new Promise((resolve, reject) => {
    builder.once("exit", resolve);
    builder.once("error", reject);
  });
  if (buildCode !== 0) throw Error("Login browser build failed; see /tmp/login-browser-dev.log");
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
      detached: process.platform !== "win32",
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
            signal: AbortSignal.timeout(2000),
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
  const page = await browser.newPage(),
    errors = [],
    posts = [];
  let loginMode = "failure",
    recoverMode = "success",
    delay = 0;
  page.on("pageerror", (e) => { errors.push(e.message); console.error("Browser error:", e.message); });
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (
      ["/dashboard", "/student", "/supervisor"].includes(u.pathname) &&
      r.isNavigationRequest()
    )
      return void r.respond({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Destination</title><p>Authenticated destination fixture</p>",
      });
    if (!u.pathname.startsWith("/api/")) return void r.continue();
    const input = JSON.parse(r.postData() || "{}"),
      mode = u.pathname.endsWith("/login") ? loginMode : recoverMode;
    posts.push({ path: u.pathname, input });
    await sleep(delay);
    try {
      if (mode === "network") return void r.abort("failed");
      if (mode === "html")
        return void r.respond({
          status: 502,
          contentType: "text/html",
          body: "<html>Unexpected proxy response</html>",
        });
      if (mode === "external")
        return void r.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { next: "https://outside.invalid" },
          }),
        });
      const status = mode === "failure" ? 401 : mode === "rate" ? 429 : 200,
        data = u.pathname.endsWith("/login")
          ? {
              next:
                input.context === "student"
                  ? "/student"
                  : input.context === "supervisor"
                    ? "/supervisor"
                    : "/dashboard",
            }
          : { message: "Do not expose account details" };
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
                    status === 429
                      ? "Coba lagi dalam 15 menit."
                      : "Username atau password salah, atau akun tidak aktif.",
                },
              },
        ),
      });
    } catch {
      /* Client may have aborted the pending response. */
    }
  });
  const click = async (text) => {
    const h = await page.evaluateHandle(
      (t) =>
        [...document.querySelectorAll("button")].find(
          (e) =>
            e.textContent.trim() === t || e.getAttribute("aria-label") === t,
        ),
      text,
    );
    assert(await h.evaluate((e) => !!e), text);
    await h.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await h.click();
    await h.dispose();
  };
  const goto = async (query = "") => {
    await page.goto(origin + "/login" + query, { waitUntil: "networkidle0" });
    await page.waitForSelector("#login-username");
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
  };
  const overflow = async (label) =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      label + " overflow",
    );
  const dialog = async (label) => {
    await page.waitForSelector("[role=dialog]");
    await overflow(label);
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
      label + " modal bounds",
    );
  };
  const scan = async (label) => {
    await page.addScriptTag({ content: axe.source });
    const r = await page.evaluate(
      async () =>
        await window.axe.run(
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
      label + " axe",
    );
  };
  const fill = async (name = "guru_1") => {
    await page.$eval("#login-username", (e) => (e.value = ""));
    await page.type("#login-username", name);
    await page.type("#login-password", " Password unchanged ");
  };
  for (const [width, height] of [
    [320, 900],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [844, 390],
    [320, 320],
  ]) {
    await page.setViewport({ width, height });
    await goto();
    await overflow(`${width}x${height}`);
    assert.equal(await page.$eval("form", (f) => f.method), "post");
    await click("Lupa password");
    await dialog(`${width}x${height}`);
    if (width === 320) await scan("recovery " + height);
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === "Lupa password",
    );
  }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await goto();
  const p = await page.$eval("[aria-haspopup=dialog]", (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(p.x, p.y);
  await dialog("touch");
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  assert(
    await page.evaluate(
      () => !!document.activeElement.closest("[role=dialog]"),
    ),
  );
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await dialog("orientation");
  }
  await page.keyboard.press("Escape");
  await page.setViewport({
    width: 320,
    height: 568,
    isMobile: true,
    hasTouch: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await overflow("text 200%");
  await click("Lupa password");
  await dialog("text 200%");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await goto("?error=activation");
  await page.waitForSelector("#login-feedback[role=alert]");
  await scan("activation");
  await goto("?error=NEVER_RENDER_THIS");
  assert(
    !(await page.$eval("body", (e) => e.innerText)).includes(
      "NEVER_RENDER_THIS",
    ),
  );
  await page.evaluate(() =>
    localStorage.setItem("edutara_username", "x".repeat(1000)),
  );
  await goto();
  assert.equal(await page.$eval("#login-username", (e) => e.value), "");
  await page.evaluate(() =>
    localStorage.setItem("edutara_username", " GURU_1 "),
  );
  await goto();
  assert.equal(await page.$eval("#login-username", (e) => e.value), "guru_1");
  await page.click("input[type=checkbox]");
  await page.waitForFunction(
    () => !document.querySelector("input[type=checkbox]").checked,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("edutara_username")),
    null,
  );
  await goto();
  await fill("   ");
  const invalidBefore = posts.length;
  await click("Masuk");
  await page.waitForSelector("#login-username[aria-invalid=true]");
  assert.equal(posts.length, invalidBefore);
  await scan("invalid username");
  await goto();
  await fill();
  await click("Tampilkan password");
  assert.equal(await page.$eval("#login-password", (e) => e.type), "text");
  await click("Sembunyikan password");
  assert.equal(await page.$eval("#login-password", (e) => e.type), "password");
  delay = 350;
  const loginBefore = posts.length;
  await page.evaluate(() => {
    const f = document.querySelector("form");
    for (let i = 0; i < 2; i++)
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#login-username")?.disabled,
  );
  assert(await page.$eval("input[type=checkbox]", (e) => e.disabled));
  await page.waitForSelector("#login-feedback[role=alert]");
  assert.equal(posts.length, loginBefore + 1);
  delay = 0;
  loginMode = "html";
  await click("Masuk");
  await page.waitForFunction(() =>
    document
      .querySelector("#login-feedback")
      ?.textContent.includes("belum dapat dipastikan"),
  );
  loginMode = "external";
  await click("Masuk");
  await page.waitForFunction(() =>
    document
      .querySelector("#login-feedback")
      ?.textContent.includes("Respons login tidak sesuai"),
  );
  assert.equal(new URL(page.url()).pathname, "/login");
  loginMode = "network";
  await click("Masuk");
  await page.waitForFunction(() =>
    document
      .querySelector("#login-feedback")
      ?.textContent.includes("belum dapat dipastikan"),
  );
  delay = 900;
  await click("Lupa password");
  await page.waitForSelector("[role=dialog]");
  const recoveryBefore = posts.length;
  await page.evaluate(() => {
    const f = document.querySelector("[role=dialog] form");
    for (let i = 0; i < 2; i++)
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#login-recovery-username")?.disabled,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await click("Lupa password");
  await page.waitForFunction(() =>
    document
      .querySelector("#recovery-feedback")
      ?.textContent.includes("Jika akun tersedia"),
  );
  assert.equal(posts.length, recoveryBefore + 1);
  assert(
    !(await page.$eval("#recovery-feedback", (e) => e.textContent)).includes(
      "Do not expose",
    ),
  );
  await scan("recovery success");
  delay = 0;
  recoverMode = "rate";
  await click("Kirim petunjuk pemulihan");
  await page.waitForFunction(() =>
    document
      .querySelector("#recovery-feedback")
      ?.textContent.includes("15 menit"),
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const original = setTimeout;
    window.__loginTimer = original;
    window.setTimeout = (fn, ms, ...args) =>
      original(fn, ms === 35000 ? 80 : ms, ...args);
  });
  recoverMode = "success";
  delay = 500;
  await click("Lupa password");
  const timeoutBefore = posts.length;
  await click("Kirim petunjuk pemulihan");
  await page.waitForFunction(() =>
    document
      .querySelector("#recovery-feedback")
      ?.textContent.includes("Periksa inbox dan spam"),
  );
  assert.equal(posts.length, timeoutBefore + 1);
  assert.equal(
    await page.$eval("#login-recovery-username", (e) => e.disabled),
    false,
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window.setTimeout = window.__loginTimer));
  // Mobile student login is gated before any authentication request is sent.
  const desktopAgent = await browser.userAgent();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36");
  await page.setViewport({ width: 390, height: 844, isLandscape: false });
  await goto();
  await fill("orientation_student");
  await page.select("#login-context", "student");
  await page.waitForSelector("#login-orientation");
  const orientationPosts = posts.length;
  assert(await page.$eval("button[aria-describedby=login-orientation]", e => e.disabled));
  await page.$eval(".login-form", e => e.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await sleep(100);
  assert.equal(posts.length, orientationPosts);
  for (const context of ["staff", "supervisor"]) {
    await page.select("#login-context", context);
    assert.equal(await page.$eval(".login-form > button", e => e.disabled), false);
  }
  await page.select("#login-context", "student");
  await page.setViewport({ width: 844, height: 390, isLandscape: true });
  await page.waitForFunction(() => !document.querySelector("#login-orientation"));
  assert.equal(await page.$eval("#login-username", e => e.value), "orientation_student");
  // A response arriving after rotation must wait for landscape without another POST.
  loginMode = "success";
  delay = 300;
  const rotationLoginBefore = posts.length;
  await click("Masuk");
  await page.waitForFunction(() => document.querySelector(".login-form")?.getAttribute("aria-busy") === "true");
  await page.setViewport({ width: 390, height: 844, isLandscape: false });
  await page.waitForFunction(() => document.querySelector("#login-feedback")?.textContent.includes("Putar perangkat ke landscape"));
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.equal(posts.length, rotationLoginBefore + 1);
  await page.setViewport({ width: 844, height: 390, isLandscape: true });
  await page.waitForFunction(() => location.pathname === "/student");
  assert.equal(posts.length, rotationLoginBefore + 1);
  await page.setUserAgent(desktopAgent);
  loginMode = "success";
  delay = 0;
  for (const context of ["staff", "student", "supervisor"]) {
    await goto();
    await fill("original_user");
    await page.$eval("#login-username", (e) => (e.value = "AUTOFILL_USER"));
    await page.select("#login-context", context);
    if (!(await page.$eval("input[type=checkbox]", (e) => e.checked)))
      await page.click("input[type=checkbox]");
    await click("Masuk");
    await page.waitForFunction(() =>
      ["/dashboard", "/student", "/supervisor"].includes(location.pathname),
    );
    assert.equal(posts.at(-1).input.username, "autofill_user");
    assert.equal(posts.at(-1).input.password, " Password unchanged ");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("edutara_username")),
      "autofill_user",
    );
  }
  await goto();
  await page.evaluate(() => localStorage.removeItem("edutara_username"));
  await goto();
  await fill();
  delay = 500;
  await click("Lupa password");
  await click("Kirim petunjuk pemulihan");
  await page.keyboard.press("Escape");
  await page.click('a[href="/"]');
  await page.waitForSelector("#home-title");
  await sleep(550);
  await goto();
  assert.equal(await page.$$eval("#recovery-feedback", (e) => e.length), 0);
  const hook = await page.evaluateOnNewDocument(() => {
    for (const name of ["getItem", "setItem", "removeItem"])
      Storage.prototype[name] = () => {
        throw Error("Storage disabled");
      };
  });
  await goto();
  await fill();
  delay = 0;
  await click("Masuk");
  await page.waitForFunction(() => location.pathname === "/dashboard");
  await page.removeScriptToEvaluateOnNewDocument(hook.identifier);
  await page.setViewport({ width: 320, height: 844 });
  await goto();
  await page.$eval(".login-brand p", (e) => (e.textContent = "M".repeat(100)));
  await page.$eval(
    ".login-card>.muted",
    (e) => (e.textContent = "Subtitle ".repeat(22)),
  );
  await overflow("long branding");
  await goto();
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
  await scan("login mobile");
  await page.screenshot({ path: "/tmp/login-mobile.png", fullPage: true });
  await page.setViewport({ width: 1440, height: 900 });
  await goto();
  await scan("login desktop");
  await page.screenshot({ path: "/tmp/login-desktop.png", fullPage: true });
  const nojs = await browser.newPage();
  await nojs.setJavaScriptEnabled(false);
  await nojs.goto(origin + "/login", { waitUntil: "networkidle0" });
  assert.equal(await nojs.$eval("form", (e) => e.method), "post");
  assert(
    (await nojs.$eval("body", (e) => e.innerText)).includes(
      "Aktifkan JavaScript",
    ),
  );
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS real /login 320/390/768/1440, short/orientation/text200/touch/axe, activation/storage/autofill, single-flight, response errors, recovery close/reopen/rate/timeout/unmount, mobile student portrait/landscape gate, staff/supervisor unaffected, all contexts/password bytes and POST/no-JS (auth APIs simulated)",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) {
    try {
      await Promise.race([browser.close(), sleep(5000)]);
      browser.process()?.kill("SIGKILL");
    } catch {}
  }
  if (server) {
    try {
      if (process.platform === "win32") server.kill("SIGTERM");
      else process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((r) => server.once("exit", r)),
      sleep(1500),
    ]);
  }
  rmSync(dist, { recursive: true, force: true });
  for (const [p, s] of Object.entries(originals)) {
    if (s === null) rmSync(p, { force: true });
    else writeFileSync(p, s);
  }
}
