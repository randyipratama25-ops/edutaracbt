import type { actor } from '../auth/actor';
import { HttpError } from '../http';
/** All read pages retain RLS and a stable ordering; no silent 1,000-row cap. */
export async function readAuthoring(a:NonNullable<Awaited<ReturnType<typeof actor>>>,table:string,columns:string,order:string[],signal:AbortSignal,filters:{column:string;value:string|null;values?:string[]}[]=[]){
 const rows:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=500){
  let q=a.client.from(table).select(columns);
  for(const f of filters) q=f.values?q.in(f.column,f.values):f.value===null?q.is(f.column,null):q.eq(f.column,f.value);
  for(const column of order) q=q.order(column);
  const result=await q.range(offset,offset+499).abortSignal(signal).overrideTypes<Record<string,unknown>[],{merge:false}>();
  if(result.error||!result.data) throw new HttpError(503,'Data penyusunan ujian belum dapat dimuat. Silakan coba lagi.');
  rows.push(...result.data);
  if(result.data.length<500) return rows;
 }
}
