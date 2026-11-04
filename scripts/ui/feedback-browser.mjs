import fs from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axe from "axe-core";
const route = `app/feedback-check-${Date.now()}`,
  path = "/" + route.slice(4),
  dist = `.next-stage2-feedback-${Date.now()}`,
  port = 25000 + Math.floor(Math.random() * 1000),
  origin = `http://127.0.0.1:${port}`,
  originals = Object.fromEntries(
    ["next-env.d.ts", "tsconfig.json", "AGENTS.md"].map((p) => [
      p,
      fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null,
    ]),
  );
let server, browser, page;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  fs.mkdirSync(route);
  fs.writeFileSync(
    route + "/page.tsx",
    `"use client";import {useState} from 'react';import {StateCard,FeedbackMessage,type StateKind} from '../../components/feedback/state';import {ValidatedForm} from '../../components/feedback/validated-form';import {Dialog} from '../../components/ui/dialog';import {Button} from '../../components/ui/button';import {feedbackFetch} from '../../lib/client/feedback-transport';import {ListFilters,SearchField} from '../../components/ui/list-filters';import {RouteFailure} from '../../components/feedback/route-failure';
export default function Page(){const[kind,setKind]=useState<StateKind>('empty'),[open,setOpen]=useState(false),[draft,setDraft]=useState(''),[message,setMessage]=useState(''),[tone,setTone]=useState<StateKind>('info'),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(false);async function request(){setBusy(true);setMessage('');try{const r=await feedbackFetch('/api/feedback-test',{method:'POST',body:JSON.stringify({draft})});const j=await r.json();if(!r.ok||j.data?.saved!==true)throw Error('Permintaan belum berhasil.');setTone('success');setMessage('Data berhasil disimpan.');}catch{setTone('error');setMessage('Data belum dapat diproses. Periksa hasil sebelum mencoba lagi.');}finally{setBusy(false);}}
return <main id="main-content" tabIndex={-1} className="workspace stack"><h1>Status aplikasi</h1><label>Pilih kondisi<select value={kind} onChange={e=>setKind(e.target.value as StateKind)}>{['empty','loading','error','offline','slow','no-results','permission','session','validation','success'].map(k=><option key={k}>{k}</option>)}</select></label><StateCard kind={kind}/><section className="panel stack"><ValidatedForm className="stack" onSubmit={e=>{e.preventDefault();void request();}}><label>Nama<input required minLength={3} id="feedback-name" value={draft} onChange={e=>setDraft(e.target.value)}/></label><label>Email<input required type="email" id="feedback-email"/></label>{kind==='validation'&&<label>Catatan tambahan<input required/></label>}<Button disabled={busy} type="submit">Simpan data</Button></ValidatedForm><FeedbackMessage tone={tone}>{message}</FeedbackMessage><Button type="button" variant="outline" onClick={()=>setOpen(true)}>Buka modal</Button></section><ListFilters label="contoh" active={search?['Pencarian']:[]} total={search?0:1} onReset={()=>setSearch('')}><SearchField label="Cari contoh" value={search} onChange={setSearch}/></ListFilters><RouteFailure retry={()=>setRetry(true)}/>{retry&&<FeedbackMessage tone="success">Halaman dimuat ulang.</FeedbackMessage>}<Dialog open={open} onOpenChange={setOpen} title="Formulir modal" description="Lengkapi nama untuk melanjutkan."><ValidatedForm className="stack" onSubmit={e=>e.preventDefault()}><label>Nama di modal<input required/></label><Button type="submit">Validasi modal</Button></ValidatedForm></Dialog></main>;}`,
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
    await sleep(500);
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
  let mode = "ok",
    session = "valid",
    held = [];
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/feedback-test") {
      calls.push({ method: r.method(), body: r.postData() });
      if (mode === "hold") {
        held.push(r);
        return;
      }
      return void r.respond({
        status: mode === "denied" ? 403 : mode === "expired" ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: mode === "ok",
          data: { saved: mode === "ok" },
        }),
      });
    }
    if (u.pathname === "/api/auth/session") {
      calls.push({ session: true });
      return void r.respond({
        status: session === "valid" ? 200 : session === "expired" ? 401 : 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: session === "valid",
          data: { authenticated: session === "valid" },
        }),
      });
    }
    void r.continue();
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
  const goto = async () => {
    await page.goto(origin + path, { waitUntil: "networkidle0" });
    await page.waitForSelector("#feedback-name");
  };
  const fits = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "overflow",
    );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await goto();
    for (const kind of [
      "empty",
      "loading",
      "error",
      "offline",
      "slow",
      "no-results",
      "permission",
      "session",
      "validation",
      "success",
    ]) {
      await page.select("main>label select", kind);
      await page.waitForSelector('main>.state-card[data-state="' + kind + '"]');
      await fits();
    }
  }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await goto();
  await page.addScriptTag({ content: axe.source });
  for (const kind of [
    "empty",
    "loading",
    "error",
    "offline",
    "slow",
    "no-results",
    "permission",
    "session",
    "validation",
    "success",
  ]) {
    await page.select("main>label select", kind);
    const scan = await page.evaluate(() =>
      window.axe.run(document.querySelector("main"), {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      }),
    );
    assert.deepEqual(
      scan.violations.map((v) => v.id),
      [],
      kind,
    );
  }
  const before = calls.length;
  await click("Simpan data");
  await page.waitForSelector(".form-validation-summary");
  assert.equal(calls.length, before);
  assert.equal(
    await page.$$(".form-validation-summary li").then((a) => a.length),
    2,
  );
  await click("Nama: Wajib diisi.", ".form-validation-summary");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "feedback-name",
  );
  await page.type("#feedback-name", "Draf aman");
  await page.type("#feedback-email", "invalid");
  await click("Simpan data");
  await page.waitForFunction(() =>
    document
      .querySelector(".form-validation-summary")
      ?.textContent.includes("format"),
  );
  await page.$eval("#feedback-email", (e) => {
    e.select();
  });
  await page.type("#feedback-email", "guru@example.invalid");
  await page.waitForFunction(
    () => !document.querySelector(".form-validation-summary"),
  );
  await click("Simpan data");
  await page.waitForFunction(() =>
    document
      .querySelector(".feedback-message[data-state=success]")
      ?.textContent.includes("berhasil disimpan"),
  );
  await page.select('main>label select','validation');
  await page.waitForFunction(()=>document.querySelector('.form-validation-summary')?.textContent.includes('Catatan tambahan'));
  await page.select('main>label select','success');
  await page.waitForFunction(()=>!document.querySelector('.form-validation-summary'));
  await click("Coba lagi");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Halaman dimuat ulang."),
  );
  await page.type(".search-field input", "tidak cocok");
  await page.waitForSelector(".filter-summary [data-state=no-results]");
  await click("Reset filter");
  assert.equal(await page.$eval(".search-field input", (e) => e.value), "");
  await click("Buka modal");
  await page.waitForSelector("[role=dialog]");
  await click("Validasi modal", "[role=dialog]");
  await page.waitForSelector("[role=dialog] .form-validation-summary");
  await page.setOfflineMode(true);
  await page.waitForSelector(
    "[role=dialog] .connection-notice [data-state=offline]",
  );
  assert.equal(await page.$eval("#feedback-name", (e) => e.value), "Draf aman");
  await page.setOfflineMode(false);
  await page.waitForFunction(
    () => !document.querySelector("[role=dialog] .connection-notice"),
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { hidden: true });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Buka modal",
  );
  mode = "hold";
  await click("Simpan data");
  await page.waitForSelector(".global-feedback [data-state=slow]", {
    timeout: 12000,
  });
  assert.equal(await page.$eval("#feedback-name", (e) => e.value), "Draf aman");
  await held
    .shift()
    .respond({
      status: 200,
      contentType: "application/json",
      body: '{"success":true,"data":{"saved":true}}',
    });
  await page.waitForFunction(
    () => !document.querySelector(".global-feedback [data-state=slow]"),
  );
  mode = "ok";
  for (const [m, s, kind] of [
    ["denied", "valid", "permission"],
    ["expired", "expired", "session"],
    ["denied", "outage", null],
  ]) {
    await goto();
    mode = m;
    session = s;
    await page.evaluate(() =>
      history.replaceState(null, "", "/dashboard/feedback-state-check"),
    );
    await sleep(100);
    await page.type("#feedback-name", "Draf tersimpan di isian");
    await page.type("#feedback-email", "guru@example.invalid");
    await click("Simpan data");
    if (kind) {
      await page.waitForSelector(
        '.global-feedback [data-state="' + kind + '"]',
      );
      assert.equal(
        await page.$eval("#feedback-name", (e) => e.value),
        "Draf tersimpan di isian",
      );
      if (kind === "session") {
        assert.equal(
          await page.$eval(".global-feedback a", (e) => e.target),
          "_blank",
        );
        session = "outage";
        await click("Periksa sesi lagi", ".global-feedback");
        await page.waitForFunction(() =>
          document
            .querySelector(".global-feedback")
            ?.textContent.includes("Sesi belum dapat diperiksa"),
        );
        session = "valid";
        await click("Periksa sesi lagi", ".global-feedback");
        await page.waitForFunction(
          () =>
            !document.querySelector(".global-feedback [data-state=session]"),
        );
      } else await click("Tutup pemberitahuan", ".global-feedback");
    } else {
      await sleep(500);
      assert.equal(await page.$(".global-feedback [data-state=session]"), null);
      assert.equal(
        await page.$(".global-feedback [data-state=permission]"),
        null,
      );
    }
  }
  mode = "ok";
  session = "valid";
  await goto();
  for (const [width, height] of [
    [844, 390],
    [320, 320],
    [390, 844],
  ]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await fits();
    await click("Buka modal");
    await page.waitForSelector("[role=dialog]");
    assert(
      await page.evaluate(() => {
        const r = document
          .querySelector("[role=dialog]")
          .getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.top >= 0 &&
          r.bottom <= innerHeight + 1
        );
      }),
    );
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { hidden: true });
  }
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await fits();
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.select("main>label select", "loading");
  assert.equal(
    await page.$eval(
      "main>.state-card .state-icon svg",
      (e) => getComputedStyle(e).animationName,
    ),
    "none",
  );
  await page.screenshot({ path: "/tmp/feedback-text200.png", fullPage: true });
  await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
  await page.select("main>label select", "empty");
  await page.screenshot({ path: "/tmp/feedback-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS feedback:10 states at320–1440,WCAG-tag scans,native required/email validation+focus,no invalid POST,success/retry,search reset,offline/modal/draft,8s slow response,permission vs expired vs auth outage,tab-new login,recheck,rotation,text200,reduced motion; API writes simulated",
  );
} catch (e) {
  console.error(e);
  try {
    await page?.screenshot({
      path: "/tmp/feedback-failure.png",
      fullPage: true,
    });
    console.log(
      await page.evaluate(() => document.body.innerText.slice(-2500)),
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
