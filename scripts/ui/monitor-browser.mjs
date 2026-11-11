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
const route = `app/monitor-check-${Date.now()}`,
  path = "/" + route.slice(4),
  port = 23000 + Math.floor(Math.random() * 4000),
  origin = `http://127.0.0.1:${port}`,
  dist = `.next-stage2-monitor-audit-${Date.now()}`,
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
    `import {OperationsPanel} from '../../components/operations/panel';import {DashboardShell} from '../../components/layout/dashboard-shell';export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const p=await searchParams;return <DashboardShell role={p.role==='teacher'?'teacher':'admin'} name="Pengguna Uji"><h1>Peninjauan ujian</h1><OperationsPanel mode={p.rooms?'rooms':'monitor'}/></DashboardShell>;}`,
  );
  const log = createWriteStream("/tmp/monitor-browser-dev.log");
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
  const id=n=>`07000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  let audience='admin',mode='ok',optionMode='ok',historyMode='ok',postMode='ok',held=null,heldPost=null,heldHistory=null,calls=[],listSize=51,examNow=id(80),activeReads=0,maxReads=0,reads=0;
  const revisions=new Map(),states=new Map(),followups=[];
  const row=n=>({student_id:id(n),student:'Peserta '+n+' '+(n===1?'Nama'.repeat(30):''),username:'siswa-'+n,attempt_id:n%3===0?null:id(100+n),version:n%3===0?null:revisions.get(n)||1,status:states.get(n)||(n%3===0?'not_started':n%3===1?'in_progress':'disqualified'),logged_in:n%3!==0,answers:n%3===0?0:2,events:3,countable_events:0,open_integrity:n===1&&!followups.some(f=>f.action==='resolve')?1:0,session:n===1?'Sesi 1':null,last_seen_at:'2026-11-02T01:00:00Z',last_saved_at:'2026-11-02T00:59:00Z',deadline_at:n%3===0?null:'2026-11-02T23:00:00Z',room:n===1?'Ruang '+ 'panjang'.repeat(30):'Ruang A',room_id:id(40),can_act:audience==='admin'||n%2===1,score:null,pending:n%3===0?null:0});
  const monitor=()=>Array.from({length:listSize},(_,i)=>row(i+1));
  const help=()=>[{id:id(800),attempt_id:id(101),student:'Peserta 1',message:'Jaringan terputus '+ 'panjang '.repeat(30),created_at:'2026-11-02T01:00:00Z',resolved_at:states.get('help')?'2026-11-02T02:00:00Z':null,resolution:states.get('help')||null,can_resolve:true}];
  const sent=()=>[{id:id(700),title:'Periksa jadwal',priority:'important',message:'Pesan uji',created_at:'2026-11-02T01:00:00Z',receipts:[{student:'Peserta 1',read_at:null}]}];
  const history=()=>({events:[{kind:'visibility',countable:false,metadata:{note:'Catatan '+ 'panjang'.repeat(50)},created_at:'2026-11-02T01:00:00Z'}],overrides:[]});
  const rooms={rooms:[{id:id(40),name:'Ruang A',capacity:0,count:1}],sessions:[{id:id(41),name:'Sesi 1',starts_at:'2026-11-02T00:00:00Z',ends_at:'2026-11-02T03:00:00Z'}],eligible:[{id:id(1),name:'Peserta 1'}],roster:[],assignments:[]};
  const respond=async(r,status,data)=>{try{await r.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:status===409?'CONFLICT: Attempt berubah':'Layanan sementara gagal'}})});}catch{}};
  page.on('request',async r=>{
    const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return r.continue();
    if(u.pathname==='/api/operations/integrity'){
      if(r.method()==='GET')return respond(r,200,{open_groups:followups.some(f=>f.action==='resolve')?[]:[id(901)],events:[{event_id:id(902),group_id:id(901),kind:'visibility_hidden',countable:true,created_at:'2026-11-02T01:00:00Z',metadata:{duration_ms:22000,question_number:2}}],followups:[...followups].reverse()});
      const input=JSON.parse(r.postData());followups.push({id:input.request_id,group_id:input.group_id,action:input.action,message:input.message,actor:'Pengawas Uji',created_at:'2026-11-02T01:01:00Z'});return respond(r,200,{saved:true});
    }
    if(u.pathname==='/api/operations/live')return r.respond({status:204});
    if(u.pathname==='/api/operations'&&r.method()==='GET'){
      const action=u.searchParams.get('action');
      if(!action)return respond(r,optionMode==='fail'?503:200,optionMode==='malformed'?null:{admin:audience==='admin',organization_id:id(90),exams:[{id:id(80),title:'Ujian IPS'},{id:id(81),title:'Ujian Informatika '+ 'Nama'.repeat(25)}],staff:[{id:id(91),name:'Guru',role:'teacher'}]});
      if(action==='monitor'){reads++;activeReads++;maxReads=Math.max(maxReads,activeReads);if(mode==='hold'){held=r;return;}await sleep(15);activeReads--;if(mode==='error')return respond(r,503,null);if(mode==='malformed')return respond(r,200,{rows:null});examNow=u.searchParams.get('exam');return respond(r,200,monitor());}
      if(action==='history'||action==='sent'){if(historyMode==='hold'){heldHistory=r;return;}return respond(r,historyMode==='fail'?503:200,action==='sent'?sent():history());}
      if(action==='rooms')return respond(r,200,rooms);
    }
    if(u.pathname==='/api/workflow'&&r.method()==='GET'){return respond(r,mode==='signals-fail'?503:200,u.searchParams.get('action')==='signals'?monitor().filter(x=>x.attempt_id).map(x=>({attempt_id:x.attempt_id,last_seen_at:'2026-11-02T00:00:00Z',connection:'stale',help_count:1})):help());}
    if(r.method()==='POST'){
      const input=JSON.parse(r.postData());calls.push(input);if(postMode==='hold'){heldPost=r;return;}if(postMode==='conflict')return respond(r,409,null);if(postMode==='uncertain')return respond(r,503,null);
      if(u.pathname==='/api/workflow'){if(input.action==='resolve'){states.set('help',input.reason);return respond(r,200,{resolved:true});}return respond(r,200,{deadline_at:'2026-11-02T23:05:00Z',minutes:input.minutes});}
      if(input.action==='broadcast')return respond(r,200,{id:id(700),recipients:input.scope==='selected'?input.student_ids.length:51});
      if(['unlock','reset','disqualify'].includes(input.action)){for(const a of input.attempts){const n=Number(a.id.slice(-12))-100;revisions.set(n,a.version+1);states.set(n,input.action==='unlock'?'in_progress':input.action==='reset'?'not_started':'disqualified');}return respond(r,200,input.attempts.map(a=>({id:a.id,saved:true})));}
      return respond(r,200,['room_save','session_save','assign'].includes(input.action)?{id:id(40)}:{saved:true});
    }
    return respond(r,200,[]);
  });
  const click=async(text,scope='')=>{await page.waitForFunction(({text,scope})=>{const root=scope?document.querySelector(scope):document;return !!root&&[...root.querySelectorAll('button')].some(b=>b.textContent.trim()===text&&!b.matches(':disabled'));},{timeout:15000},{text,scope});return page.evaluate(({text,scope})=>{const root=scope?document.querySelector(scope):document;const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.matches(':disabled'));if(!b)throw Error('Unavailable '+text);b.focus();b.click();},{text,scope});};
  const fill=async(selector,value)=>{const e=await page.$(selector);await e.focus();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await e.press('Backspace');if(value)await e.type(value);};
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.monitor-freshness')?.textContent.includes('Pembaruan terakhir:'));
  const go=async(role='admin',room=false)=>{audience=role;mode='ok';postMode='ok';historyMode='ok';optionMode='ok';await page.goto(origin+path+'?role='+role+(room?'&rooms=1':''),{waitUntil:'networkidle0'});await ready();};
  const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');
  const fits=async()=>assert(await page.$eval('[role=dialog]',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;}),'dialog bounds');
  const close=async()=>{await page.click('[aria-label="Tutup dialog"]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();};
  const choose=async n=>page.$eval(`input[aria-label^="Pilih Peserta ${n} "]`,e=>e.click());
  for(const width of (process.env.EDUTARA_MONITOR_FOCUSED?[390]:[320,390,768,1024,1440])){await page.setViewport({width,height:800});await go();await overflow('monitor '+width);await click('Kirim notifikasi');await fits();await close();await click('Riwayat pesan');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Pesan uji'));await fits();await close();}
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();await page.addScriptTag({content:axe.source});let scan=await page.evaluate(()=>window.axe.run(document.querySelector('.monitor-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);await page.screenshot({path:'/tmp/monitor-mobile.png',fullPage:true});
  await page.select('select[aria-label="Status"], .list-filters label select', 'integrity');
  await page.waitForFunction(()=>document.querySelectorAll('.monitor-page table tbody tr').length===1);
  await click('Riwayat');
  await page.waitForSelector('[role=dialog] details.panel summary');
  await page.click('[role=dialog] details.panel summary');
  assert(await page.$eval('[role=dialog]',e=>e.innerText.includes('Soal 2')&&e.innerText.includes('22 detik')));
  for(const [action,message] of [['Kirim peringatan','Periksa halaman ujian'],['Catat klarifikasi','Klarifikasi siswa tercatat'],['Tutup insiden','Insiden telah ditinjau']]){
    await click(action,'[role=dialog]');
    await fill('[role=dialog] textarea',message);
    await click('Simpan','[role=dialog]');
    await page.waitForFunction(text=>document.querySelector('[role=dialog] .monitor-timeline')?.textContent.includes(text),{},message);
  }
  assert.equal(followups.length,3);
  await close();
  await page.select('select[aria-label="Status"], .list-filters label select','');
  // Status-specific actions, frozen CAS version, synchronous lock and protected dialog.
  await choose(2);assert(await page.$eval('button',()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Diskualifikasi').disabled));await click('Buka kunci');await fits();await fill('[role=dialog] textarea','Gangguan perangkat');await fill('[role=dialog] input','KONFIRMASI');postMode='hold';const before=calls.length;await click('Konfirmasi','[role=dialog]');await page.waitForFunction(()=>document.querySelector('[role=dialog] form')?.getAttribute('aria-busy')==='true');await page.click('[aria-label="Tutup dialog"]');assert(await page.$('[role=dialog]'));await page.evaluate(()=>document.querySelector('[role=dialog] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.length,before+1);assert.equal(calls.at(-1).attempts[0].version,1);postMode='ok';states.set(2,'in_progress');revisions.set(2,2);await respond(heldPost,200,[{saved:true}]);heldPost=null;await page.waitForSelector('[role=dialog]',{hidden:true});await ready();
  // A filter clears hidden selections; shrinking data clamps page.
  await choose(1);await fill('input[type=search][aria-label="Cari siswa/ruang"]','nomatch');await page.waitForFunction(()=>document.body.textContent.includes('0 / 500 dipilih'));await click('Reset filter');await click('Berikutnya');await click('Berikutnya');listSize=2;await click('Muat ulang');await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Halaman 1 / 1')));listSize=51;await click('Muat ulang');await ready();assert(await page.evaluate(()=>document.body.textContent.includes('Halaman 1 / 3')));
  // History errors have retry; a closed old response cannot replace another dialog.
  historyMode='fail';await click('Riwayat pesan');await page.waitForSelector('[role=dialog] [role=alert]');historyMode='ok';await click('Coba muat riwayat','[role=dialog]');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Pesan uji'));await close();historyMode='hold';await click('Riwayat pesan');await sleep(40);const oldHistory=heldHistory;await close();historyMode='ok';await click('Kirim notifikasi');await respond(oldHistory,200,sent());assert(await page.$('[role=dialog] textarea'));await close();
  // Bounded reads: slow polling, SSE refresh and reload never pile up requests.
  await page.evaluate(()=>{const original=window.setInterval;window.setInterval=(fn,delay,...args)=>original(fn,delay===5000?80:delay,...args);});await go();mode='hold';maxReads=0;const initialReads=reads;await click('Muat ulang');await sleep(5200);assert(reads-initialReads<=1);assert(maxReads<=1);const slow=held;mode='ok';activeReads--;await respond(slow,200,monitor());held=null;await ready();
  // Immediate exam switch cancels old results. Malformed/failed reads are not empty success.
  mode='hold';await click('Muat ulang');await sleep(30);const stale=held;mode='ok';await page.select('.monitor-page > fieldset > .toolbar select',id(81));await ready();activeReads--;await respond(stale,200,[{...row(99),student:'STALE_MARKER'}]);assert(!(await page.evaluate(()=>document.body.textContent.includes('STALE_MARKER'))));assert.equal(examNow,id(81));
  mode='malformed';await click('Muat ulang');await page.waitForSelector('.list-filters [role=alert]');assert.equal(await page.$$eval('.monitor-page table tbody tr',xs=>xs.length),0);mode='ok';await click('Muat ulang');await ready();
  // Uncertain writes block automatic resubmission, require refresh, and keep idempotency key.
  await choose(1);await click('Reset percobaan');await fill('[role=dialog] textarea','Gangguan perangkat');await fill('[role=dialog] input','KONFIRMASI');postMode='uncertain';await click('Konfirmasi','[role=dialog]');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Tutup dan periksa ulang'));const requestId=calls.at(-1).request_id;postMode='ok';await click('Tutup dan periksa ulang');await ready();await click('Reset percobaan');await fill('[role=dialog] textarea','Gangguan perangkat');await fill('[role=dialog] input','KONFIRMASI');await click('Konfirmasi','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).request_id,requestId);
  // Notification targeting, history and help/time-allowance workflows remain available.
  await choose(2);await click('Kirim notifikasi');await fill('[role=dialog] input:not([type=checkbox])','Periksa jadwal');await page.$eval('[role=dialog] select',s=>{s.value='important';s.dispatchEvent(new Event('change',{bubbles:true}));});await page.$$eval('[role=dialog] select',ss=>{const s=ss.find(s=>[...s.options].some(o=>o.value==='selected'));s.value='selected';s.dispatchEvent(new Event('change',{bubbles:true}));});await fill('[role=dialog] textarea','Periksa jadwal ujian');await click('Konfirmasi','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).scope,'selected');assert.deepEqual(calls.at(-1).student_ids,[id(2)]);
  await click('Tangani');await fill('[role=dialog] textarea','Sudah ditangani petugas');await click('Tandai ditangani','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});assert.equal(calls.at(-1).action,'resolve');
  await page.select('.incident-actions select',id(102));await fill('[role=dialog] textarea','Gangguan jaringan');await fill('[role=dialog] input:not([type=number])','TAMBAH WAKTU');await click('Berikan dispensasi','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});assert.equal(calls.at(-1).action,'extend');
  await go('teacher');assert.equal(await page.$('.incident-actions select'),null);await choose(2);assert(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reset percobaan').disabled));
  // Shared Rooms mode: forms, zero capacity and date validation remain compatible.
  await go('admin',true);await click('Tambah ruang');await fill('[role=dialog] input','Ruang Baru');await click('Konfirmasi','[role=dialog]');await page.waitForSelector('[role=dialog]',{hidden:true});await ready();assert.equal(calls.at(-1).capacity,0);await click('Tambah sesi');await fits();await close();
  for(const [width,height] of [[844,390],[320,320],[390,844]]){await page.setViewport({width,height});await go();await overflow('orientation');await click('Kirim notifikasi');await fits();await close();}
  await page.addStyleTag({content:'html{font-size:200%}'});await overflow('text200');await click('Kirim notifikasi');await fits();await page.addScriptTag({content:axe.source});scan=await page.evaluate(()=>window.axe.run(document.querySelector('[role=dialog]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>v.id),[]);await close();assert.deepEqual(errors,[]);
  console.log('PASS monitor production components: Admin/Guru,320–1440,orientation/text200/touch/axe; null attempts,status transitions,CAS snapshot,submit lock,selection/filter/page clamp,history race/retry,single-flight,exam race,malformed/error/uncertain recovery,idempotency,notifications,help/extend,Rooms zero/date forms; API writes simulated');
}catch(e){console.error(e);try{await page?.screenshot({path:'/tmp/monitor-failure.png',fullPage:true});console.log(await page.evaluate(()=>document.querySelector('main')?.innerText.slice(-2400)));}catch{}process.exitCode=1;}finally{try{if(browser){await Promise.race([browser.close(),sleep(5000)]);browser.process()?.kill('SIGKILL');}}catch{}if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}rmSync(route,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(originals)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}}
