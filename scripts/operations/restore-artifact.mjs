// Never connects to an external database. The only target is a fresh in-memory PGlite.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {stagingDatabase} from '../stage4-local-db.mjs';
import {verifyArtifact,restoreRows,byteHash} from '../restore-drill.mjs';
export async function restoreArtifact(root,manifestBytes,expectedChecksum){
 assert.match(expectedChecksum,/^[a-f0-9]{64}$/);assert.equal(byteHash(manifestBytes),expectedChecksum,'Manifest checksum differs');
 const started=Date.now(),manifest=JSON.parse(manifestBytes.toString('utf8'));
 assert.match(manifest.organization_id,/^[a-f0-9-]{36}$/);assert.match(manifest.job_id,/^[a-f0-9-]{36}$/);
 assert.ok(Array.isArray(manifest.parts)&&manifest.parts.length>0,'Empty artifact');
 const artifact=await verifyArtifact(root,manifest);assert.ok(artifact.rows.length>0,'Empty data');
 const db=await stagingDatabase();
 try{
  const restored=await restoreRows(db,artifact.rows);
  for(const table of new Set(artifact.rows.map(r=>r.table).filter(t=>t!=='auth.identities_safe'))){
   assert.match(table,/^(public|private)\.[a-z_][a-z0-9_]*$/);
   const expected=[];
   for(const r of artifact.rows.filter(r=>r.table===table)){
    // Canonical PostgreSQL text preserves numeric precision. Legacy notification defaults apply on both sides.
    const json=typeof r.record==='string'?r.record:JSON.stringify(r.record);
    const payload=table==='private.notifications'?"jsonb_build_object('title','Pesan petugas','priority','info') || $1::jsonb":"$1::jsonb";
    expected.push((await db.query(`select (${payload})::text value`,[json])).rows[0].value);
   }
   const actual=(await db.query(`select to_jsonb(r)::text value from ${table} r`)).rows.map(r=>r.value);
   assert.deepEqual(actual.sort(),expected.sort(),'Restored rows differ: '+table);
  }
  return {format:'edutara-isolated-recovery-v1',scope:'original-artifact-isolated-data-restore',backup_id:manifest.job_id,backup_checksum:expectedChecksum,completed_at:new Date().toISOString(),duration_seconds:Math.max(1,Math.ceil((Date.now()-started)/1000)),outcome:'passed',...restored,objects_verified:artifact.objects.length,media_uploaded:false,auth_reactivation_required:true,production_restored:false,access_uat:'pending'};
 }finally{await db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [root,manifestPath,checksum,output]=process.argv.slice(2);if(!root||!manifestPath||!checksum||!output)throw Error('Usage: node scripts/operations/restore-artifact.mjs ROOT MANIFEST EXPECTED_SHA256 REPORT');
 const report=await restoreArtifact(root,readFileSync(manifestPath),checksum);writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('PASS isolated original artifact restore; complete media upload/Auth/access UAT separately.');
}
