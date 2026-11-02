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
const route = `app/cards-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-cards-${Date.now()}`,
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
    `import {CardsPanel} from '../../components/operations/cards';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Kartu peserta</h1><CardsPanel/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/cards-browser-dev.log");
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
  const id=n=>`08000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  let students=Array.from({length:501},(_,n)=>({student_id:id(n+1),student:'Peserta '+n+' '+ 'nama'.repeat(30),username:'siswa-'+n,room:null})),jobs=[],jobError=false,studentError=false,postMode='ok',posts=[];
  const respond=(r,status,data)=>r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:'Layanan gagal'}})}).catch(()=>{});
  page.on('request',r=>{const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return r.continue();
   if(u.pathname==='/api/operations/live')return r.respond({status:200,contentType:'text/event-stream',body:': ping\n\n'});
   if(u.pathname==='/api/operations')return u.searchParams.has('action')?respond(r,studentError?503:200,students):respond(r,200,{admin:true,organization_id:id(99),exams:[{id:id(80),title:'Ujian '+ 'panjang'.repeat(30)},{id:id(81),title:'Ujian kedua'}],staff:[]});
   if(u.pathname==='/api/cards'&&r.method()==='POST'){posts.push(JSON.parse(r.postData()));return respond(r,postMode==='uncertain'?503:200,{id:id(90),queued:postMode!=='running',...(postMode==='running'?{state:'running'}:{})});}
   if(u.pathname==='/api/cards')return respond(r,jobError?503:200,jobs);
   return respond(r,200,[]);
  });
  const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===t&&!b.matches(':disabled')),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t&&!b.matches(':disabled')).click(),text);await sleep(150);};
  const ready=()=>page.waitForFunction(()=>document.querySelectorAll('.cards-participants input').length===50);
  const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  for(const width of [320,390,768,1024,1440]){await page.setViewport({width,height:844});await page.goto(origin+path,{waitUntil:'domcontentloaded'});await ready();await overflow();}
  await click('Pilih hasil · maks. 500');assert(await page.evaluate(()=>document.querySelector('.cards-controls').innerText.includes('500 dipilih')));
  await page.select('.cards-filter-grid label:nth-child(3) select','zip');await page.waitForFunction(()=>document.querySelector('.cards-controls [role=alert]')?.textContent.includes('50'));assert(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Buat 500')).disabled));
  await click('Kosongkan pilihan');await click('Pilih hasil · maks. 50');await click('Buat 50 kartu');assert.equal(posts.at(-1).student_ids.length,50);assert.equal(new Set(posts.at(-1).student_ids).size,50);
  postMode='uncertain';await click('Buat 50 kartu');await sleep(300);const previous=posts.at(-1).request_id;postMode='running';await click('Buat 50 kartu');assert.equal(posts.at(-1).request_id,previous);await page.waitForFunction(()=>document.body.innerText.includes('masih berjalan'));
  await page.$eval('input[type=search]',el=>el.focus());await page.type('input[type=search]','no match');await page.waitForFunction(()=>document.body.innerText.includes('Tidak ada peserta'));assert(await page.evaluate(()=>document.body.innerText.includes('0 dipilih')));
  await page.$eval('input[type=search]',el=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));});await ready();
  jobs=[{id:id(90),status:'ready',progress:100,error:null,format:'pdf'},{id:id(91),status:'failed',progress:10,error:'Coba kembali',format:'zip'}];await click('Perbarui status');await page.waitForSelector('a[href^="/api/cards/download"]');assert.equal((await page.$$('.cards-job')).length,2);
  jobError=true;await click('Perbarui status');assert.equal((await page.$$('.cards-participants input')).length,50);assert.equal((await page.$$('.cards-job')).length,2);jobError=false;studentError=true;await click('Perbarui status');await page.waitForFunction(()=>document.querySelectorAll('.cards-participants input').length===0);assert.equal((await page.$$('.cards-job')).length,2);studentError=false;await click('Perbarui status');await ready();
  await click('Berikutnya');students=students.slice(0,2);await click('Perbarui status');await page.waitForFunction(()=>document.querySelectorAll('.cards-participants input').length===2);
  for(const [width,height]of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await overflow();}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow();await page.addScriptTag({content:axe.source});const scan=await page.evaluate(()=>window.axe.run(document.querySelector('.cards-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);assert.deepEqual(errors,[]);
  await page.setViewport({width:390,height:844});await page.goto(origin+path+'?role=teacher',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelectorAll('.cards-participants input').length===2);await overflow();await page.screenshot({path:'/tmp/cards-mobile.png',fullPage:true});students=[];jobs=[];await click('Perbarui status');await page.waitForFunction(()=>document.body.innerText.includes('Belum ada peserta'));assert.equal((await page.$$('.cards-job')).length,0);
  console.log('PASS CardsPanel:320–1440,orientation,text200,axe,501 participants,PDF500/ZIP50,format preservation,selection/search,pagination,create/idempotency/running,partial errors,download; API writes simulated');
}catch(e){console.error(e);try{await page?.screenshot({path:'/tmp/cards-failure.png',fullPage:true});console.log(await page.evaluate(()=>document.querySelector('main')?.innerText.slice(-2600)));}catch{}process.exitCode=1;}finally{try{if(browser){await Promise.race([browser.close(),sleep(5000)]);browser.process()?.kill('SIGKILL');}}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
