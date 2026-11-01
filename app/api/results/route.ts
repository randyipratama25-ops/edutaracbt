import { z } from "zod";
import { staff, resultData } from "../../../lib/results/server";
import { failure, HttpError, json, requireOrigin } from "../../../lib/http";
import {readBounded} from "../../../lib/operations/media";
const mutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grade_batch"),
    request_id: z.uuid(),
    grades: z
      .array(
        z.object({
          attempt_id: z.uuid(),
          question_id: z.uuid(),
          expected_revision: z.number().int().min(0),
          points: z.number().finite().min(0).max(10000),
          comment: z.string().max(5000).default(""),
          criteria:z.record(z.string().max(40),z.number().finite().min(0).max(10000)).default({}),
          reason:z.string().trim().min(5).max(1000).optional(),
        }),
      )
      .min(1)
      .max(500),
  }),
  z.object({
    action: z.literal("recalculate"),
    request_id: z.uuid(),
    ids: z.array(z.uuid()).min(1).max(500),
    expected: z.record(z.uuid(), z.number().int().min(0)),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("publish"),
    request_id: z.uuid(),
    exam_id: z.uuid(),
    published: z.boolean(),
  }),
  z.object({
    action: z.enum(["accept_ai", "edit_ai", "reject_ai"]),
    request_id: z.uuid(),
    suggestion_id: z.uuid(),
    expected_revision: z.number().int().min(0),
    points: z.number().finite().min(0).max(10000).optional(),
    comment: z.string().max(5000).default(""),
  }),
]);
export async function GET(request: Request) {
  try {
    const a = await staff();
    const s = new URL(request.url).searchParams;
    const id = s.get("attempt");
    const input = id
      ? { action: "detail", attempt_id: z.uuid().parse(id) }
      : {
          action: "list",
          page: z.coerce.number().int().min(1).max(100000).parse(s.get("page") || 1),
          search: (s.get("search") || "").trim().slice(0, 150),
          state: z
            .enum(["all", "pending", "final", "disqualified"])
            .parse(s.get("state") || "all"),
          sort: z
            .enum(["name", "score_asc", "score_desc"])
            .parse(s.get("sort") || "name"),
          exam_id: s.get("exam") ? z.uuid().parse(s.get("exam")) : undefined,
          class_id: s.get("class") ? z.uuid().parse(s.get("class")) : undefined,
          subject_id: s.get("subject")
            ? z.uuid().parse(s.get("subject"))
            : undefined,
        };
    const r = await a.client.rpc("results_command", { input }).abortSignal(AbortSignal.timeout(15000));
    return json(resultData(r));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (Number(request.headers.get("content-length") || 0) > 2_000_000)
      throw new HttpError(413, "Batch terlalu besar.");
    const bytes=await readBounded(request.body,2_000_000).catch(()=>{throw new HttpError(413,"Batch terlalu besar.");});
    let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,"Format JSON tidak valid.");}
    const input = mutation.parse(raw);
    if(input.action==='publish'&&a.role!=='admin')throw new HttpError(403,'Hanya Admin menerbitkan nilai.');
    if(input.action==='edit_ai'&&input.points===undefined)throw new HttpError(422,'Nilai saran wajib diisi.');
    if(input.action==='grade_batch'&&new Set(input.grades.map(g=>g.attempt_id+':'+g.question_id)).size!==input.grades.length)throw new HttpError(422,'Setiap pasangan peserta/soal harus unik.');
    if(input.action==='recalculate'&&input.ids.some(id=>input.expected[id]===undefined))throw new HttpError(422,'Revisi seluruh hasil wajib disertakan.');
    const r = await a.client.rpc("results_command", { input });
    return json(resultData(r,true));
  } catch (e) {
    return failure(e);
  }
}
