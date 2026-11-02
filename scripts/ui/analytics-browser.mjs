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
const route = `app/analytics-check-${Date.now()}`,
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
  const log = createWriteStream("/tmp/analytics-browser-dev.log");
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
  let analysisMode='rich';let audience='admin',mode='ok',aiFailure=true,mutation='ok',calls=[],maxActive=0,active=0,details=new Map(),listSize=51,jobs=[],settings={school:'MTs Uji',address:'Alamat',official:'Pejabat',official_title:'Kepala Madrasah',logo_media_id:null,can_manage:true};
  const row=n=>({id:id(n),exam_id:id(n%2?80:81),student_id:id(1000+n),student:n===1?'Ahmad '+ 'Panjang'.repeat(20):'Peserta '+n,username:'siswa-'+n,title:'Ujian IPS',subject:'IPS',class_name:'VII A',status:'submitted',pending:1,score:null,passed:null,revision:1,started_at:'2026-11-01T01:00:00Z',finalized_at:'2026-11-01T02:00:00Z',published:false});
  function detail(key){if(details.has(key))return details.get(key);const n=Number(key.slice(-12));const r=row(n);const d={attempt:{...r,student:r.student,class_ids:[id(70)]},questions:[{id:id(90),version:n%2?1:2,position:1,payload:question(),answer:{text:'Jawaban siswa'},earned:null,comment:null,source:null,revision_reason:null,criteria:{}}],ledger:[],history:[],suggestions:[{id:id(600+n),question_id:id(90),basis_revision:1,provider:'openai',model:'fixture',prompt_version:'v1',status:'pending',points:3,reason:'Alasan saran'}]};details.set(key,d);return d;}
  const respond=async(r,status,data)=>{try{await r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:status===409?'CONFLICT: Revisi berubah':'Layanan sementara gagal'}})});}catch{}};
  page.on('request',async r=>{
    const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return r.continue();
    if(u.pathname==='/api/admin/master')return respond(r,200,{classes:[{id:id(70),name:'VII A'}],subjects:[{id:id(71),name:'IPS'}]});
    if(u.pathname==='/api/grading/ai'){if(r.method()==='GET')return respond(r,aiFailure?503:200,[{provider:'openai',model:'fixture'}]);const input=JSON.parse(r.postData());calls.push(input);return respond(r,200,{items:[{id:id(800),status:'pending'}]});}
    if(u.pathname==='/api/results/media')return respond(r,503,null);
    if(u.pathname==='/api/reports'&&r.method()==='GET'){return respond(r,200,u.searchParams.has('settings')?{...settings,can_manage:audience==='admin'}:jobs);}
    if(u.pathname==='/api/results'&&r.method()==='GET'){
      if(u.searchParams.has('attempt')){active++;maxActive=Math.max(maxActive,active);await sleep(20);active--;return respond(r,200,detail(u.searchParams.get('attempt')));}
      if(mode==='error')return respond(r,503,null);if(mode==='malformed')return respond(r,200,{rows:null});
      const p=Number(u.searchParams.get('page')||1);const total=u.searchParams.get('search')==='nomatch'?0:listSize;
      return respond(r,200,{rows:Array.from({length:Math.max(0,Math.min(25,total-(p-1)*25))},(_,i)=>row((p-1)*25+i+1)),total,page:p,can_publish:audience==='admin'});
    }
    if(r.method()==='POST'){
      const input=JSON.parse(r.postData());calls.push(input);if(mutation==='conflict')return respond(r,409,null);if(mutation==='error')return respond(r,503,null);
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
        if(input.action==='analysis'){if(analysisMode==='fail')return respond(r,503,null);return respond(r,200,analysisMode==='empty'?{eligible:0,excluded:input.ids.length,items:[]}:{eligible:25,excluded:1,items:Array.from({length:41},(_,i)=>({id:'item-'+i,exam_id:id(i%2?80:81),question_id:id(900+i),version:i%2+1,type:['PG','PG_KOMPLEKS','BS','JODOH','Esai'][i%5],stem:'Soal analisis '+i+' '+ 'Panjang'.repeat(60),n:25,group_size:6,p:.5,d:.3,difficulty:'Sedang',discrimination:'Baik',small_sample:true,wrong:Array.from({length:25},(_,j)=>({student:'Peserta panjang '+j+' '+ 'Nama'.repeat(20),attempt_id:id(j+1),earned:0,max:1})),options:[{id:'A',text:'Pilihan panjang '+ 'teks'.repeat(50),choices:{selected:12},correct:12,wrong:[],is_key:true,selection_rate:.48,nonfunctional:false}],essay:[]}))});}
        jobs=[{id:id(500),kind:input.kind,format:input.format,status:'ready',progress:100,failures:0,error:null}];return respond(r,200,{id:id(500),status:'queued'});
      }
    }
    return respond(r,200,[]);
  });
  page.on('dialog',d=>d.accept());
  const click=async(text,scope='')=>page.evaluate(({text,scope})=>{const root=scope?document.querySelector(scope):document;const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.matches(':disabled'));if(!b)throw Error('Unavailable '+text);b.focus();b.click();},{text,scope});
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.results-page')?.getAttribute('aria-busy')==='false');
  const fill=async(selector,value)=>{const e=await page.$(selector);await e.focus();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await e.press('Backspace');if(value)await e.type(value);};
  const go=async(role='admin')=>{audience=role;mode='ok';mutation='ok';details=new Map();listSize=51;jobs=[];await page.goto(origin+path+'?analytics=1&role='+role,{waitUntil:'networkidle0'});await ready();};
  const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');

  for(const width of [320,390,768,1024,1440]){
    await page.setViewport({width,height:800});await go();
    assert.equal(await page.$eval('.analysis-action',e=>e.parentElement.firstElementChild===e),true);
    assert.equal(await page.$eval('option[value=analytics]',e=>e.parentElement.value),'analytics');
    await click('Pilih halaman ini');await click('Analisis terpilih');await ready();await page.waitForSelector('.analysis-view');
    assert.equal(await page.$$eval('.analysis-item',es=>es.length),20);
    assert.equal(await page.$$eval('.analysis-options',es=>es.length),0);
    await page.click('.analysis-item summary');await page.waitForSelector('.analysis-options');await overflow('analysis '+width);
    await page.addScriptTag({content:axe.source});const scan=await page.evaluate(()=>window.axe.run(document.querySelector('.analysis-view'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);
  }
  await click('Butir berikutnya');assert.equal(await page.$$eval('.analysis-item',es=>es.length),20);await click('Butir berikutnya');assert.equal(await page.$$eval('.analysis-item',es=>es.length),1);
  await page.select('.analysis-view select','Esai');assert.equal(await page.$$eval('.analysis-item',es=>es.length),8);
  await fill('.analysis-view input[type=search]','tidak-ada');assert.equal(await page.$$eval('.analysis-item',es=>es.length),0);await click('Reset filter','.analysis-view');
  if(!await page.$eval('.analysis-item',e=>e.open))await page.click('.analysis-item summary');await page.waitForSelector('.analysis-options');assert.equal(await page.$$eval('.analysis-item[open] > div > div > ul > li',es=>es.length),10);await click('Tampilkan lainnya (15)','.analysis-item[open]');
  assert.equal(await page.$$eval('.analysis-item[open] > div > div > ul > li',es=>es.length),25);
  for(const [width,height] of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await overflow('orientation');}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow('text200');await page.screenshot({path:'/tmp/analytics-mobile.png',fullPage:true});
  await click('Bersihkan pilihan (25)');await page.waitForSelector('.analysis-view',{hidden:true});
  await click('Pilih halaman ini');analysisMode='empty';await click('Analisis terpilih');await ready();await page.waitForFunction(()=>document.querySelector('.analysis-view')?.textContent.includes('Belum ada butir'));
  analysisMode='fail';await click('Analisis terpilih');await ready();assert.equal(await page.$('.analysis-view'),null);assert(await page.$('[role=alert]'));
  analysisMode='rich';await click('Coba analisis kembali');await ready();await page.waitForSelector('.analysis-view');
  await go('teacher');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Terbitkan nilai ujian terpilih')),false);
  assert.deepEqual(errors,[]);console.log('PASS analytics: 320/390/768/1024/1440, orientation/text200,axe,41 items/lazy detail/pagination/search/type/participants,selection invalidation,empty/error/retry,teacher permissions; fixture API writes only');
}catch(e){console.error(e);try{await page?.screenshot({path:'/tmp/results-failure.png',fullPage:true});console.log(await page.evaluate(()=>document.querySelector('main')?.innerText.slice(-2000)));}catch{}process.exitCode=1;}finally{try{await browser?.close();}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
