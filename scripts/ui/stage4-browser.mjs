import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const route='app/stage4-check',dist=`.next-stage2-stage4-${Date.now()}`,port=20000+Math.floor(Math.random()*10000),origin=`http://127.0.0.1:${port}`;
const originals=Object.fromEntries(['next-env.d.ts','tsconfig.json','AGENTS.md'].map(p=>[p,existsSync(p)?readFileSync(p,'utf8'):null]));
let server,browser;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(existsSync(route))throw Error('Temporary route already exists');
try{
 mkdirSync(route);writeFileSync(`${route}/page.tsx`,readFileSync('tests/fixtures/stage4-ui.tsx'));
 const log=createWriteStream('/tmp/edutara-stage4-dev.log');server=spawn('npm',['run','dev','--','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,EDUTARA_UI_TEST_DIST:dist,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.pipe(log);server.stderr.pipe(log);
 for(let n=0;n<120;n++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await sleep(500);if(n===119)throw Error('Server startup failed');}
 browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',req=>{const url=new URL(req.url());if(!url.pathname.startsWith('/api/'))return void req.continue();let data={};if(url.pathname==='/api/authoring')data={classes:[{id:'00000000-0000-4000-8000-000000000001',name:'Kelas VII'}],subjects:[{id:'00000000-0000-4000-8000-000000000002',name:'Matematika'}],exams:[],examClasses:[]};else if(url.pathname==='/api/bank')data={rows:[],total:0};else if(url.pathname==='/api/operations')data={exams:[]};else if(url.pathname==='/api/assessment')data=url.searchParams.has('action')?[]:{rows:[],total:0,admin:true};void req.respond({status:200,contentType:'application/json',body:JSON.stringify({data})});});
 mkdirSync('/tmp/edutara-stage4-shots',{recursive:true});
 async function click(text){const el=await page.waitForSelector('button');void el;const handle=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t),text);assert(await handle.evaluate(x=>!!x),text);await handle.evaluate(x=>x.scrollIntoView({block:'center'}));await handle.click();}
 for(const width of [320,390,768,1440]){
  await page.setViewport({width,height:900});for(const mode of ['bank','grading']){
   await page.goto(origin+'/stage4-check?mode='+mode,{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.body.textContent.includes('Memuat antrean koreksi…'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${mode} ${width}`);
   if(mode==='bank'){
    await click('Tambah soal bank');await page.waitForSelector('[role=dialog]');assert(await page.$('textarea'));await page.screenshot({path:`/tmp/edutara-stage4-shots/bank-dialog-${width}.png`,fullPage:true});await page.keyboard.press('Escape');await page.waitForSelector('[role=dialog]',{hidden:true});
    await click('Susun paket dari kisi-kisi');await page.waitForSelector('[role=dialog]');await page.keyboard.press('Escape');await page.waitForSelector('[role=dialog]',{hidden:true});
   }else{assert(await page.evaluate(()=>document.body.textContent.includes('Belum ada hasil untuk dinilai')));assert(await page.evaluate(()=>document.body.textContent.includes('Publikasi nilai terjadwal')));}
   await page.screenshot({path:`/tmp/edutara-stage4-shots/${mode}-${width}.png`,fullPage:true});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS bank and assessment empty/loading completion, authoring and blueprint dialogs/Escape, admin publication form and document overflow at 320/390/768/1440 (mocked API)');
}finally{await browser?.close();if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const [p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
