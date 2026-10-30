import { z } from "zod";
import {questionSchema,types} from "../authoring/schema";
export const metaSchema=z.object({subject_id:z.uuid(),class_ids:z.array(z.uuid()).min(1).max(100),topic:z.string().trim().min(1).max(200),indicator:z.string().trim().min(1).max(500),difficulty:z.enum(["easy","medium","hard"]),cognitive:z.enum(["C1","C2","C3","C4","C5","C6"])});
export type BankMeta=z.infer<typeof metaSchema>;
export const ruleSchema=z.object({type:z.enum(types),count:z.number().int().min(1).max(100),points:z.number().positive().max(10000),topic:z.string().max(200).optional(),difficulty:z.enum(["easy","medium","hard"]).optional(),cognitive:z.enum(["C1","C2","C3","C4","C5","C6"]).optional()});
export const bankCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("save"),request_id:z.uuid(),id:z.uuid().optional(),expected_version:z.number().int().positive().optional(),meta:metaSchema,payload:questionSchema,reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal("import"),request_id:z.uuid(),meta:metaSchema,items:z.array(questionSchema).min(1).max(100),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal("review"),request_id:z.uuid(),id:z.uuid(),expected_version:z.number().int().positive(),decision:z.enum(["approved","revision","archived","draft"]),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.enum(["preview","assemble"]),request_id:z.uuid(),exam_ids:z.array(z.uuid()).min(1).max(3),rules:z.array(ruleSchema).min(1).max(20)}).refine(v=>v.rules.reduce((n,r)=>n+r.count,0)<=200,"Maksimal 200 soal per paket."),
]);
export type BankRow={id:string;metadata:BankMeta;state:string;version:number;owner_id:string;payload:import("../authoring/schema").Question;can_edit:boolean;can_review:boolean};
