import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const route='app/stage5-check',dist=`.next-stage2-stage5-${Date.now()}`,port=20000+Math.floor(Math.random()*10000),origin=`http://127.0.0.1:${port}`;
const originals=Object.fromEntries(['next-env.d.ts','tsconfig.json','AGENTS.md'].map(p=>[p,existsSync(p)?readFileSync(p,'utf8'):null]));
let server,browser;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(existsSync(route))throw Error('Temporary route already exists');
try{
 mkdirSync(route);writeFileSync(`${route}/page.tsx`,readFileSync('tests/fixtures/stage5-ui.tsx'));
 const log=createWriteStream('/tmp/edutara-stage5-dev.log');server=spawn('npm',['run','dev','--','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,EDUTARA_UI_TEST_DIST:dist,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.pipe(log);server.stderr.pipe(log);
 for(let n=0;n<120;n++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await sleep(500);if(n===119)throw Error('Server startup failed');}
 browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});const page=await browser.newPage();const errors=[];let fail=false;page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',req=>{const url=new URL(req.url());if(!url.pathname.startsWith('/api/'))return void req.continue();let data={observed_at:new Date().toISOString(),operational_accepted:false,active_attempts:0,automation_enabled:true,reminders_enabled:true,retention_days:180,smtp_configured:true,worker_approved:true,schedulers:[{name:'edutara-operations',active:true,schedule:'* * * * *'},{name:'edutara-recovery-retention',active:true,schedule:'*/15 * * * *'},{name:'edutara-results-publication',active:true,schedule:'* * * * *'}],job_issues:1,stalled_jobs:0,pending_moderations:0,blocked_publications:0,backup:null};void req.respond({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:{message:'Uji kegagalan koneksi'}}:{data})});});
 mkdirSync('/tmp/edutara-stage5-shots',{recursive:true});
 async function click(text){const el=await page.waitForSelector('button');void el;const handle=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t),text);assert(await handle.evaluate(x=>!!x),text);await handle.evaluate(x=>x.scrollIntoView({block:'center'}));await handle.click();}

 const downloadPath='/tmp/edutara-stage5-download';mkdirSync(downloadPath,{recursive:true});await(await page.createCDPSession()).send('Page.setDownloadBehavior',{behavior:'allow',downloadPath});
 for(const width of [320,390,768,1440]){
  await page.setViewport({width,height:900});await page.goto(origin+'/stage5-check',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.textContent.includes('sinyal teknis terpenuhi'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  assert(await page.evaluate(()=>document.body.textContent.includes('Penerimaan operasional belum disahkan')));
  assert(await page.evaluate(()=>document.body.textContent.includes('Perlu tindak lanjut')));
  await page.screenshot({path:`/tmp/edutara-stage5-shots/acceptance-${width}.png`,fullPage:true});
 }
 await click('Unduh ringkasan');for(let n=0;n<40&&!existsSync(downloadPath+'/edutara-penerimaan-operasional.json');n++)await sleep(100);
 const exported=JSON.parse(readFileSync(downloadPath+'/edutara-penerimaan-operasional.json','utf8'));assert.equal(exported.operational_accepted,false);assert(exported.required_evidence.every(x=>x.status==='pending'));
 fail=true;await click('Muat ulang pemeriksaan');await page.waitForSelector('[role=alert]');assert.equal(await page.$('section[aria-label="Kondisi teknis"]'),null);
 fail=false;await click('Muat ulang pemeriksaan');await page.waitForFunction(()=>document.body.textContent.includes('sinyal teknis terpenuhi'));

 assert.deepEqual(errors,[]);console.log('PASS operational snapshot pending evidence, responsive 320/390/768/1440, safe JSON download, error/retry and stale data removal (mocked API)');
}finally{await browser?.close();if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const [p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
