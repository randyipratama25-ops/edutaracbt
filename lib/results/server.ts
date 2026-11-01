import { actor } from "../auth/actor";
import { HttpError } from "../http";
export async function staff() {
  const a = await actor();
  if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
    throw new HttpError(403, "Akses Admin/Guru diperlukan.");
  return a;
}

/** Preserve business exceptions; never expose SQL details or accept a missing receipt. */
export function resultData(r:{data:unknown;error:{code?:string;message:string}|null},mutation=false){
 if(r.error){
  const e=r.error;
  if(!e.code||['57014','08000','08006'].includes(e.code))throw new HttpError(503,mutation?'Hasil perubahan belum dapat dipastikan. Muat ulang dan periksa hasil sebelum mencoba lagi.':'Data belum dapat dimuat. Silakan coba lagi.');
  throw new HttpError(e.code==='P0001'&&e.message.includes('CONFLICT')?409:e.code==='P0001'&&e.message.startsWith('AUTH')?403:422,e.code==='P0001'?e.message:'Permintaan ditolak. Periksa isian dan muat ulang data.');
 }
 if(r.data===null||r.data===undefined)throw new HttpError(503,mutation?'Hasil perubahan belum dapat dipastikan. Muat ulang dan periksa hasil.':'Data belum dapat dimuat. Silakan coba lagi.');
 return r.data;
}
