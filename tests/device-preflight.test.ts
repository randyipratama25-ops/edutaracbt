import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canStartWithReport, PREFLIGHT_TTL, probeStorage, type DeviceReport } from '../lib/attempts/preflight';
const mocks = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('../lib/auth/actor', () => ({ actor: mocks.actor }));
import { GET } from '../app/api/attempts/preflight/route';
beforeEach(() => mocks.actor.mockReset());
describe('device preflight boundaries', () => {
  it('requires an active student actor in student context', async () => {
    for (const actor of [null, {role:'admin',context:'staff'}, {role:'teacher',context:'staff'}, {role:'supervisor',context:'supervisor'}, {role:'student',context:'staff'}]) {
      mocks.actor.mockResolvedValue(actor);
      expect((await GET()).status).toBe(403);
    }
    mocks.actor.mockResolvedValue({role:'student',context:'student'});
    const r=await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect((await r.json()).data).toEqual({ready:true});
  });
  it('requires a fresh report and acknowledgement, permits warnings but blocks failures', () => {
    const report: DeviceReport={checkedAt:1000,expiresAt:1000+PREFLIGHT_TTL,checks:[{id:'storage',label:'Storage',level:'warning',detail:'Blocked'}]};
    expect(canStartWithReport(null,true,1001)).toBe(false);
    expect(canStartWithReport(report,false,1001)).toBe(false);
    expect(canStartWithReport(report,true,1001)).toBe(true);
    expect(canStartWithReport(report,true,report.expiresAt)).toBe(false);
    report.checks.push({id:'connection',label:'Connection',level:'blocked',detail:'No session'});
    expect(canStartWithReport(report,true,1001)).toBe(false);
  });
  it('cleans only its probe and leaves draft data intact', () => {
    const values=new Map([['edutara:draft:student','important']]);
    const storage={setItem:(k:string,v:string)=>values.set(k,v),getItem:(k:string)=>values.get(k)??null,removeItem:(k:string)=>values.delete(k)};
    expect(probeStorage(storage,'unique-probe')).toBe(true);
    expect([...values]).toEqual([['edutara:draft:student','important']]);
    expect(probeStorage({...storage,setItem:()=>{throw Error('QuotaExceeded');}},'probe')).toBe(false);
    expect(probeStorage({...storage,removeItem:()=>{throw Error('Denied');}},'probe')).toBe(false);
  });
});
