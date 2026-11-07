import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,rmSync,createWriteStream} from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import axe from 'axe-core';
const port=22000+Math.floor(Math.random()*5000),origin=`http://127.0.0.1:${port}`,dist=`.next-stage2-home-${Date.now()}`;
const original=Object.fromEntries(['next-env.d.ts','tsconfig.json','AGENTS.md'].map(p=>[p,existsSync(p)?readFileSync(p,'utf8'):null]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let server,browser;
try{
 const log=createWriteStream('/tmp/home-browser-dev.log');server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{detached:process.platform!=='win32',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',EDUTARA_UI_TEST_DIST:dist,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.pipe(log);server.stderr.pipe(log);
 for(let n=0;n<120;n++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(n===119)throw Error('Startup failed');await sleep(500);}
 browser=await puppeteer.launch({args:chromium.args,executablePath:process.env.EDUTARA_TEST_CHROME||await chromium.executablePath(),headless:true});
 const page=await browser.newPage(),errors=[],apiCalls=[],authConfirm=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/auth/confirm'){authConfirm.push(url);return void r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Confirm callback</title><p>Existing callback handler reached</p>'});}if(url.pathname.startsWith('/api/')){apiCalls.push(url.pathname);return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{ready:true}})});}if(url.pathname==='/login'&&url.searchParams.has('_rsc')){setTimeout(()=>void r.continue(),1000);return;}void r.continue();});
 const click=async text=>{const h=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t),text);assert(await h.evaluate(e=>!!e),text);await h.evaluate(e=>e.scrollIntoView({block:'center'}));await h.click();await h.dispose();};
 const noOverflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow');
 const dialogBounds=async label=>{await page.waitForSelector('[role=dialog]');await noOverflow(label);assert(await page.$eval('[role=dialog]',e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),label+' dialog bounds');};
 const scan=async label=>{await page.addScriptTag({content:axe.source});const r=await page.evaluate(async()=>await window.axe.run({exclude:[['nextjs-portal']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));assert.deepEqual(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label+' axe');};
 for(const [width,height]of [[320,900],[390,844],[768,1024],[1440,900],[844,390],[320,320]]){
  await page.setViewport({width,height});await page.goto(origin,{waitUntil:'networkidle0'});await page.waitForSelector('#home-title');await noOverflow(`${width}x${height}`);
  assert.equal(await page.$$eval('main',e=>e.length),1);assert.equal(await page.$$eval('h1',e=>e.length),1);assert.equal(await page.$eval('a[href="/login"]',e=>e.textContent.trim()),'Masuk ke aplikasi');assert(!(await page.content()).includes('Pelaksanaan ujian belum dibuka'));
  assert(await page.$eval('.home-actions .button',e=>e.getBoundingClientRect().height>=44));
  await click('Bantuan');await page.waitForSelector('[role=dialog]');await dialogBounds(`${width}x${height}`);await page.select('[id$="-scope"]','all');await page.waitForFunction(()=>document.querySelector('[role=dialog] [role=status]')?.textContent.includes('4 panduan'));if(width===320)await scan('home help 320');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='Bantuan');
 }
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.goto(origin,{waitUntil:'networkidle0'});const touch=await page.$eval('.home-actions button',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});await page.touchscreen.tap(touch.x,touch.y);await page.waitForSelector('[role=dialog]');
 await page.type('[type=search]','zz-no-matching-help');await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.textContent.includes('Tidak ada panduan'));await click('Tampilkan semua panduan peran saya');await page.waitForFunction(()=>document.querySelector('[role=dialog] [role=status]')?.textContent.includes('4 panduan'));
 for(let n=0;n<9;n++)await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')),'focus trap');
 for(const [width,height]of [[1440,900],[320,568],[844,390]]){await page.setViewport({width,height,isMobile:true,hasTouch:true});await dialogBounds('resize/orientation');}
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='Bantuan');
 await page.setViewport({width:320,height:568,isMobile:true,hasTouch:true});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await noOverflow('200% text');await click('Bantuan');await dialogBounds('200% dialog');await page.keyboard.press('Escape');await page.evaluate(()=>document.documentElement.style.fontSize='');
 await page.goto(origin,{waitUntil:'networkidle0'});await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement?.classList.contains('skip-link')));await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');await scan('home 320');
 await page.screenshot({path:'/tmp/home-mobile.png',fullPage:true});await page.setViewport({width:1440,height:900});await page.goto(origin,{waitUntil:'networkidle0'});await scan('home desktop');await page.screenshot({path:'/tmp/home-desktop.png',fullPage:true});
 assert.deepEqual(apiCalls,[],'Normal home and help do not call application APIs');
 await page.click('a[href="/login"]');await page.waitForSelector('.home-link-state[data-pending="true"]');await page.waitForFunction(()=>location.pathname==='/login');await page.waitForSelector('#login-password');
 // Real reset page, simulated activation API; never uses production credentials.
 await page.goto(origin+'/#access_token=test-access-token&refresh_token=test-refresh-token&type=invite',{waitUntil:'networkidle0'});await page.waitForFunction(()=>location.pathname==='/auth/reset'&&!location.hash);await page.waitForFunction(()=>!document.querySelector('form button')?.disabled);assert(apiCalls.includes('/api/auth/activate'));
 await page.goto(origin+'/?code=test%2Bcode&next=https://outside.invalid',{waitUntil:'networkidle0'});await page.waitForFunction(()=>location.pathname==='/auth/confirm');assert.equal(authConfirm.at(-1).searchParams.get('code'),'test+code');assert.equal(authConfirm.at(-1).searchParams.get('next'),null);
 await page.goto(origin+'/?token_hash=test-email-hash&type=recovery',{waitUntil:'networkidle0'});await page.waitForFunction(()=>location.pathname==='/auth/confirm');assert.equal(authConfirm.at(-1).searchParams.get('type'),'recovery');
 await page.goto(origin+'/?utm_source=school#error=access_denied&error_description=NEVER_RENDER_SECRET&access_token=test-access-token',{waitUntil:'networkidle0'});await page.waitForSelector('[role=alert]');assert(!(await page.content()).includes('NEVER_RENDER_SECRET'));assert.equal(await page.evaluate(()=>location.hash),'');assert.equal(await page.evaluate(()=>location.search),'?utm_source=school');await noOverflow('invalid callback');
 // Hash-only navigation and history events on the same mounted page.
 await page.goto(origin,{waitUntil:'networkidle0'});await page.evaluate(()=>location.hash='access_token=only-partial-token');await page.waitForSelector('[role=alert]');assert.equal(await page.evaluate(()=>location.hash),'');
 await page.goto(origin,{waitUntil:'networkidle0'});await page.evaluate(()=>{history.pushState(history.state,'','/?code=');dispatchEvent(new PopStateEvent('popstate'));});await page.waitForSelector('[role=alert]');assert.equal(await page.evaluate(()=>location.search),'');
 await page.goto(origin,{waitUntil:'networkidle0'});await page.evaluate(()=>location.hash='access_token=test-access-token&refresh_token=test-refresh-token');await page.waitForFunction(()=>location.pathname==='/auth/reset'&&!location.hash);
 await page.goto(origin,{waitUntil:'networkidle0'});
 assert.equal(await page.$$('.home-role').then(nodes=>nodes.length),3);
 for(const [route,mime] of [['/favicon.ico','image/'],['/icon.svg','image/svg+xml'],['/apple-icon.png','image/png']]){
  const response=await fetch(origin+route);
  assert.equal(response.status,200,route);
  assert(response.headers.get('content-type').startsWith(mime),route+' MIME');
  assert((await response.arrayBuffer()).byteLength>100,route+' content');
 }
 assert(await page.$('link[rel="icon"][href^="/icon.svg"]'));
 assert(await page.$('link[rel="apple-touch-icon"]'));
 await page.click('a[href="#peran"]');
 assert.equal(await page.evaluate(()=>location.hash),'#peran');
 await noOverflow('roles anchor');
 const nojs=await browser.newPage();await nojs.setJavaScriptEnabled(false);await nojs.goto(origin,{waitUntil:'domcontentloaded'});assert(await nojs.$('a[href="/login"]'));assert((await nojs.content()).includes('Aktifkan JavaScript'));await nojs.close();
 assert.deepEqual(errors,[]);console.log('PASS home actual route: 320/390/768/1440, short screens/orientation/200% text, touch, help empty/all/keyboard/focus, axe, login, fragment/code/email/error/history callbacks, no API on home and no-JS fallback (auth APIs simulated)');
}catch(e){console.error(e);process.exitCode=1;}finally{
 if(browser){try{await Promise.race([browser.close(),sleep(5000)]);browser.process()?.kill('SIGKILL');}catch{}}
 if(server){try{if(process.platform==='win32')server.kill('SIGTERM');else process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>server.once('exit',r)),sleep(1500)]);}
 rmSync(dist,{recursive:true,force:true});for(const[p,s]of Object.entries(original)){if(s===null)rmSync(p,{force:true});else writeFileSync(p,s);}
}
