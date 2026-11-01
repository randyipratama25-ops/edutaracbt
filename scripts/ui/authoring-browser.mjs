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
const route = `app/authoring-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-authoring-${Date.now()}`,
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
    `import Master from '../dashboard/exams/page';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><Master/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/authoring-browser-dev.log");
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
  const id=n=>`04000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const kinds=['PG','PG_KOMPLEKS','BS','JODOH','Esai'];
  const question=(i=1)=>({type:'PG',stem:'Soal IPS '+i,points:1,required:true,options:[{id:'A',text:'Benar'},{id:'B',text:'Salah'}],key:['A'],explanation:'Pembahasan',rubric:'',minChars:0,direction:'ltr',attachments:[],canvas:{enabled:false,width:1000,height:600},keywords:[],distractors:[]});
  let audience='admin',mode='ok',mutation='ok',hold=null,calls=[],reads=0,mediaFailure=true;
  const seed=()=>({exams:[1,2].map(n=>({id:id(n),subject_id:id(80),title:n===1?'Ujian IPS '+ 'Panjang'.repeat(20):'Ujian tujuan',starts_at:'2030-11-01T08:00:00Z',ends_at:'2030-11-01T10:00:00Z',duration_minutes:60,status:'draft',passing_grade:70,bypass_period:false,shuffle_questions:false,shuffle_options:false})),examClasses:[{exam_id:id(1),class_id:id(70)}],configs:[1,2].flatMap(n=>kinds.map(type=>({exam_id:id(n),type,enabled:true,max_questions:0,option_count:2,default_points:1}))),classes:[{id:id(70),name:'VII A',active:true}],subjects:[{id:id(80),name:'IPS',active:true}],period:null,questions:Array.from({length:21},(_,i)=>({id:id(100+i),type:'PG',current_version:1,payload:question(i+1)})),history:[{question_id:id(100),version:1,payload:question(1)}],canManage:audience==='admin',serverNow:new Date().toISOString()});
  let data=seed();
  const respond=async(r,status,data)=>{try{await r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:'Layanan sementara gagal'}})});}catch{}};
  page.on('request',async r=>{
    const u=new URL(r.url());if(u.pathname==='/api/authoring/media'){if(mediaFailure)return respond(r,503,null);return respond(r,200,{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',mime:'image/png'});}if(u.pathname!=='/api/authoring'){if(u.pathname==='/api/notifications/inbox')return respond(r,200,{rows:[],unread:0});return r.continue();}
    if(r.method()==='GET'){reads++;if(mode==='hold'){hold=r;return;}if(mode==='error')return respond(r,503,null);if(mode==='malformed')return respond(r,200,{exams:null});const d=structuredClone(data);if(!u.searchParams.has('exam')){d.questions=[];d.history=[];}return respond(r,200,d);}
    const input=JSON.parse(r.postData());calls.push(input);
    if(mutation==='hold'){hold=r;return;}if(mutation==='error')return respond(r,503,null);
    let result={saved:true};
    if(input.action==='exam'){const e={...input.exam,id:input.exam.id||id(3)};data.exams=data.exams.filter(x=>x.id!==e.id).concat(e);data.configs=data.configs.filter(x=>x.exam_id!==e.id).concat(e.configs.map(c=>({...c,exam_id:e.id})));result={id:e.id};}
    if(input.action==='duplicate_exam'){const e={...data.exams[0],id:id(4),title:'Salinan'};data.exams.push(e);result={id:e.id};}
    if(input.action==='questions'){result={saved:input.items.length,skipped:0,details:input.items.map((q,i)=>({block:i+1,id:input.question_id||id(400+i),version:2,saved:true}))};}
    if(input.action==='copy')result={saved:input.ids.length,skipped:0,details:[]};
    if(input.action==='archive_questions')data.questions=data.questions.filter(q=>!input.ids.includes(q.id));
    if(input.action==='archive_exams')data.exams=data.exams.map(e=>input.ids.includes(e.id)?{...e,status:'archived'}:e);
    if(input.action==='period')data.period={enabled:input.enabled,starts_at:input.starts_at,ends_at:input.ends_at};
    return respond(r,200,result);
  });
  page.on('dialog',d=>d.accept());
  const click=async(text,scope='')=>page.evaluate(({text,scope})=>{const root=scope?document.querySelector(scope):document;const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.disabled&&!b.matches(':disabled'));if(!b)throw Error('Unavailable '+text);b.focus();b.click();},{text,scope});
  const fill=async(selector,value)=>{const e=await page.$(selector);await e.click({clickCount:3});await e.press('Backspace');await e.type(value);};
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.authoring-page')?.getAttribute('aria-busy')==='false');
  const go=async(role='admin',selected=true)=>{audience=role;data=seed();data.canManage=role==='admin';mode='ok';mutation='ok';await page.goto(origin+path+'?role='+role+(selected?'&exam='+id(1):''),{waitUntil:'networkidle0'});await ready();};
  const open=async text=>{await click(text);await page.waitForSelector('[role=dialog]');};
  const close=async()=>{await page.click('[aria-label="Tutup dialog"]');await page.waitForSelector('[role=dialog]',{hidden:true});};
  const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow');
  const dialogFits=async()=>assert(await page.$eval('[role=dialog]',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;}),'dialog bounds');
  for(const width of [320,390,768,1024,1440]){
    await page.setViewport({width,height:800});await go();await overflow('page '+width);
    await open('Tambah ujian');await dialogFits();await close();
    await open('Tambah PG');await dialogFits();await close();
  }
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();
  await page.addScriptTag({content:axe.source});const scan=await page.evaluate(()=>window.axe.run(document.querySelector('.authoring-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>[v.id,v.nodes.length]),[]);
  await page.screenshot({path:'/tmp/authoring-mobile.png',fullPage:true});
  await open('Tambah PG');await page.addScriptTag({content:axe.source});const dialogScan=await page.evaluate(()=>window.axe.run(document.querySelector('[role=dialog]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(dialogScan.violations.map(v=>[v.id,v.nodes.length]),[]);
  const before=calls.length;mutation='hold';await click('Simpan versi soal','[role=dialog]');await page.waitForFunction(()=>document.querySelector('.authoring-page')?.getAttribute('aria-busy')==='true');await page.click('[aria-label="Tutup dialog"]');assert(await page.$('[role=dialog]'));assert.equal(calls.length,before+1);const held=hold;hold=null;mutation='ok';await respond(held,200,{saved:1,skipped:0,details:[]});await page.waitForSelector('[role=dialog]',{hidden:true});await ready();
  // Existing schedule CRUD and PIN/config payload stay compatible.
  await open('Tambah ujian');await fill('[role=dialog] input[name=title]','Ujian baru');
  await page.select('[role=dialog] select[name=subject_id]',id(80));
  await page.click('[role=dialog] fieldset fieldset input[type=checkbox]');
  await page.evaluate(()=>{document.querySelector('[name=starts_at]').value='2030-12-01T08:00';document.querySelector('[name=ends_at]').value='2030-12-01T10:00';});
  await fill('[role=dialog] input[name=pin]','1234');await click('Simpan jadwal','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).action,'exam');assert.equal(calls.at(-1).exam.configs.length,5);assert.equal(calls.at(-1).exam.class_ids[0],id(70));
  await go();
  // Identity survives editing, including an explicit change of question type.
  await open('Ubah / pratinjau');await page.select('[role=dialog] select','Esai');await click('Simpan versi soal','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).question_id,id(100));assert.equal(calls.at(-1).expected_version,1);assert.equal(calls.at(-1).items[0].type,'Esai');assert.equal(calls.at(-1).items[0].stem,'Soal IPS 1');
  // Pagination clamps after removal of the last page; archived rows cannot remain selected.
  await click('Berikutnya');await page.click('input[aria-label="Pilih soal '+id(120)+'"]');await click('Arsipkan soal terpilih');await ready();await page.waitForFunction(()=>document.body.textContent.includes('Halaman 1 · 20 soal'));
  // Import preview is discarded when switching exam, and uses a separate request key.
  await page.evaluate(()=>[...document.querySelectorAll('summary')].find(e=>e.textContent==='Impor soal dan template').click());await click('Template PG');await click('Pratinjau impor');const readBefore=reads;await click('Impor blok valid');await ready();assert.equal(calls.at(-1).action,'questions');assert(!calls.at(-1).question_id);assert.equal(reads,readBefore+1);assert(await page.$eval('button',()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Impor blok valid').disabled));
  await click('Template PG');await click('Pratinjau impor');await click('Bank soal');await ready();assert.equal(await page.$eval('textarea',e=>e.value),'');
  // Lock is visible and prevents mutation while retaining version preview.
  data.exams[0].status='active';await click('Muat ulang');await ready();assert(await page.$eval('button',()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Tambah PG').disabled));await open('Ubah / pratinjau');assert(await page.$('[role=dialog] .question-preview'));await close();
  // Error/malformed response retains last data but disables writes; explicit retry recovers.
  mode='error';await click('Muat ulang');await ready();assert(await page.$('[role=alert]'));assert(await page.$eval('button',()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Tambah ujian').matches(':disabled')));mode='malformed';await click('Muat ulang data');await ready();assert(await page.$('[role=alert]'));mode='ok';await click('Muat ulang data');await ready();
  // Unknown mutation result is not automatically retried; recover through read.
  await open('Tambah ujian');await close();await go();mutation='error';await open('Tambah PG');const n=calls.length;await click('Simpan versi soal','[role=dialog]');await ready();assert.equal(calls.length,n+1);assert(await page.$eval('[role=dialog] button',()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Simpan versi soal').matches(':disabled')));mutation='ok';await click('Muat ulang data','[role=dialog]');await ready();await close();
  // Dynamic preview exposes a failed attachment and offers an explicit retry.
  await go();data.questions[0].payload.attachments=[id(900)];await click('Muat ulang');await ready();await open('Ubah / pratinjau');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Coba muat lampiran'));mediaFailure=false;await click('Coba muat lampiran','[role=dialog]');await page.waitForSelector('[role=dialog] img');await close();
  // Copy, duplicate, period, archival and empty-state flows retain existing commands.
  await go();await page.click('input[aria-label="Pilih soal '+id(100)+'"]');
  await page.select('.authoring-page select',id(2));await click('Salin dengan ID soal dan relasi lampiran baru');await ready();assert.equal(calls.at(-1).action,'copy');assert.equal(calls.at(-1).source_exam_id,id(1));assert.equal(calls.at(-1).exam_id,id(2));
  await fill('input[name=pin]','1234');await click('Duplikasi jadwal');await ready();assert.equal(calls.at(-1).action,'duplicate_exam');
  await page.evaluate(()=>[...document.querySelectorAll('summary')].find(e=>e.textContent==='Periode input soal Guru').click());await click('Simpan periode');await ready();assert.equal(calls.at(-1).action,'period');
  await page.click('input[aria-label^="Pilih Ujian IPS"]');await click('Arsipkan 1 ujian terpilih');await ready();assert.equal(calls.at(-1).action,'archive_exams');
  data.questions=[];data.history=[];await click('Muat ulang');await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Belum ada soal sesuai pencarian.')));
  data.exams=[];await click('Muat ulang');await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Belum ada ujian.')));
  await go();await page.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>original(fn,[20000,35000].includes(delay)?80:delay,...args);});mode='hold';await click('Muat ulang');await ready();assert(await page.$('[role=alert]'));mode='ok';hold=null;await click('Muat ulang data');await ready();
  await go('teacher');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Tambah ujian')),false);await open('Tambah PG');await close();
  for(const [width,height] of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await ready();await overflow('orientation');await open('Tambah PG');await dialogFits();await close();}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow('text 200');await open('Tambah PG');await dialogFits();await close();
  await page.setViewport({width:1440,height:900});await go();await page.screenshot({path:'/tmp/authoring-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS authoring production page: Admin/Guru, 320–1440, short screens/orientation/text200/touch/axe, modal lock/single-flight, edit identity, pagination clamp, import refresh/context, exam locks, stale/error/malformed/uncertain recovery; mutations simulated');
}catch(e){console.error(e);try{console.log(JSON.stringify(await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&!e.closest('.table-wrap')}).map(e=>({tag:e.tagName,cl:e.className,w:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,display:getComputedStyle(e).display,flex:getComputedStyle(e).flex,parent:e.parentElement.outerHTML.slice(0,100),parentStyle:{display:getComputedStyle(e.parentElement).display,direction:getComputedStyle(e.parentElement).flexDirection,columns:getComputedStyle(e.parentElement).gridTemplateColumns}})).slice(-30)}))));}catch{}try{await page?.screenshot({path:'/tmp/authoring-failure.png',fullPage:true});}catch{}process.exitCode=1;}finally{try{await browser?.close();}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
