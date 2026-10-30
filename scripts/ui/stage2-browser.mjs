import { mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const route='app/stage2-check',port=20000+Math.floor(Math.random()*10000),origin=`http://127.0.0.1:${port}`,logPath='/tmp/edutara-stage2-dev.log';
const log=createWriteStream(logPath);let server,browser;
const dist=`.next-stage2-${Date.now()}`;
const originals=Object.fromEntries(['next-env.d.ts','tsconfig.json','AGENTS.md'].map(path=>[path,existsSync(path)?readFileSync(path,'utf8'):null]));
if(existsSync(route)) throw Error('Temporary verification route already exists; refusing to overwrite.');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shots='/tmp/edutara-stage2-shots';mkdirSync(shots,{recursive:true});
async function waitUntil(fn,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(350);}throw Error('Timed out waiting for dev server');}
try{
 mkdirSync(route,{recursive:true});writeFileSync(`${route}/page.tsx`,readFileSync('tests/fixtures/stage2-ui.tsx','utf8'));
 server=spawn('npm',['run','dev','--','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',EDUTARA_UI_TEST_DIST:dist},detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
 await waitUntil(async()=>{try{return(await fetch(origin+'/login')).ok;}catch{return false;}});
 browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});
 const page=await browser.newPage();const errors=[];let latestAttempt=null,answers={},listFailure=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.pathname==='/favicon.ico')return void request.respond({status:204});
  if(url.origin===origin&&url.pathname.startsWith('/api/')){
   const data=JSON.parse(request.postData()||'{}');let result={recorded:true};
   if(url.pathname==='/api/attempts'&&request.method()==='GET'){
    if(listFailure)return void request.respond({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{message:'Koneksi uji terputus'}})});
    result={exams:[]};
   }
   if(data.action==='save'){result={acknowledgements:data.answers.map(row=>{answers[row.question_id]={question_id:row.question_id,value:row.value,revision:(answers[row.question_id]?.revision||0)+1};return{question_id:row.question_id,saved:true,revision:answers[row.question_id].revision};})};}
   if(data.action==='resume'&&latestAttempt)result={...latestAttempt,answers:Object.values(answers),server_now:new Date().toISOString()};
   if(data.action==='submit'&&latestAttempt)result={...latestAttempt,status:'submitted',finalized_at:new Date().toISOString(),questions:[],answers:[]};
   return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:result})});
  }
  void request.continue();
 });
 const goto=async(mode='dashboard',width=390,height=844)=>{await page.setViewport({width,height});await page.goto(`${origin}/stage2-check?mode=${mode}`,{waitUntil:'networkidle0'});await page.waitForSelector(`[data-mode="${mode}"]`);};
 const clickText=async(text)=>{const match=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text&&el.getClientRects().length),text);const el=match.asElement();assert.ok(el,`Missing visible button: ${text}`);await el.click();await match.dispose();};
 const overflow=async(label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal page overflow: ${label}`);
 await goto('dashboard',1440,1000);await overflow('desktop dashboard');await page.screenshot({path:`${shots}/dashboard-desktop.png`,fullPage:true});
 assert.ok(await page.$eval('.table-wrap',el=>el.scrollHeight>el.clientHeight),'table should scroll within its container');
 await goto('dashboard');await overflow('mobile dashboard');await page.click('[aria-label="Buka navigasi"]');await page.waitForSelector('[role="dialog"]');
 for(let i=0;i<6;i++)await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]')),'modal must trap keyboard focus');
 await page.screenshot({path:`${shots}/mobile-navigation.png`});await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Buka navigasi');
 await clickText('Tambah pengguna');await page.waitForSelector('[role="dialog"]');await overflow('mobile form');await page.screenshot({path:`${shots}/mobile-form.png`});await page.keyboard.press('Escape');
 for(const width of [320,768]){await goto('dashboard',width,900);await overflow(`dashboard ${width}`);}
 await goto('player',390,844);await overflow('mobile player');
 await page.screenshot({path:`${shots}/player-mobile.png`,fullPage:true});
 await page.click('input[type="radio"]');await waitUntil(async()=>await page.evaluate(()=>document.body.textContent.includes('Semua perubahan tersimpan')),10000);
 await clickText('Tandai ragu');await clickText('Daftar soal');await page.waitForSelector('[role="dialog"]');
 assert.ok(await page.$eval('[role="dialog"] [aria-label^="Soal 1,"]',el=>el.getAttribute('aria-label').includes('Terjawab, ditandai ragu')));
 await page.click('[role="dialog"] [aria-label^="Soal 2,"]');await page.waitForSelector('[role="dialog"]',{hidden:true});
 assert.ok(await page.evaluate(()=>document.querySelector('.question-heading h2').getBoundingClientRect().top >= document.querySelector('.exam-top').getBoundingClientRect().bottom),'focused question must not hide below sticky header');
 await page.select('fieldset select','true');await clickText('Daftar soal');await page.waitForSelector('[role="dialog"]');
 assert.ok(await page.$eval('[role="dialog"] [aria-label^="Soal 2,"]',el=>el.getAttribute('aria-label').includes('Belum lengkap')));
 await page.click('[role="dialog"] [aria-label^="Soal 3,"]');await page.waitForSelector('textarea');await page.type('textarea','Masyarakat saling bekerja sama dalam menjaga lingkungan.');
 await page.click('.exam-tools summary');await page.select('.exam-tools select','22');await page.click('.exam-tools summary');
 assert.equal(await page.$eval('.question-reading',el=>getComputedStyle(el).fontSize),'22px');
 await page.evaluate(()=>scrollTo(0,600));assert.ok(await page.$eval('[role="timer"]',el=>el.getBoundingClientRect().top>=0),'mobile timer must remain visible');
 await clickText('Akhiri ujian');await page.waitForSelector('[role="dialog"]');assert.ok(await page.$('[aria-label="Ringkasan jawaban"]'));
 await clickText('Periksa jawaban yang belum lengkap');await page.waitForSelector('[role="dialog"]',{hidden:true});
 assert.ok(await page.$eval('.question-heading h2',el=>el.textContent.includes('2')),'summary must jump to first incomplete question');
 await page.screenshot({path:`${shots}/player-partial-mobile.png`,fullPage:true});
 // Wait for the queue acknowledgement before reloading; the player correctly warns on unsaved navigation.
 await waitUntil(async()=>await page.$eval('.exam-status',el=>el.textContent.includes('Semua perubahan tersimpan')),10000);
 for(const width of [320,768,1440]){await goto('player',width,900);await overflow(`player ${width}`);}
 await page.screenshot({path:`${shots}/player-desktop.png`,fullPage:true});
 await goto('student');await page.waitForSelector('.empty-state');assert.ok(await page.$eval('.empty-state',el=>el.textContent.includes('Belum ada ujian')));
 listFailure=true;await clickText('Periksa lagi');await waitUntil(async()=>await page.evaluate(()=>document.body.textContent.includes('Daftar ujian belum dapat dimuat')),10000);listFailure=false;
 await clickText('Coba muat ulang');await waitUntil(async()=>await page.evaluate(()=>document.body.textContent.includes('Belum ada ujian')),10000);
 await page.goto(origin+'/login',{waitUntil:'networkidle0'});await page.setViewport({width:390,height:844});await overflow('login');
 await page.type('input[name="password"]','test-password');await page.click('[aria-label="Tampilkan password"]');assert.equal(await page.$eval('input[name="password"]',el=>el.type),'text');
 await page.screenshot({path:`${shots}/login-mobile.png`,fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',viewports:[320,390,768,1440],checks:['responsive overflow','table scrolling','navigation dialog focus trap and Escape','mobile form','saved and partial answer statuses','question map and unobscured keyboard focus','font size','sticky timer','submission summary','student loading/error/empty/retry','password visibility'],screenshots:shots}));
}finally{if(browser)await browser.close();if(server){try{process.kill(-server.pid,'SIGTERM');}catch{/* Server already stopped. */}}log.end();rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const [path,content] of Object.entries(originals)){if(content===null)rmSync(path,{force:true});else writeFileSync(path,content);}}
