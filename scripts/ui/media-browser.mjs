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
const route = `app/media-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-media-${Date.now()}`,
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
    `import {MediaPanel} from '../../components/operations/media';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Media soal</h1><MediaPanel admin={p.role!=='teacher'}/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/media-browser-dev.log");
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
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgXkAAAAASUVORK5CYII=','base64');writeFileSync('/tmp/media-good.png',png);writeFileSync('/tmp/media-other.png',png);writeFileSync('/tmp/media-bad.svg','<svg></svg>');
  const wav=Buffer.alloc(44+16000*8);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  let audioSignatures=0;
  const asset=n=>({id:id(n),object_path:id(90)+'/'+ 'panjang'.repeat(n===1?25:1)+'-'+n+'.png',mime_type:n===3?'audio/wav':'image/png',byte_size:n===3?wav.length:png.length,referenced:n===1});
  let items=Array.from({length:51},(_,i)=>asset(i+1)),mode='ok',cleanupFail=false,previewFail=false,postMode='ok',held=null,heldPost=null,calls=[],pending=[{id:id(500),path:id(90)+'/'+ 'sisa'.repeat(70)}],drivePage=0;
  const respond=async(r,status,data)=>{try{await r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:status===422?'Media masih dipakai soal':'Layanan sementara gagal'}})});}catch{}};
  page.on('request',async r=>{
    const u=new URL(r.url());if(u.pathname==='/fake.wav')return r.respond({status:200,contentType:'audio/wav',body:wav});if(u.pathname==='/fake.png')return r.respond({status:200,contentType:'image/png',body:png});if(!u.pathname.startsWith('/api/'))return r.continue();
    if(u.pathname==='/api/media/manage'&&r.method()==='GET'){
      if(u.searchParams.has('cleanup'))return respond(r,cleanupFail?503:200,pending);
      if(mode==='hold'){held=r;return;}if(mode==='error')return respond(r,503,null);if(mode==='malformed')return respond(r,200,{rows:null,total:1});
      const search=u.searchParams.get('search')||'',mime=u.searchParams.get('mime')||'',p=Number(u.searchParams.get('page')||1);const rows=items.filter(x=>(x.id+' '+x.object_path).includes(search)&&x.mime_type.startsWith(mime));return respond(r,200,{rows:rows.slice((p-1)*50,p*50),total:rows.length});
    }
    if(u.pathname==='/api/authoring/media'&&r.method()==='GET')return respond(r,previewFail?503:200,{url:origin+(u.searchParams.get('id')===id(3)?'/fake.wav?v='+(++audioSignatures):'/fake.png'),mime:u.searchParams.get('id')===id(3)?'audio/wav':'image/png'});
    if(r.method()==='POST'){
      const input=u.pathname==='/api/authoring/media'?{action:'upload'}:JSON.parse(r.postData());calls.push(input);
      if(postMode==='hold'){heldPost=r;return;}if(postMode==='uncertain')return respond(r,503,null);if(postMode==='referenced')return respond(r,422,null);
      if(input.action==='upload'){const m=asset(items.length+100);items.unshift(m);return respond(r,200,{id:m.id});}
      if(u.pathname==='/api/media/manage'){if(input.action==='delete')items=items.filter(x=>x.id!==input.id);else pending=[];return respond(r,200,{deleted:true,cleanup_pending:pending.length>0,message:pending.length?'Pembersihan tertunda.':'Media dihapus.'});}
      if(u.pathname==='/api/media/drive'){
        if(input.action==='list'){if(!input.page_token)drivePage=0;drivePage++;return respond(r,200,{folder:'folder_123456789',files:Array.from({length:drivePage===1?25:3},(_,i)=>({id:'drive_123456789_'+(drivePage*30+i),name:'Gambar '+i+' '+ 'Nama'.repeat(20),mimeType:'image/png',size:String(png.length)})),next_page_token:drivePage===1?'next':''});}
        return respond(r,200,{message:input.ids.length+'/'+input.ids.length+' file berhasil diimpor.'});
      }
    }
    return respond(r,200,[]);
  });
  const click=async(text,scope='')=>{await page.waitForFunction(({text,scope})=>{const root=scope?document.querySelector(scope):document;return !!root&&[...root.querySelectorAll('button')].some(b=>b.textContent.trim()===text&&!b.matches(':disabled'));},{timeout:15000},{text,scope});await page.evaluate(({text,scope})=>{const root=scope?document.querySelector(scope):document;const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.matches(':disabled'));b.focus();b.click();},{text,scope});};
  const fill=async(selector,value)=>{const e=await page.$(selector);await e.focus();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await e.press('Backspace');if(value)await e.type(value);};
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.list-filters')?.getAttribute('aria-busy')==='false'&&document.querySelector('.media-page')?.getAttribute('aria-busy')==='false');
  const go=async(role='admin')=>{mode='ok';previewFail=false;postMode='ok';cleanupFail=false;await page.goto(origin+path+'?role='+role,{waitUntil:'networkidle0'});await ready();};
  const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');
  const fits=async()=>assert(await page.$eval('[role=dialog]',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;}),'dialog bounds');
  const close=async()=>{await page.click('[aria-label="Tutup dialog"]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();};
  for(const width of (process.env.EDUTARA_MEDIA_FOCUSED?[390]:[320,390,768,1024,1440])){await page.setViewport({width,height:800});await go();await overflow('gallery '+width);await page.select('.list-filters select','table');await overflow('table '+width);await click('Hapus');await page.waitForSelector('[role=dialog]');await fits();await close();}
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();await page.addScriptTag({content:axe.source});let scan=await page.evaluate(()=>window.axe.run(document.querySelector('.media-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);await page.screenshot({path:'/tmp/media-mobile.png',fullPage:false});
  // Referenced protection, preview error/retry, and unavailable clipboard never throw.
  assert(await page.$eval('.media-card button:last-child',e=>e.disabled));await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));await click('Salin ID');await page.waitForFunction(()=>document.body.textContent.includes('Clipboard tidak tersedia.'));previewFail=true;await page.select('.list-filters select','table');await page.select('.list-filters select','gallery');await page.waitForSelector('.media-preview button');previewFail=false;await click('Coba pratinjau');await page.waitForSelector('.media-preview img');
  // Partial cleanup read failure must not hide the media list.
  cleanupFail=true;await click('Muat ulang');await ready();assert((await page.$$('.media-card')).length===50);assert(await page.$('[role=alert]'));cleanupFail=false;await click('Muat ulang');await ready();
  // Single upload lock covers input and drop; invalid files and >25 batches never POST.
  let before=calls.length;await (await page.$('input[type=file]')).uploadFile('/tmp/media-bad.svg');await ready();assert.equal(calls.length,before);
  await page.$eval('.ops-drop',e=>{const dt=new DataTransfer();for(let i=0;i<26;i++)dt.items.add(new File(['x'],'f'+i+'.png',{type:'image/png'}));e.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));});assert.equal(calls.length,before);
  postMode='hold';await (await page.$('input[type=file]')).uploadFile('/tmp/media-good.png');await page.waitForFunction(()=>document.querySelector('.media-page').getAttribute('aria-busy')==='true');await page.$eval('.ops-drop',e=>{const dt=new DataTransfer();dt.items.add(new File(['x'],'drop.png',{type:'image/png'}));e.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));});assert.equal(calls.length,before+1);postMode='ok';items.unshift(asset(200));await respond(heldPost,200,{id:id(200)});heldPost=null;await ready();assert(await page.evaluate(()=>document.body.textContent.includes('1/1 berhasil.')));
  postMode='uncertain';before=calls.length;await (await page.$('input[type=file]')).uploadFile('/tmp/media-good.png','/tmp/media-other.png');await ready();assert.equal(calls.length,before+1);assert(await page.evaluate(()=>document.body.textContent.includes('Hasil unggah belum pasti')));postMode='ok';
  // Delete lock, server reference errors and uncertain recovery keep context intact.
  await click('Hapus');await page.waitForSelector('[role=dialog]');postMode='hold';before=calls.length;await click('Hapus permanen','[role=dialog]');await page.waitForFunction(()=>document.querySelector('.media-page').getAttribute('aria-busy')==='true');await page.click('[aria-label="Tutup dialog"]');assert(await page.$('[role=dialog]'));assert.equal(calls.length,before+1);postMode='ok';items=items.filter(x=>x.id!==calls.at(-1).id);await respond(heldPost,200,{deleted:true,cleanup_pending:true,message:'Pembersihan tertunda.'});heldPost=null;await page.waitForSelector('[role=dialog]',{hidden:true});await ready();
  await click('Hapus');await page.waitForSelector('[role=dialog]');postMode='referenced';await click('Hapus permanen','[role=dialog]');await ready();assert(await page.$('[role=dialog]'));assert(await page.evaluate(()=>document.querySelector('[role=dialog]').textContent.includes('Media masih dipakai soal')));await close();postMode='ok';
  await page.$$eval('details',ds=>{const d=ds.find(d=>d.querySelector('summary')?.textContent.includes('Pembersihan tertunda'));d.open=true;});await click('Coba bersihkan');await ready();assert.equal(calls.at(-1).action,'cleanup');
  // Search and page clamp use server totals; stale and malformed reads never render as success.
  await click('Berikutnya');await ready();items=items.slice(0,2);await click('Muat ulang');await ready();await page.waitForFunction(()=>document.body.textContent.includes('halaman 1 / 1'));await ready();mode='hold';await click('Muat ulang');await sleep(40);const old=held;mode='ok';await fill('input[type=search]','nomatch');await sleep(300);await ready();await respond(old,200,{rows:[asset(999)],total:999});assert(await page.evaluate(()=>document.body.textContent.includes('0 media')));await click('Reset filter');await ready();mode='malformed';await click('Muat ulang');await ready();assert(await page.$('.list-filters [role=alert]'));assert.equal((await page.$$('.media-card')).length,0);mode='ok';await click('Muat ulang');await ready();
  // Drive selection is capped at25, paginated, imported, and unavailable to Guru.
  await page.$$eval('.media-drive',ds=>{ds[0].open=true;});await click('Baca folder berizin');await ready();await page.$$eval('.media-drive input[type=checkbox]',xs=>xs.forEach(x=>x.click()));await click('Muat file berikutnya');await ready();assert.equal(await page.$$eval('.media-drive input[type=checkbox]:disabled',xs=>xs.length),3);await click('Impor pilihan (25 / 25)');await ready();assert.equal(calls.at(-1).action,'import');assert.equal(calls.at(-1).ids.length,25);
  await go('teacher');assert.equal(await page.$('.media-drive'),null);
  for(const [width,height] of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await overflow('orientation');await click('Hapus');await page.waitForSelector('[role=dialog]');await fits();await close();}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow('text200');await click('Hapus');await page.waitForSelector('[role=dialog]');await fits();await page.addScriptTag({content:axe.source});scan=await page.evaluate(()=>window.axe.run(document.querySelector('[role=dialog]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);await close();
  // Renewing a signed URL must not restart active playback; paused seek is retained.
  items=[asset(3)];await page.evaluateOnNewDocument(()=>{const original=window.setInterval;window.setInterval=(fn,delay,...args)=>original(fn,delay===50000?100:delay,...args);});await page.goto(origin+path+'?role=teacher',{waitUntil:'domcontentloaded'});await ready();await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);await page.$eval('audio',async a=>{a.muted=true;await a.play();});const playingSrc=await page.$eval('audio',a=>a.src);await sleep(350);assert.equal(await page.$eval('audio',a=>a.src),playingSrc);const pausedAt=await page.$eval('audio',a=>{a.pause();return a.currentTime;});await sleep(350);await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);assert(await page.$eval('audio',a=>a.paused));assert(Math.abs(await page.$eval('audio',a=>a.currentTime)-pausedAt)<.15,'paused seek retained');assert.deepEqual(errors,[]);
  console.log('PASS media production panel: Admin/Guru,320–1440,gallery/table/orientation/text200/touch/axe; protected/reference races,preview retry/clipboard fallback,partial cleanup reads,upload/drop lock/validation/uncertain stop,delete lock/cleanup,search/page clamp/stale/malformed,Drive25/pagination/import/role,audio playback/paused seek during URL renewal; API and Storage writes simulated');
}catch(e){console.error(e);try{await page?.screenshot({path:'/tmp/media-failure.png',fullPage:true});console.log(await page.evaluate(()=>document.querySelector('main')?.innerText.slice(-2600)));}catch{}process.exitCode=1;}finally{try{if(browser){await Promise.race([browser.close(),sleep(5000)]);browser.process()?.kill('SIGKILL');}}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
