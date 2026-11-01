import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/auth/actor',()=>({actor:mocks.actor}));
import {GET,POST} from '../app/api/operational/route';
import {operationalChecks,drillSchema,type Health} from '../lib/operational/health';
const id='03000000-0000-4000-8000-000000000001';
const request=(input:unknown,origin='https://cbt.test')=>new Request('https://cbt.test/api/operational',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});
beforeEach(()=>{mocks.rpc.mockReset().mockResolvedValue({data:{saved:true},error:null});mocks.actor.mockReset().mockResolvedValue({role:'admin',context:'staff',client:{rpc:mocks.rpc}});});
describe('operational monitoring',()=>{
 it('restricts read and writes to Admin with same-origin writes',async()=>{
  for(const role of ['student','teacher','supervisor']){mocks.actor.mockResolvedValue({role,context:'staff',client:{rpc:mocks.rpc}});expect((await GET()).status).toBe(403);}
  expect(mocks.rpc).not.toHaveBeenCalled();expect((await POST(request({},'https://other.test'))).status).toBe(403);
 });
 it('validates evidence and hides internal database errors',async()=>{
  const input={action:'record',request_id:id,backup_id:id,backup_checksum:'a'.repeat(64),completed_at:new Date().toISOString(),duration_seconds:10,outcome:'passed',evidence:'Evidence report',notes:'Rows and bytes matched.',confirmation:'KONFIRMASI'};
  expect(drillSchema.safeParse({...input,duration_seconds:0}).success).toBe(false);expect((await POST(request(input))).status).toBe(200);
  mocks.rpc.mockResolvedValue({error:{message:'private internals'},data:null});const res=await GET();expect(res.status).toBe(422);expect(await res.text()).not.toContain('private internals');
 });
 it('expires heartbeat/backup/drill and never treats stale observation as current',()=>{
  const now=Date.now(),iso=(age:number)=>new Date(now-age).toISOString();
  const s={observed_at:iso(0),heartbeat_at:iso(0),last_passed_drill_at:iso(0),drills:[{outcome:'passed'}],automation_enabled:true,worker_approved:true,job_issues:0,stalled_jobs:0,backup:{completed_at:iso(0),checksum:'a'.repeat(64),parts:1,captured_after_coverage_fix:true}} as Health;
  expect(operationalChecks(s,now).every(c=>c.passed)).toBe(true);
  expect(operationalChecks({...s,heartbeat_at:iso(301000)},now)[1].passed).toBe(false);
  expect(operationalChecks({...s,backup:{...s.backup!,completed_at:iso(9*86400000)}},now)[2].passed).toBe(false);
  expect(operationalChecks({...s,last_passed_drill_at:iso(31*86400000)},now)[5].passed).toBe(false);
  expect(operationalChecks({...s,observed_at:iso(121000)},now)[0].passed).toBe(false);
  expect(operationalChecks({...s,drills:[{outcome:'failed'}] as Health['drills']},now)[5].passed).toBe(false);
 });
});
