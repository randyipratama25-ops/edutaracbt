import {describe,it,expect} from 'vitest';
import {homeCallback} from '../lib/auth/home-callback';

describe('home account callback boundaries',()=>{
 it('leaves normal navigation and skip links alone',()=>{
  expect(homeCallback('','')).toEqual({kind:'none'});
  expect(homeCallback('?utm_source=school','#main-content')).toEqual({kind:'none'});
 });
 it('preserves existing fragment activation and confines its destination',()=>{
  const hash='#access_token=test-access-token&refresh_token=test-refresh-token&type=invite&redirect_to=https://outside.invalid';
  expect(homeCallback('',hash)).toEqual({kind:'redirect',href:'/auth/reset'+hash});
 });
 it('hands root PKCE and email hash callbacks to the existing handler with encoded parameters',()=>{
  const result=homeCallback('?code=one%2Btwo%26next%3Dhttps%3A%2F%2Foutside.invalid&next=https://outside.invalid','');
  expect(result.kind).toBe('redirect');if(result.kind==='redirect'){
   const url=new URL(result.href,'https://cbt.test');expect(url.origin).toBe('https://cbt.test');expect(url.pathname).toBe('/auth/confirm');expect([...url.searchParams.keys()]).toEqual(['code']);expect(url.searchParams.get('code')).toBe('one+two&next=https://outside.invalid');
  }
  for(const type of ['invite','recovery'])expect(homeCallback('?token_hash=example-hash&type='+type,'')).toEqual({kind:'redirect',href:'/auth/confirm?token_hash=example-hash&type='+type});
 });
 it('rejects errors, partial/empty/oversized credentials and unsupported email types without echoing secrets',()=>{
  const cases=[['','#error=access_denied&error_description=DO_NOT_DISPLAY&access_token=test-access-token'],['','#access_token=test-access-token'],['','#access_token=&refresh_token='],['?code=',''],['?token_hash=hash&type=signup',''],['?access_token=DO_NOT_DISPLAY&refresh_token=DO_NOT_DISPLAY',''],['?code='+ 'a'.repeat(10001),''],['','#access_token='+ 'a'.repeat(10001)+'&refresh_token=test-refresh-token']];
  for(const [search,hash]of cases){expect(homeCallback(search,hash)).toEqual({kind:'invalid',cleanHref:'/'});}
 });
 it('removes callback parameters while retaining unrelated query values on error',()=>{
  expect(homeCallback('?utm_source=school&code=DO_NOT_DISPLAY&error=expired','#refresh_token=DO_NOT_DISPLAY')).toEqual({kind:'invalid',cleanHref:'/?utm_source=school'});
 });
});
