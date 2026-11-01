import fs from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const route='app/context-help-check',dist='.next-stage2-context-help',port=27500+Math.floor(Math.random()*500),origin=`http://127.0.0.1:${port}`;
let server,browser;
const originals=Object.fromEntries(['next-env.d.ts','tsconfig.json','AGENTS.md'].map(p=>[p,fs.existsSync(p)?fs.readFileSync(p,'utf8'):null]));
if(fs.existsSync(route+'/page.tsx'))throw Error('Refusing to overwrite test route');
try {
 fs.mkdirSync(route,{recursive:true});fs.writeFileSync(route+'/page.tsx',`"use client";import {useEffect,useState} from 'react';import {ContextHelp} from '../../components/help/context-help';import type {HelpAudience} from '../../lib/help/catalog';import Fixture from '../../tests/fixtures/stage2-ui';export default function Page(){const[role,setRole]=useState<HelpAudience>('admin'),[page,setPage]=useState('/dashboard/advanced'),[mode,setMode]=useState('help');useEffect(()=>setMode(new URLSearchParams(location.search).get('mode')||'help'),[]);return mode!=='help'?<Fixture/>:<main id="main-content" className="workspace"><h1>Uji panduan</h1><label>Peran<select id="role" value={role} onChange={e=>setRole(e.target.value as HelpAudience)}>{['admin','teacher','supervisor','student','public'].map(x=><option key={x}>{x}</option>)}</select></label><label>Halaman<input id="page" value={page} onChange={e=>setPage(e.target.value)}/></label><ContextHelp audience={role} page={page} duringExam={page==='student-exam'}/></main>;}`);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{detached:true,env:{...process.env,EDUTARA_UI_TEST_DIST:dist},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(n===99)throw Error('Server startup');}
 browser=await puppeteer.launch({args:chromium.args,executablePath:process.env.EDUTARA_TEST_CHROME||await chromium.executablePath(),headless:true});
 const page=await browser.newPage(),errors=[],commands=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>{
  const url=new URL(r.url());requests.push(url.pathname);
  if(url.pathname!=='/api/attempts')return void r.continue();
  if(r.method()==='GET')return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:{exams:[]}})});
  const input=JSON.parse(r.postData());commands.push(input);
  const data=input.action==='save'?{acknowledgements:input.answers.map(a=>({question_id:a.question_id,saved:true,revision:1}))}:{};
  void r.respond({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 const click=label=>page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!b)throw Error('Missing '+label);b.focus();b.click();},label);
 const open=async()=>{await click('Bantuan');await page.waitForSelector('.context-help-dialog',{visible:true});};
 const close=async()=>{await page.keyboard.press('Escape');await page.waitForSelector('.context-help-dialog',{hidden:true});};
 const changePage=async value=>{await page.$eval('#page',(el,v)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
 for(const width of [320,390,768,1440]){
  await page.setViewport({width,height:900});await page.goto(origin+'/context-help-check',{waitUntil:'networkidle0'});await open();
  assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Mengatur AI dan fitur lanjutan')));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert(await page.$eval('.context-help-dialog',e=>e.scrollWidth<=e.clientWidth+1),'dialog overflow '+width);
  for(let n=0;n<7;n++)await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')),'focus trap');
  await close();await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='Bantuan');
 }
 await open();await page.select('.context-help-dialog select','all');await page.type('.context-help-dialog input[type=search]','zz-no-match');await page.waitForFunction(()=>document.querySelector('.context-help-dialog')?.textContent.includes('Tidak ada panduan'));
 await click('Tampilkan semua panduan peran saya');assert.equal(await page.$eval('.context-help-dialog input',e=>e.value),'');
 await page.setOfflineMode(true);await page.type('.context-help-dialog input[type=search]','deepseek');await page.waitForFunction(()=>document.querySelectorAll('.help-topic').length===1);await page.setOfflineMode(false);await close();
 await page.select('#role','teacher');await open();await page.select('.context-help-dialog select','all');assert.equal(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Mengatur AI dan fitur lanjutan')),false);await close();
 await page.select('#role','student');await changePage('student-exam');await open();assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Waktu ujian tetap berjalan')));assert.equal(await page.$$('.help-topic').then(x=>x.length),4);
 // Changing context closes a stale dialog, even if it was open.
 await page.select('#role','supervisor');await page.waitForSelector('.context-help-dialog',{hidden:true});await changePage('/supervisor');await open();assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Mendampingi peserta')));await close();
 await page.select('#role','public');await changePage('/login');await open();assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Masuk dan memulihkan akun')));await close();
 await page.goto(origin+'/context-help-check?mode=dashboard',{waitUntil:'networkidle0'});await page.waitForSelector('.workspace-header');assert(await page.$('.workspace-header button[aria-haspopup=dialog]'));
 await page.goto(origin+'/context-help-check?mode=student',{waitUntil:'networkidle0'});await page.waitForSelector('.student-portal-heading');await open();assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Menyiapkan perangkat')));await close();
 await page.goto(origin+'/context-help-check?mode=player',{waitUntil:'networkidle0'});await page.waitForSelector('input[type=radio]');await page.click('input[type=radio]');await page.click('.exam-tools summary');await open();
 const timer=await page.$eval('[role=timer]',e=>e.textContent);await page.waitForFunction(()=>document.querySelector('.exam-status')?.textContent.includes('Semua perubahan tersimpan'));
 await page.waitForFunction(old=>document.querySelector('[role=timer]')?.textContent!==old,{},timer);assert(commands.some(c=>c.action==='save'),'autosave continues');
 assert(await page.$eval('.context-help-dialog',e=>e.textContent.includes('Waktu ujian tetap berjalan')));assert.equal(await page.$$('.context-help-dialog a').then(x=>x.length),0);
 await page.setViewport({width:390,height:844});await page.screenshot({path:'/tmp/context-help-mobile.png'});await close();assert(await page.$eval('input[type=radio]',e=>e.checked));
 assert(!requests.some(p=>p.startsWith('/api/help')));assert.deepEqual(errors,[]);console.log('PASS contextual/role help, search/empty/offline, context reset, focus/Escape, actual shell/student/player integration, timer/autosave continuity, 320/390/768/1440 (fixture APIs)');
} catch(e){console.error(e);process.exitCode=1;}
finally {
 try{await browser?.close();}catch{}
 if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);}
 fs.rmSync(route,{recursive:true,force:true});fs.rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)fs.rmSync(p,{force:true});else fs.writeFileSync(p,s);}
}
