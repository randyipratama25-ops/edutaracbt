import { z } from 'zod';
import { staff } from '../../../../lib/results/server';
import { body,failure,HttpError,json,requireOrigin } from '../../../../lib/http';
import { providerId } from '../../../../lib/ai/schema';
export const maxDuration=120;
export async function GET(){try{const a=await staff();const r=await a.client.rpc('ai_command',{input:{action:'list'}});if(r.error)throw new HttpError(503,'Penyedia AI belum tersedia');return json(r.data);}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireOrigin(request);const a=await staff();const input=z.object({request_id:z.uuid(),provider:providerId,items:z.array(z.object({attempt_id:z.uuid(),question_id:z.uuid()})).min(1).max(5)}).parse(await body(request));const r=await a.client.functions.invoke('ai-grading',{body:input});if(r.error)throw new HttpError(422,'Saran belum tersedia. Periksa konfigurasi dan muat ulang riwayat sebelum mencoba kembali.');return json(r.data);}catch(e){return failure(e);}}
