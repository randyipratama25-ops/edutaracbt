import {z} from "zod";
export const scoresSchema=z.record(z.string().max(40),z.number().finite().min(0).max(10000));
export const assessmentCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("propose"),request_id:z.uuid(),attempt_id:z.uuid(),question_id:z.uuid(),expected_revision:z.number().int().min(0),points:z.number().min(0).max(10000),criteria:scoresSchema.default({}),comment:z.string().max(5000).default(""),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal("moderate"),request_id:z.uuid(),id:z.uuid(),decision:z.enum(["approved","rejected"]),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal("schedule"),request_id:z.uuid(),exam_id:z.uuid(),scheduled_at:z.iso.datetime({offset:true}),reason:z.string().trim().min(5).max(1000),confirmation:z.literal("JADWALKAN")}),
 z.object({action:z.literal("cancel"),request_id:z.uuid(),exam_id:z.uuid(),reason:z.string().trim().min(5).max(1000)})
]);
