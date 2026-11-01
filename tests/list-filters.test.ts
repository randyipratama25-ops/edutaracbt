import {describe,it,expect} from 'vitest';
import {matchesSearch} from '../lib/lists/search';
describe('local list search',()=>{
 it('ignores letter case and surrounding whitespace',()=>{
  expect(matchesSearch('Siswa Ahmad','  AHMAD  ')).toBe(true);
  expect(matchesSearch('Kelas VII A','   ')).toBe(true);
 });
 it('uses literal substrings without treating input as regex or wildcard',()=>{
  expect(matchesSearch('Berkas [1].png','[1].')).toBe(true);
  expect(matchesSearch('Siswa Ahmad','%')).toBe(false);
  expect(matchesSearch('VII-A','VII-B')).toBe(false);
 });
});
