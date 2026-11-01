import { z } from "zod";
import { configSchema, questionSchema } from "./schema";
export const authoringDataSchema = z.object({
  exams: z.array(z.object({id:z.uuid(),subject_id:z.uuid(),title:z.string(),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),duration_minutes:z.number(),status:z.enum(['draft','scheduled','active','closed','archived']),passing_grade:z.number(),bypass_period:z.boolean(),shuffle_questions:z.boolean(),shuffle_options:z.boolean()})),
  examClasses:z.array(z.object({exam_id:z.uuid(),class_id:z.uuid()})),
  configs:z.array(configSchema.extend({exam_id:z.uuid()})),
  classes:z.array(z.object({id:z.uuid(),name:z.string(),active:z.boolean().optional()})),
  subjects:z.array(z.object({id:z.uuid(),name:z.string(),active:z.boolean().optional()})),
  period:z.object({enabled:z.boolean(),starts_at:z.string().nullable(),ends_at:z.string().nullable()}).nullable(),
  questions:z.array(z.object({id:z.uuid(),type:z.enum(['PG','PG_KOMPLEKS','BS','JODOH','Esai']),current_version:z.number().int().positive(),payload:questionSchema})),
  history:z.array(z.object({question_id:z.uuid(),version:z.number().int().positive(),payload:questionSchema})),
  canManage:z.boolean(),serverNow:z.iso.datetime({offset:true}),
});
export const commandResultSchema = z.union([
 z.object({id:z.uuid()}),
 z.object({saved:z.boolean()}),
 z.object({saved:z.number().int().nonnegative(),skipped:z.number().int().nonnegative(),details:z.array(z.object({block:z.number().int(),saved:z.boolean(),error:z.string().optional(),id:z.uuid().optional(),version:z.number().optional()}))}),
]);
export function questionLock(exam:z.infer<typeof authoringDataSchema>['exams'][number],period:z.infer<typeof authoringDataSchema>['period'],admin:boolean,now:number){
 if(now>=Date.parse(exam.starts_at)||['active','closed','archived'].includes(exam.status)) return 'Soal terkunci karena ujian telah dimulai, ditutup, atau diarsipkan.';
 if(!admin&&!exam.bypass_period&&period?.enabled&&(!period.starts_at||!period.ends_at||now<Date.parse(period.starts_at)||now>Date.parse(period.ends_at))) return 'Saat ini di luar periode input soal Guru.';
 return '';
}
/** Reject a receipt for a different command rather than treating it as success. */
export function commandResultFor(action: unknown) {
 return commandResultSchema.superRefine((value,ctx)=>{
  const valid=action==='exam'||action==='duplicate_exam' ? 'id' in value : action==='questions'||action==='copy' ? 'saved' in value&&typeof value.saved==='number'&&'details' in value : 'saved' in value&&value.saved===true;
  if(!valid)ctx.addIssue({code:'custom',message:'Hasil perubahan belum dapat dipastikan.'});
 });
}
