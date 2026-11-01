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
const route = `app/results-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-results-${Date.now()}`,
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
    `import Master from '../dashboard/results/page';import Analytics from '../dashboard/analytics/page';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji">{p.analytics?<Analytics/>:<Master/>}</DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/results-browser-dev.log");
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
  const id=n=>`05000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const question=()=>({type:'Esai',stem:'Jelaskan interaksi sosial. '+ 'Panjang'.repeat(30),points:5,required:true,options:[],key:[],explanation:'',rubric:'Ketepatan konsep',minChars:0,direction:'ltr',attachments:[],canvas:{enabled:false,width:1000,height:600},keywords:[],distractors:[]});
  let audience='admin',mode='ok',aiFailure=true,mutation='ok',held=null,calls=[],maxActive=0,active=0,details=new Map(),listSize=51,jobs=[],jobsHold=false,heldJob=null,jobReads=0,settings={school:'MTs Uji',address:'Alamat',official:'Pejabat',official_title:'Kepala Madrasah',logo_media_id:null,can_manage:true};
  const row=n=>({id:id(n),exam_id:id(n%2?80:81),student_id:id(1000+n),student:n===1?'Ahmad '+ 'Panjang'.repeat(20):'Peserta '+n,username:'siswa-'+n,title:'Ujian IPS',subject:'IPS',class_name:'VII A',status:'submitted',pending:1,score:null,passed:null,revision:1,started_at:'2026-11-01T01:00:00Z',finalized_at:'2026-11-01T02:00:00Z',published:false});
  function detail(key){if(details.has(key))return details.get(key);const n=Number(key.slice(-12));const r=row(n);const d={attempt:{...r,student:r.student,class_ids:[id(70)]},questions:[{id:id(90),version:n%2?1:2,position:1,payload:question(),answer:{text:'Jawaban siswa'},earned:null,comment:null,source:null,revision_reason:null,criteria:{}}],ledger:[],history:[],suggestions:[{id:id(600+n),question_id:id(90),basis_revision:1,provider:'openai',model:'fixture',prompt_version:'v1',status:'pending',points:3,reason:'Alasan saran'}]};details.set(key,d);return d;}
  const respond=async(r,status,data)=>{try{await r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:status===409?'CONFLICT: Revisi berubah':'Layanan sementara gagal'}})});}catch{}};
  page.on('request',async r=>{
    const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return r.continue();
    if(u.pathname==='/api/admin/master')return respond(r,200,{classes:[{id:id(70),name:'VII A'}],subjects:[{id:id(71),name:'IPS'}]});
    if(u.pathname==='/api/grading/ai'){if(r.method()==='GET')return respond(r,aiFailure?503:200,[{provider:'openai',model:'fixture'}]);const input=JSON.parse(r.postData());calls.push(input);return respond(r,200,{items:[{id:id(800),status:'pending'}]});}
    if(u.pathname==='/api/results/media')return respond(r,503,null);
    if(u.pathname==='/api/reports'&&r.method()==='GET'){if(!u.searchParams.has('settings')){jobReads++;if(jobsHold){heldJob=r;return;}}return respond(r,200,u.searchParams.has('settings')?{...settings,can_manage:audience==='admin'}:jobs);}
    if(u.pathname==='/api/results'&&r.method()==='GET'){
      if(u.searchParams.has('attempt')){active++;maxActive=Math.max(maxActive,active);await sleep(20);active--;return respond(r,200,detail(u.searchParams.get('attempt')));}
      if(mode==='error')return respond(r,503,null);if(mode==='malformed')return respond(r,200,{rows:null});if(mode==='hold'){held=r;return;}
      const p=Number(u.searchParams.get('page')||1);const total=u.searchParams.get('search')==='nomatch'?0:listSize;
      return respond(r,200,{rows:Array.from({length:Math.max(0,Math.min(25,total-(p-1)*25))},(_,i)=>row((p-1)*25+i+1)),total,page:p,can_publish:audience==='admin'});
    }
    if(r.method()==='POST'){
      const input=JSON.parse(r.postData());calls.push(input);if(mutation==='hold'){held=r;return;}if(mutation==='conflict')return respond(r,409,null);if(mutation==='error')return respond(r,503,null);
      if(u.pathname==='/api/results'){
        if(input.action==='grade_batch'){const out=[];for(const g of input.grades){const d=detail(g.attempt_id);d.questions[0].earned=g.points;d.questions[0].comment=g.comment;d.attempt.revision++;d.attempt.pending=0;d.attempt.score=g.points*20;out.push({attempt_id:g.attempt_id,revision:d.attempt.revision,score:d.attempt.score,pending:0,passed:true});}return respond(r,200,out);}
        if(input.action==='recalculate')return respond(r,200,input.ids.map(key=>({attempt_id:key,revision:2,score:50,pending:0,passed:false})));
        if(input.action==='publish')return respond(r,200,{saved:true});
        if(input.action==='reject_ai')return respond(r,200,{rejected:true});
        return respond(r,200,{attempt_id:id(1),revision:2,score:60,pending:0,passed:true});
      }
      if(u.pathname==='/api/reports/run')return respond(r,200,{queued:true});
      if(u.pathname==='/api/reports'){
        if(input.action==='settings'){settings={...settings,...input};return respond(r,200,{saved:true});}
        if(input.action==='analysis')return respond(r,200,{eligible:0,excluded:input.ids.length,items:[]});
        jobs=[{id:id(500),kind:input.kind,format:input.format,status:'ready',progress:100,failures:0,error:null}];return respond(r,200,{id:id(500),status:'queued'});
      }
    }
    return respond(r,200,[]);
  });
  page.on('dialog',d=>d.accept());
  const click=async(text,scope='')=>page.evaluate(({text,scope})=>{const root=scope?document.querySelector(scope):document;const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.matches(':disabled'));if(!b)throw Error('Unavailable '+text);b.focus();b.click();},{text,scope});
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.results-page')?.getAttribute('aria-busy')==='false');
  const fill=async(selector,value)=>{const e=await page.$(selector);await e.focus();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await e.press('Backspace');if(value)await e.type(value);};
  const open=async text=>{await click(text);await page.waitForSelector('[role=dialog]');await ready();};
  const close=async()=>{await page.click('[aria-label="Tutup dialog"]');await page.waitForSelector('[role=dialog]',{hidden:true});};
  const go=async(role='admin')=>{audience=role;mode='ok';mutation='ok';details=new Map();listSize=51;jobs=[];await page.goto(origin+path+'?role='+role,{waitUntil:'networkidle0'});await ready();};
  const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');
  const dialogFits=async()=>assert(await page.$eval('[role=dialog]',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;}),'dialog bounds');
  for(const width of (process.env.EDUTARA_RESULTS_FOCUSED?[390]:[320,390,768,1024,1440])){await page.setViewport({width,height:800});await go();await overflow('page '+width);await open('Detail / koreksi');await dialogFits();await close();await open('Atur kop / logo / pejabat');await dialogFits();await close();}
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();await page.addScriptTag({content:axe.source});const scan=await page.evaluate(()=>window.axe.run(document.querySelector('.results-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>[v.id,v.nodes.length]),[]);await page.screenshot({path:'/tmp/results-mobile.png',fullPage:true});
  // AI provider failure cannot prevent manual correction; blank never becomes zero.
  await open('Detail / koreksi');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Koreksi manual tetap tersedia.'));
  assert(!(await page.$eval('[role=dialog] input[type=number]',e=>e.matches(':disabled'))));const before=calls.length;await click('Simpan persetujuan koreksi','[role=dialog]');await ready();assert.equal(calls.length,before);await fill('[role=dialog] input[type=number]','0');mutation='hold';await click('Simpan persetujuan koreksi','[role=dialog]');await page.waitForFunction(()=>document.querySelector('.results-page')?.getAttribute('aria-busy')==='true');await page.click('[aria-label="Tutup dialog"]');assert(await page.$('[role=dialog]'));assert.equal(calls.length,before+1);assert.equal(calls.at(-1).grades[0].points,0);mutation='ok';const heldRequest=held;held=null;const d=detail(id(1));d.questions[0].earned=0;d.attempt.revision=2;await respond(heldRequest,200,[{attempt_id:id(1),revision:2,score:0,pending:0,passed:false}]);await ready();
  await fill('[role=dialog] input[type=number]','2');const old=calls.length;await click('Simpan persetujuan koreksi','[role=dialog]');await ready();assert.equal(calls.length,old);await fill('[role=dialog] form > fieldset > label textarea','Perbaikan berdasarkan rubrik');await click('Simpan persetujuan koreksi','[role=dialog]');await ready();assert.equal(calls.at(-1).grades[0].expected_revision,2);assert.equal(calls.at(-1).grades[0].reason,'Perbaikan berdasarkan rubrik');await close();
  // Cancelled header edits must not become saved UI state.
  await open('Atur kop / logo / pejabat');await fill('[role=dialog] input','Nama belum disimpan');await close();await open('Atur kop / logo / pejabat');assert.equal(await page.$eval('[role=dialog] input',e=>e.value),'MTs Uji');await fill('[role=dialog] input','MTs Baru');await click('Simpan kop','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(settings.school,'MTs Baru');
  // Batch bounded concurrency and version isolation.
  await click('Pilih halaman ini');maxActive=0;await open('Koreksi per soal lintas peserta');assert(maxActive<=4);const versions=await page.$$eval('[role=dialog] select option',xs=>xs.map(x=>x.value).filter(Boolean));assert.equal(versions.length,2);await page.select('[role=dialog] select',id(90)+':2');assert.equal(await page.$$eval('[role=dialog] input[type=number]',xs=>xs.length),12);await fill('[role=dialog] input[type=number]','1');await click('Simpan batch','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).grades[0].question_id,id(90));
  // Filter changes clear selection, page shrink clamps, selected exam stays a valid option.
  await click('Pilih halaman ini');await fill('input[type=search]','nomatch');await sleep(350);await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Terpilih 0 / 500')));await click('Reset filter');await sleep(350);await ready();await click('Berikutnya');await ready();await click('Berikutnya');await ready();listSize=1;await click('Muat ulang');await sleep(350);await ready();await page.waitForFunction(()=>document.body.textContent.includes('Halaman 1 · 1 hasil'));
  await go();await click('Pilih halaman ini');await click('Analisis terpilih');await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Analisis lima tipe')));await click('Buat laporan / cetak massal');await ready();assert(await page.$('a[href^="/api/reports/download"]'));assert.equal(calls.at(-1).action,'create');
  await open('Rekalkulasi berizin');await fill('[role=dialog] textarea','Pemeriksaan nilai ulang');await click('Rekalkulasi terpilih','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).action,'recalculate');
  await click('Pilih halaman ini');await click('Terbitkan nilai ujian terpilih');await ready();assert.equal(calls.at(-1).action,'publish');assert.equal(calls.at(-1).published,true);
  // Known conflicts and uncertain writes require deliberate recovery.
  await open('Detail / koreksi');await fill('[role=dialog] input[type=number]','1');mutation='conflict';await click('Simpan persetujuan koreksi','[role=dialog]');await ready();assert(await page.$eval('[role=dialog] input[type=number]',e=>e.matches(':disabled')));mutation='ok';await click('Periksa ulang data','[role=dialog]');await ready();await close();
  await open('Detail / koreksi');await fill('[role=dialog] input[type=number]','1');mutation='error';await click('Simpan persetujuan koreksi','[role=dialog]');await ready();assert(await page.$eval('[role=dialog] input[type=number]',e=>e.matches(':disabled')));mutation='ok';await click('Periksa ulang data','[role=dialog]');await ready();await close();
  mode='error';await click('Muat ulang');await ready();assert(await page.$('.list-filters [role=alert]'));mode='malformed';await click('Muat ulang');await ready();assert(await page.$('.list-filters [role=alert]'));mode='ok';await click('Muat ulang');await ready();
  // Abort old list responses on filter change, and recover a bounded read timeout.
  mode='hold';await click('Muat ulang');await sleep(60);const stale=held;mode='ok';await fill('input[type=search]','nomatch');await sleep(350);await ready();await respond(stale,200,{rows:[row(999)],total:999,can_publish:true});assert(await page.evaluate(()=>document.querySelector('.filter-summary')?.textContent.includes('0 hasil')));await click('Reset filter');await sleep(350);await ready();
  await page.evaluate(()=>{const original=window.setTimeout;window.__resultsTimer=original;window.setTimeout=(fn,delay,...args)=>original(fn,[20000,35000].includes(delay)?80:delay,...args);});mode='hold';await click('Muat ulang');await ready();assert(await page.$('.list-filters [role=alert]'));mode='ok';held=null;await click('Muat ulang');await ready();
  await page.evaluate(()=>{window.setTimeout=window.__resultsTimer;});
  // Export polling is single-flight even when the previous status response is delayed.
  jobs=[{id:id(500),kind:'recap',format:'pdf',status:'running',progress:10,failures:0,error:null}];
  await page.evaluate(()=>{const original=window.setInterval;window.setInterval=(fn,delay,...args)=>original(fn,delay===4000?40:delay,...args);});await click('Muat status ekspor');await sleep(20);jobsHold=true;const priorJobs=jobReads;await sleep(140);assert(jobReads-priorJobs<=1);jobsHold=false;if(heldJob){const h=heldJob;heldJob=null;jobs=[{...jobs[0],status:'ready',progress:100}];await respond(h,200,jobs);}await go();
  // Provider retry and stale AI suggestions do not turn into an accidental zero.
  aiFailure=false;await open('Detail / koreksi');await page.waitForFunction(()=>document.querySelector('[role=dialog] select')?.value==='openai');await click('Minta saran AI','[role=dialog]');await ready();assert.equal(calls.at(-1).provider,'openai');await close();
  await go('teacher');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Terbitkan nilai ujian terpilih')),false);
  for(const [width,height] of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await ready();await overflow('orientation');await open('Detail / koreksi');await dialogFits();await close();}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow('text 200');await open('Detail / koreksi');await dialogFits();await page.addScriptTag({content:axe.source});const ds=await page.evaluate(()=>window.axe.run(document.querySelector('[role=dialog]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(ds.violations.map(v=>[v.id,v.nodes.length]),[]);await close();
  await page.goto(origin+path+'?analytics=1',{waitUntil:'networkidle0'});await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Analisis dan tindakan terpilih')));await overflow('analytics shared');
  await page.setViewport({width:1440,height:900});await go();await page.screenshot({path:'/tmp/results-desktop.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS results production panel: Admin/Guru,320–1440,short/orientation/text200/touch/axe; manual zero/revision reason/modal lock,AI independence,bounded batch/version isolation,selection/pagination,settings cancel/save,analysis/export/recalc/publication,conflict/uncertain/read error recovery; API writes simulated');
}catch(e){console.error(e);try{await page?.screenshot({path:'/tmp/results-failure.png',fullPage:true});console.log(await page.evaluate(()=>document.querySelector('main')?.innerText.slice(-2000)));}catch{}process.exitCode=1;}finally{try{await browser?.close();}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
