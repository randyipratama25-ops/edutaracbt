import {stagingDatabase} from '../stage4-local-db.mjs';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {restoreArtifact} from './restore-artifact.mjs';
import {byteHash} from '../restore-drill.mjs';
const db=await stagingDatabase(),org='6e143c55-7be5-4e6e-9f1a-8f8db429956a',uid=n=>`03000000-0000-4000-8000-${String(n).padStart(12,'0')}`,session=n=>`13000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=async n=>{await db.exec('reset role;set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid(n),session_id:session(n),role:'authenticated'})]);};
const rpc=async input=>(await db.query('select public.operational_health($1::jsonb) r',[JSON.stringify(input)])).rows[0].r;
const deny=async(fn,re)=>{await db.exec('savepoint denied');await assert.rejects(fn,re);await db.exec('rollback to savepoint denied;release savepoint denied');};
const root='/tmp/ops-drill-'+randomUUID();
try{
 const fixture=readFileSync('supabase/tests/attempts.sql','utf8');await db.exec(fixture.slice(0,fixture.indexOf('create function pg_temp.assert_test')));
 await actor(2);await deny(()=>rpc({}),/AUTH/);await actor(5);await deny(()=>rpc({}),/AUTH/);
 await actor(1);const initial=await rpc({});assert.equal(initial.heartbeat_at,null);assert.equal(initial.drills.length,0);
 await db.exec('reset role');await db.query('update private.app_settings set automation_enabled=true where organization_id=$1',[org]);
 const stamp='2026-11-02T02:00:00Z';await db.query('select private.scheduler_tick($1::timestamptz)',[stamp]);await db.query('select private.scheduler_tick($1::timestamptz)',[stamp]);
 assert.equal((await db.query("select count(*)::int n from private.work_jobs where kind='backup' and dedupe='weekly:2026-45' and organization_id=$1",[org])).rows[0].n,1);
 assert.ok((await db.query('select last_success_at from private.scheduler_health')).rows[0].last_success_at);
 // No accumulation when a backup is still outstanding next week.
 await db.query('select private.scheduler_tick($1::timestamptz)',['2026-11-09T02:00:00Z']);assert.equal((await db.query("select count(*)::int n from private.work_jobs where kind='backup' and dedupe like 'weekly:%' and organization_id=$1",[org])).rows[0].n,1);
 await db.query('update private.app_settings set automation_enabled=false where organization_id=$1',[org]);
 await db.query("update private.work_jobs set status='succeeded' where organization_id=$1 and kind='backup'",[org]);
 const beforeDisabled=(await db.query("select count(*)::int n from private.work_jobs where organization_id=$1 and kind='backup'",[org])).rows[0].n;await db.query('select private.scheduler_tick($1::timestamptz)',['2026-11-16T02:00:00Z']);assert.equal((await db.query("select count(*)::int n from private.work_jobs where organization_id=$1 and kind='backup'",[org])).rows[0].n,beforeDisabled);

 const backup=(await db.query("insert into private.work_jobs(organization_id,kind,dedupe,status,result_checksum,updated_at) values($1,'backup','drill-fixture','succeeded',$2,now()-interval '1 hour') returning id",[org,'a'.repeat(64)])).rows[0].id;
 const input={action:'record',request_id:randomUUID(),backup_id:backup,backup_checksum:'a'.repeat(64),completed_at:new Date().toISOString(),duration_seconds:5,outcome:'passed',evidence:'Local evidence report',notes:'Restored rows and media compared; access verified in isolated environment.',confirmation:'KONFIRMASI'};
 await actor(1);await rpc(input);await rpc(input);let health=await rpc({});assert.equal(health.drills.length,1);assert.ok(health.last_passed_drill_at);
 await deny(()=>rpc({...input,notes:'Different evidence data'}),/ID permintaan/);await deny(()=>rpc({...input,request_id:randomUUID(),backup_checksum:'b'.repeat(64)}),/Backup/);await deny(()=>rpc({...input,request_id:randomUUID(),completed_at:'2099-01-01T00:00:00Z'}),/Waktu/);
 await db.exec('reset role');await db.query("insert into public.organizations(id,name) values('77777777-7777-4777-8777-777777777777','Other')");
 await db.query("update public.profiles set organization_id='77777777-7777-4777-8777-777777777777' where id=$1",[uid(1)]);await db.query("insert into private.app_settings(organization_id) values('77777777-7777-4777-8777-777777777777') on conflict do nothing");await actor(1);assert.equal((await rpc({})).drills.length,0);await deny(()=>rpc({...input,request_id:randomUUID()}),/Backup/);
 await db.exec('reset role');await db.query('update public.profiles set organization_id=$1 where id=$2',[org,uid(1)]);
 assert.equal((await db.query("select has_table_privilege('authenticated','private.recovery_drills','select') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.operational_health(jsonb)','execute') ok")).rows[0].ok,false);
 await deny(()=>db.query('delete from private.recovery_drills'),/append|immutable|audit|diubah|dihapus/i);
 const rows=(await db.query('select table_name as table,payload::text as record from private.backup_data($1)',[org])).rows;assert.ok(rows.some(r=>r.table==='private.recovery_drills'));
 mkdirSync(root);mkdirSync(root+'/data');const bytes=Buffer.from(JSON.stringify(rows));writeFileSync(root+'/data/000001.json',bytes);
 const manifest=Buffer.from(JSON.stringify({organization_id:org,job_id:backup,rows:rows.length,objects:0,parts:[{kind:'data',path:org+'/'+backup+'/data/000001.json',sha256:byteHash(bytes),bytes:bytes.length}]}));
 const restored=await restoreArtifact(root,manifest,byteHash(manifest));assert.equal(restored.outcome,'passed');assert.equal(restored.production_restored,false);
 await assert.rejects(()=>restoreArtifact(root,manifest,'b'.repeat(64)),/checksum/i);writeFileSync(root+'/data/000001.json','corrupted');await assert.rejects(()=>restoreArtifact(root,manifest,byteHash(manifest)),/checksum/i);
 console.log('PASS weekly dedupe/backpressure, scheduler heartbeat, disabled automation, Admin/tenant/grant boundaries, append-only idempotent drill evidence, original artifact checksum/corruption and exact isolated restore');
}finally{await db.close();rmSync(root,{recursive:true,force:true});}
