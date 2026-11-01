import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const started=Date.now(),checks=[];
mkdirSync('artifacts/operations',{recursive:true});
for(const script of ['scripts/stage6-integration.mjs','scripts/advanced-features-integration.mjs','scripts/notification-integration.mjs','scripts/release/rollback-drill.mjs','scripts/operations/integration.mjs']){
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env},timeout:240000,maxBuffer:1024*1024});
 const passed=result.status===0;checks.push({script,passed});console.log((passed?'PASS ':'FAIL ')+script);if(!passed){console.error(result.stderr||result.stdout);}
}
const passed=checks.every(c=>c.passed);
writeFileSync('artifacts/operations/periodic-drill.json',JSON.stringify({format:'edutara-periodic-fixture-drill-v1',scope:'synthetic-fixtures-isolated-pglite',candidate_sha:process.env.GITHUB_SHA||null,completed_at:new Date().toISOString(),duration_seconds:Math.ceil((Date.now()-started)/1000),outcome:passed?'passed':'failed',production_restored:false,original_backup_verified:false,checks},null,2)+'\n');
if(!passed)process.exitCode=1;
