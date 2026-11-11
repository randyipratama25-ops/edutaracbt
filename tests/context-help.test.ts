import { pageGuides } from '../lib/help/start-here';
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { helpFor, helpPageTitle, helpTopics, type HelpAudience } from '../lib/help/catalog';
function pages(dir='app'):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?pages(join(dir,f.name)):f.name==='page.tsx'?['/'+dir.replace(/^app\/?/,'')]:[]);}
describe('contextual help coverage and isolation',()=>{
 it('covers every production page with a specific eligible article',()=>{
  for(const page of pages())expect(helpTopics.some(t=>t.pages.includes(page)),page).toBe(true);
  expect(new Set(helpTopics.map(t=>t.id)).size).toBe(helpTopics.length);
 });
 it('provides a first step and next step for every production page',()=>{
  expect(Object.keys(pageGuides).sort()).toEqual(pages().sort());
  for(const guide of Object.values(pageGuides)){
   expect(guide.first.trim()).not.toBe('');
   expect(guide.next.trim()).not.toBe('');
  }
 });
 it('filters role-specific articles even when searching all pages',()=>{
  for(const role of ['teacher','supervisor','student','committee','public'] as HelpAudience[]){
   const topics=helpFor(role,'/', '',true);
   for(const id of ['advanced','acceptance','settings','audit','jobs','rooms','committee-admin'])expect(topics.some(t=>t.id===id)).toBe(false);
  }
  expect(helpFor('admin','/dashboard/advanced').map(t=>t.id)).toContain('advanced');
  expect(helpFor('student','student-exam').map(t=>t.id)).toEqual(['exam','recovery','finish','support']);
  expect(helpFor('student','student-result').map(t=>t.id)).toEqual(['finish','support']);
 });
 it('keeps exact route context and supplies a safe fallback',()=>{
  expect(helpPageTitle('teacher','/dashboard/bank/')).toBe('Menyusun dan meninjau bank soal');
  expect(helpPageTitle('teacher','/dashboard/advanced')).toBe('Panduan umum');
  expect(helpFor('admin','/dashboard/advanced-wrong').map(t=>t.id)).toEqual(['support']);
 });
 it('searches words across instructions and handles empty results',()=>{
  expect(helpFor('public','/login','  LUPA   PASSWORD ').map(t=>t.id)).toContain('login');
  expect(helpFor('admin','/dashboard','deepseek',true).map(t=>t.id)).toEqual(['advanced']);
  expect(helpFor('teacher','/dashboard','deepseek',true)).toEqual([]);
  expect(helpFor('student','student-exam','zz-no-match')).toEqual([]);
 });
});
