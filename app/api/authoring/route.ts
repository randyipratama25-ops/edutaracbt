import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import { failure, HttpError, json, requireOrigin } from "../../../lib/http";
import { examSchema, questionSchema } from "../../../lib/authoring/schema";
const columns =
  "id,subject_id,title,starts_at,ends_at,duration_minutes,status,passing_grade,bypass_period,shuffle_questions,shuffle_options";
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "staff")
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    const id = new URL(request.url).searchParams.get("exam");
    const queries = await Promise.all([
      a.client.from("exams").select(columns).order("starts_at"),
      a.client.from("exam_classes").select("*"),
      a.client.from("exam_type_configs").select("*"),
      a.client.from("authoring_periods").select("*"),
      a.client.from("classes").select("id,name").eq("active", true),
      a.client.from("subjects").select("id,name").eq("active", true),
    ]);
    for (const r of queries)
      if (r.error)
        throw new HttpError(422, "Data penyusunan ujian belum dapat dimuat.");
    let questions: unknown[] = [];
    let history: unknown[] = [];
    let attachments: unknown[] = [];
    if (id) {
      z.uuid().parse(id);
      const rows: {
        id: string;
        current_version: number;
        [key: string]: unknown;
      }[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await a.client
          .from("questions")
          .select("*")
          .eq("exam_id", id)
          .is("archived_at", null)
          .order("id")
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        rows.push(...(r.data || []));
        if ((r.data?.length || 0) < 500) break;
      }
      const versions: {
        question_id: string;
        version: number;
        payload: unknown;
        [key: string]: unknown;
      }[] = [];
      for (let i = 0; i < rows.length; i += 100) {
        const ids = rows.slice(i, i + 100).map((q) => q.id);
        for (let offset = 0; ; offset += 500) {
          const r = await a.client
            .from("question_versions")
            .select("*")
            .in("question_id", ids)
            .order("question_id")
            .order("version")
            .range(offset, offset + 499);
          if (r.error) throw r.error;
          versions.push(...(r.data || []));
          if ((r.data?.length || 0) < 500) break;
        }
      }
      history = versions;
      questions = rows.map((q) => ({
        ...q,
        payload: versions.find(
          (v) => v.question_id === q.id && v.version === q.current_version,
        )?.payload,
      }));
      attachments = [];
    }
    return json({
      exams: queries[0].data,
      examClasses: queries[1].data,
      configs: queries[2].data,
      period: queries[3].data?.[0] || null,
      classes: queries[4].data,
      subjects: queries[5].data,
      questions,
      history,
      attachments,
      canManage: a.role === "admin",
      serverNow: new Date().toISOString(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "staff")
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    if (Number(request.headers.get("content-length") || 0) > 5_000_000)
      throw new HttpError(413, "Maksimal 5 MB.");
    const text = await request.text();
    if (text.length > 5_000_000) throw new HttpError(413, "Maksimal 5 MB.");
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Format JSON tidak valid.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Payload harus berupa objek.");
    let input: unknown;
    switch (raw.action) {
      case "exam":
        input = { action: "exam", exam: examSchema.parse(raw.exam), ...(raw.request_id ? {request_id:z.uuid().parse(raw.request_id)} : {}) };
        break;
      case "period":
        input = z
          .object({
            action: z.literal("period"),
            enabled: z.boolean(),
            starts_at: z.iso.datetime({ offset: true }).nullable(),
            ends_at: z.iso.datetime({ offset: true }).nullable(),
          })
          .parse(raw);
        break;
      case "questions":
        input = z
          .object({
            action: z.literal("questions"),
            exam_id: z.uuid(),
            request_id: z.uuid(),
            question_id: z.uuid().optional(),
            expected_version: z.number().int().positive().optional(),
            items: z.array(questionSchema).min(1).max(500),
          })
          .parse(raw);
        break;
      case "copy":
        input = z
          .object({
            action: z.literal("copy"),
            exam_id: z.uuid(),
            source_exam_id: z.uuid(),
            request_id: z.uuid(),
            ids: z.array(z.uuid()).min(1).max(500),
          })
          .parse(raw);
        break;
      case "archive_exams":
        input = z
          .object({
            action: z.literal("archive_exams"),
            ids: z.array(z.uuid()).min(1).max(500),
          })
          .parse(raw);
        break;
      case "archive_questions":
        input = z
          .object({
            action: z.literal("archive_questions"),
            exam_id: z.uuid(),
            ids: z.array(z.uuid()).min(1).max(500),
          })
          .parse(raw);
        break;
      case "duplicate_exam":
        input = z
          .object({
            action: z.literal("duplicate_exam"),
            exam_id: z.uuid(),
            pin: z.string().regex(/^[0-9]{4,12}$/),
          })
          .parse(raw);
        break;
      default:
        throw new HttpError(422, "Aksi tidak dikenal.");
    }
    const { data, error } = await a.client.rpc("authoring_command", { input });
    if (error) throw new HttpError(422, error.message);
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
