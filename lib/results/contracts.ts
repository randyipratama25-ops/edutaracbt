import {z} from 'zod';
import {questionSchema} from '../authoring/schema';
import {reportKinds,reportSettingsSchema} from '../reports/schema';
export const resultRowSchema=z.object({id:z.uuid(),exam_id:z.uuid(),student_id:z.uuid(),student:z.string(),username:z.string(),title:z.string(),subject:z.string(),class_name:z.string().nullable(),status:z.string(),pending:z.number().int().nonnegative(),score:z.number().nullable(),passed:z.boolean().nullable(),revision:z.number().int().nonnegative(),started_at:z.string(),finalized_at:z.string(),published:z.boolean()});
export const resultListSchema=z.object({rows:z.array(resultRowSchema),total:z.number().int().nonnegative(),page:z.number().int().positive().optional(),can_publish:z.boolean()});
export const resultDetailSchema=z.object({
 attempt:z.object({id:z.uuid(),exam_id:z.uuid(),student_id:z.uuid(),student:z.string(),title:z.string(),status:z.string(),revision:z.number().int().nonnegative(),score:z.number().nullable(),passed:z.boolean().nullable(),pending:z.number().int().nonnegative(),class_ids:z.array(z.uuid()),class_name:z.string().nullable().optional(),started_at:z.string(),finalized_at:z.string()}),
 questions:z.array(z.object({id:z.uuid(),version:z.number().int().positive(),position:z.number().int().positive(),payload:questionSchema,answer:z.unknown(),earned:z.number().nullable(),comment:z.string().nullable(),source:z.string().nullable(),criteria:z.record(z.string(),z.number()).optional(),revision_reason:z.string().nullable().optional()})),
 ledger:z.array(z.object({revision:z.number(),engine_version:z.string(),actor_id:z.string().nullable(),reason:z.string(),score:z.number().nullable(),earned:z.number(),max_points:z.number(),pending:z.number(),items:z.unknown(),created_at:z.string()})),
 history:z.array(z.object({id:z.uuid(),question_id:z.uuid(),action:z.string(),points:z.number().nullable(),comment:z.string().nullable(),source:z.string().nullable(),created_at:z.string(),grade_revision:z.number()})),
 suggestions:z.array(z.object({id:z.uuid(),question_id:z.uuid(),basis_revision:z.number(),provider:z.string(),model:z.string(),prompt_version:z.string(),status:z.enum(['pending','failed','accepted','edited','rejected']),points:z.number().nullable(),reason:z.string()})),
});
export const resultMastersSchema=z.object({classes:z.array(z.object({id:z.uuid(),name:z.string()})),subjects:z.array(z.object({id:z.uuid(),name:z.string()}))});
export const resultSettingsSchema=reportSettingsSchema.omit({action:true}).extend({can_manage:z.boolean()});
export const resultProvidersSchema=z.array(z.object({provider:z.string(),model:z.string()}));
export const reportJobSchema=z.object({id:z.uuid(),kind:z.enum(reportKinds),format:z.enum(['pdf','xlsx']),status:z.enum(['queued','running','ready','failed']),progress:z.number().min(0).max(100),failures:z.number().int().nonnegative(),error:z.string().nullable()});
export const reportJobsSchema=z.array(reportJobSchema);
const wrong=z.object({student:z.string(),attempt_id:z.uuid()});
export const resultAnalysisSchema=z.object({eligible:z.number(),excluded:z.number(),items:z.array(z.object({id:z.string(),exam_id:z.uuid(),question_id:z.uuid(),version:z.number(),type:z.enum(['PG','PG_KOMPLEKS','BS','JODOH','Esai']),stem:z.string(),n:z.number(),group_size:z.number(),p:z.number(),d:z.number(),difficulty:z.string(),discrimination:z.string(),small_sample:z.boolean(),wrong:z.array(wrong.extend({earned:z.number().nullable(),max:z.number()})),options:z.array(z.object({id:z.string(),text:z.string(),choices:z.record(z.string(),z.number()),correct:z.number(),wrong:z.array(wrong),is_key:z.boolean(),selection_rate:z.number(),nonfunctional:z.boolean()})),essay:z.array(z.object({student:z.string(),earned:z.number().nullable(),max:z.number()}))}))});
const revision=z.object({attempt_id:z.uuid(),revision:z.number().int().nonnegative(),score:z.number().nullable(),pending:z.number().int().nonnegative(),passed:z.boolean().nullable()});
export function resultReceipt(url:string,input?:object):z.ZodType<unknown>{
 const action=input&&'action' in input?input.action:'';
 if(url==='/api/results')return action==='publish'?z.object({saved:z.literal(true)}):action==='reject_ai'?z.object({rejected:z.literal(true)}):action==='grade_batch'||action==='recalculate'?z.array(revision).min(1):revision;
 if(url==='/api/reports/run')return z.object({queued:z.literal(true)});
 if(url==='/api/grading/ai')return z.object({items:z.array(z.object({id:z.uuid(),status:z.string()}))});
 return action==='settings'?z.object({saved:z.literal(true)}):z.object({id:z.uuid(),status:z.string()});
}
/** Bounded fan-out; stop scheduling new requests on failure or unmount. */
export async function loadResultBatch<T>(ids:string[],read:(id:string)=>Promise<T>,live:()=>boolean){
 if(!ids.length||ids.length>500)throw Error('Pilih 1–500 hasil.');
 const result:T[]=[];
 for(let i=0;i<ids.length;i+=4){if(!live())throw Error('Permintaan dibatalkan.');result.push(...await Promise.all(ids.slice(i,i+4).map(read)));}
 if(!live())throw Error('Permintaan dibatalkan.');return result;
}
export function gradeValue(value:string,max:number){
 if(!value.trim())throw Error('Nilai kosong tetap pending. Isi nilai yang akan disetujui.');
 const n=Number(value);if(!Number.isFinite(n)||n<0||n>max)throw Error(`Nilai harus antara 0 dan ${max}.`);return n;
}

export function revisionReason(value:string){if(value.trim().length<5||value.trim().length>1000)throw Error("Alasan revisi wajib 5–1000 karakter.");return value.trim();}
export function resultAnswer(value:unknown){return value===null||value===undefined?'Belum dijawab':typeof value==='object'?JSON.stringify(value,null,2):String(value);}
export function canSuggest(question:{payload:{type:string;rubricCriteria?:unknown[]};answer:unknown},status:string){
 if(status==='disqualified'||question.payload.type!=='Esai'||question.payload.rubricCriteria?.length)return false;
 const answer=question.answer;
 const text=answer&&typeof answer==='object'&&!Array.isArray(answer)&&'text' in answer?answer.text:undefined;
 return typeof text==='string'&&text.trim().length>0&&text.length<=30000;
}
