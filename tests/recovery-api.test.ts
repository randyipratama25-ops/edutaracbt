import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/auth/actor',()=>({actor:mocks.actor}));
import { POST } from '../app/api/attempts/route';
const aid='03000000-0000-4000-8000-000000000001',client='03000000-0000-4000-8000-000000000002';
const save={action:'save',attempt_id:aid,client_id:client,epoch:1,request_id:'03000000-0000-4000-8000-000000000003',answers:[{question_id:'03000000-0000-4000-8000-000000000004',expected_revision:0,value:['A']}]};
const request=(input:unknown)=>new Request('https://cbt.test/api/attempts',{method:'POST',headers:{origin:'https://cbt.test','Content-Type':'application/json'},body:JSON.stringify(input)});
beforeEach(()=>{mocks.actor.mockReset();mocks.rpc.mockReset();mocks.actor.mockResolvedValue({id:aid,role:'student',context:'student',client:{rpc:mocks.rpc}});});
describe('supplemental cloud recovery API',()=>{
 it('stages before canonical save',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{staged:true},error:null}).mockResolvedValueOnce({data:{acknowledgements:[]},error:null});
  expect((await POST(request(save))).status).toBe(200);
  expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(['attempt_recovery','attempt_command']);
  expect(mocks.rpc.mock.calls[0][1].input.action).toBe('stage');expect(mocks.rpc.mock.calls[1][1].input).toEqual(save);
 });
 it('does not block canonical save if backup returns an error',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'unavailable'}}).mockResolvedValueOnce({data:{acknowledgements:[]},error:null});expect((await POST(request(save))).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledTimes(2);}finally{log.mockRestore();}
 });
 it('does not block canonical save if backup transport throws',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{mocks.rpc.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({data:{acknowledgements:[]},error:null});expect((await POST(request(save))).status).toBe(200);}finally{log.mockRestore();}
 });
 it('attaches choices only after successful resume',async()=>{
  const recovery={drafts:[{question_id:'question',value:['A']}],canvases:[]};
  mocks.rpc.mockResolvedValueOnce({data:{id:aid,status:'in_progress',epoch:2,finalized_at:null},error:null}).mockResolvedValueOnce({data:recovery,error:null});
  expect((await (await POST(request({action:'resume',attempt_id:aid,client_id:client}))).json()).data.recovery).toEqual(recovery);
  expect(mocks.rpc.mock.calls[1][1].input).toEqual({action:'list',attempt_id:aid,client_id:client,epoch:2});
 });
 it('keeps canonical resume available when recovery listing throws',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {
   mocks.rpc.mockResolvedValueOnce({data:{id:aid,status:'in_progress',epoch:2,finalized_at:null},error:null}).mockRejectedValueOnce(new TypeError('offline'));
   const response=await POST(request({action:'resume',attempt_id:aid,client_id:client}));
   expect(response.status).toBe(200);expect((await response.json()).data.recovery).toBeNull();
  } finally {log.mockRestore();}
 });
 it('does not retrieve drafts after conflict or for staff',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'DEVICE_CONFLICT: old writer'}});
  expect((await POST(request({action:'resume',attempt_id:aid,client_id:client}))).status).toBe(409);expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockClear();mocks.actor.mockResolvedValue({role:'teacher',context:'staff'});expect((await POST(request(save))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
