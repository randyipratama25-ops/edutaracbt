import { describe, it, expect, vi } from 'vitest';
import { InvitationError, assertInvitationAccess, invitationState, resendInvitation } from '../supabase/functions/identity-gateway/invitations';
const actor = { id:'admin', organization_id:'school-a', role:'admin', active:true };
const target = { id:'user', organization_id:'school-a', active:true, archived_at:null };
const account = { id:'user', email:'invited@example.invalid', invited_at:'2026-10-29T00:00:00Z' };
const setup = () => ({ actor, target, account, site:'https://edutara-cbt-ashen.vercel.app', now:Date.parse('2026-10-30T00:00:00Z'), budget:vi.fn(async()=>true), send:vi.fn(async()=>({error:null,userId:'user'})), audit:vi.fn(async()=>{}) });
describe('Admin invitation resend',()=>{
 it('sends to the stored address with the canonical reset redirect and records an audit',async()=>{
  const x=setup();const r=await resendInvitation(x);
  expect(x.send).toHaveBeenCalledWith(account.email,'https://edutara-cbt-ashen.vercel.app/auth/reset');
  expect(x.audit).toHaveBeenCalledOnce();expect(r.sent).toBe(true);
 });
 it('rejects teachers, students, supervisors and inactive admins before any send',async()=>{
  for(const role of ['teacher','student','supervisor']){const x=setup();x.actor={...actor,role};await expect(resendInvitation(x)).rejects.toMatchObject({status:403});expect(x.send).not.toHaveBeenCalled();}
  expect(()=>assertInvitationAccess({...actor,active:false},target)).toThrow(InvitationError);
 });
 it('rejects cross-organization and missing targets',async()=>{
  const x=setup();x.target={...target,organization_id:'school-b'};
  await expect(resendInvitation(x)).rejects.toMatchObject({status:404});expect(x.send).not.toHaveBeenCalled();
  expect(()=>assertInvitationAccess(actor,null)).toThrow();
 });
 it('blocks inactive, archived, missing-email, mismatched and never-invited accounts',()=>{
  expect(invitationState({...target,active:false},account).eligible).toBe(false);
  expect(invitationState({...target,archived_at:'2026-10-29'},account).eligible).toBe(false);
  for(const user of [{...account,email:undefined},{...account,id:'other'},{...account,invited_at:undefined}])expect(invitationState(target,user).eligible).toBe(false);
 });
 it('directs confirmed users to password recovery without sending another invite',async()=>{
  const x=setup();await expect(resendInvitation({...x,account:{...account,email_confirmed_at:'2026-10-29T00:00:00Z'}})).rejects.toMatchObject({status:409});expect(x.send).not.toHaveBeenCalled();
 });
 it('enforces cooldown and the shared server-side sending budget',async()=>{
  const x=setup();await expect(resendInvitation({...x,now:Date.parse(account.invited_at)+59999})).rejects.toMatchObject({status:429});expect(x.send).not.toHaveBeenCalled();
  x.budget.mockResolvedValue(false);await expect(resendInvitation(x)).rejects.toMatchObject({status:429});expect(x.send).not.toHaveBeenCalled();
 });
 it('does not expose SMTP credentials or provider error detail',async()=>{
  const x=setup();const send=vi.fn(async()=>({error:{status:500,message:'sensitive-smtp-detail'}}));
  await expect(resendInvitation({...x,send})).rejects.toMatchObject({status:502,message:'Undangan gagal dikirim. Periksa konfigurasi SMTP Supabase Auth atau coba lagi nanti.'});expect(x.audit).not.toHaveBeenCalled();
 });
 it('handles provider rate limits and confirmation races',async()=>{
  await expect(resendInvitation({...setup(),send:async()=>({error:{status:429}})})).rejects.toMatchObject({status:429});
  await expect(resendInvitation({...setup(),send:async()=>({error:{code:'email_exists'}})})).rejects.toMatchObject({status:409});
 });
 it('does not automatically retry when transport outcome is uncertain',async()=>{
  const send=vi.fn(async()=>{throw Error('network lost');});
  await expect(resendInvitation({...setup(),send})).rejects.toMatchObject({status:503});expect(send).toHaveBeenCalledOnce();
 });
 it('does not treat a different returned identity as a successful resend',async()=>{
  await expect(resendInvitation({...setup(),send:async()=>({error:null,userId:'other'})})).rejects.toMatchObject({status:503});
 });
 it('does not ask for a duplicate email when delivery succeeded but audit failed',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try { const r=await resendInvitation({...setup(),audit:async()=>{throw Error('audit unavailable');}});expect(r.sent).toBe(true);expect(log).toHaveBeenCalledWith(JSON.stringify({event:'invitation_resend_audit_failed'})); }
  finally{log.mockRestore();}
 });
});
