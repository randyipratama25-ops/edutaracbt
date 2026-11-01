import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/auth/actor',()=>({actor:mocks.actor}));
import {GET,POST} from '../app/api/operations/route';
import {operation} from '../lib/operations/schema';
import {focusNotificationExam} from '../lib/notifications/types';
const id='03000000-0000-4000-8000-000000000001';
const as=(role='student',context='student')=>mocks.actor.mockResolvedValue({role,context,client:{rpc:mocks.rpc}});
const request=(input:unknown,origin='https://cbt.test')=>new Request('https://cbt.test/api/operations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});
beforeEach(()=>{vi.unstubAllGlobals();mocks.rpc.mockReset().mockResolvedValue({data:{saved:true},error:null});mocks.actor.mockReset();as();});
describe('actionable notification boundaries',()=>{
 it('permits only recipient reads and validates pagination/filter',async()=>{
  expect((await GET(new Request('https://cbt.test/api/operations?action=inbox_page&page=2&filter=unread'))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].input).toMatchObject({action:'inbox_page',page:2,filter:'unread'});
  expect((await GET(new Request('https://cbt.test/api/operations?action=inbox_page&page=0'))).status).toBe(422);
  mocks.actor.mockResolvedValue(null);expect((await GET(new Request('https://cbt.test/api/operations?action=inbox_page'))).status).toBe(403);
 });
 it('blocks broadcasts from students and cross-origin receipt writes',async()=>{
  expect((await POST(request({action:'broadcast',request_id:id,scope:'exam',exam_id:id,title:'Tinjau jadwal',message:'Periksa jadwal'}))).status).toBe(403);
  expect((await POST(request({action:'read_batch',ids:[id]},'https://other.test'))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await POST(request({action:'read_batch',ids:[id]}))).status).toBe(200);
 });
 it('validates batch limits and preserves older broadcast defaults',()=>{
  expect(operation.safeParse({action:'read_batch',ids:Array(21).fill(id)}).success).toBe(false);
  expect(operation.parse({action:'broadcast',request_id:id,scope:'all',message:'Pesan lama'})).toMatchObject({title:'Pesan petugas',priority:'info',link_exam:false});
 });
 it('focuses only a visible exam card and never accepts a URL action',()=>{
  const focus=vi.fn(),scrollIntoView=vi.fn(),getElementById=vi.fn().mockReturnValue({getClientRects:()=>[{}],focus,scrollIntoView});vi.stubGlobal('document',{getElementById});
  expect(focusNotificationExam('javascript:alert(1)')).toBe(false);expect(getElementById).not.toHaveBeenCalled();
  expect(focusNotificationExam(id)).toBe(true);expect(getElementById).toHaveBeenCalledWith('exam-'+id);expect(focus).toHaveBeenCalledOnce();
  getElementById.mockReturnValue(null);expect(focusNotificationExam(id)).toBe(false);
 });
});
