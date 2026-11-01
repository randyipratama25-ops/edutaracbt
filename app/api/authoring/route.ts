import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import { failure, HttpError, json, requireOrigin } from "../../../lib/http";
import { examSchema, questionSchema } from "../../../lib/authoring/schema";
import { readBounded } from "../../../lib/operations/media";
import { readAuthoring } from "../../../lib/authoring/read";
const columns =
  "id,subject_id,title,starts_at,ends_at,duration_minutes,status,passing_grade,bypass_period,shuffle_questions,shuffle_options";
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    const id = new URL(request.url).searchParams.get("exam");
    if (id) z.uuid().parse(id);
    const signal=AbortSignal.timeout(15000);
    const queries = await Promise.all([
      readAuthoring(a,"exams",columns,["starts_at","id"],signal,[{column:"organization_id",value:a.organization_id}]),
      readAuthoring(a,"exam_classes","exam_id,class_id",["exam_id","class_id"],signal),
      readAuthoring(a,"exam_type_configs","exam_id,type,enabled,max_questions,option_count,default_points",["exam_id","type"],signal),
      readAuthoring(a,"authoring_periods","enabled,starts_at,ends_at",["organization_id"],signal,[{column:"organization_id",value:a.organization_id}]),
      readAuthoring(a,"classes","id,name,active",["id"],signal,[{column:"organization_id",value:a.organization_id}]),
      readAuthoring(a,"subjects","id,name,active",["id"],signal,[{column:"organization_id",value:a.organization_id}]),
    ]);
    let questions: Record<string,unknown>[]=[];
    const history: Record<string,unknown>[]=[];
    if(id){
      if(!queries[0].some(e=>e.id===id)) throw new HttpError(404,"Ujian tidak tersedia atau tidak dapat diakses.");
      const rows=await readAuthoring(a,"questions","id,type,current_version",["id"],signal,[{column:"exam_id",value:id},{column:"archived_at",value:null}]);
      for(let i=0;i<rows.length;i+=100) history.push(...await readAuthoring(a,"question_versions","question_id,version,payload",["question_id","version"],signal,[{column:"question_id",value:"",values:rows.slice(i,i+100).map(q=>String(q.id))}]));
      const versions=new Map(history.map(v=>[String(v.question_id)+":"+v.version,v.payload]));
      questions=rows.map(q=>({...q,payload:versions.get(String(q.id)+":"+q.current_version)}));
      if(questions.some(q=>!q.payload)) throw new HttpError(503,"Versi soal belum dapat dimuat lengkap. Silakan muat ulang.");
    }
    return json({
      exams: queries[0],
      examClasses: queries[1],
      configs: queries[2],
      period: queries[3][0] || null,
      classes: queries[4],
      subjects: queries[5],
      questions,
      history,
      attachments: [],
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
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    if (Number(request.headers.get("content-length") || 0) > 5_000_000)
      throw new HttpError(413, "Maksimal 5 MB.");
    const bytes=await readBounded(request.body,5_000_000).catch(()=>{throw new HttpError(413,"Maksimal 5 MB.");});
    const text = new TextDecoder().decode(bytes);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Format JSON tidak valid.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Payload harus berupa objek.");
    if(a.role!=="admin"&&["exam","period","archive_exams","duplicate_exam"].includes(raw.action))throw new HttpError(403,"Hanya Admin mengatur jadwal dan periode.");
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
          }).superRefine((v,c)=>{if(v.enabled&&(!v.starts_at||!v.ends_at||Date.parse(v.ends_at)<=Date.parse(v.starts_at))) c.addIssue({code:"custom",message:"Periode aktif memerlukan waktu akhir setelah awal."});})
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
          }).superRefine((v,c)=>{if(v.question_id && (!v.expected_version||v.items.length!==1))c.addIssue({code:"custom",message:"Edit soal memerlukan versi saat ini dan tepat satu soal."});})
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
    if (error) {
      if(!error.code || ["57014","08006","08000"].includes(error.code)) throw new HttpError(503,"Hasil perubahan belum dapat dipastikan. Muat ulang data sebelum mencoba kembali.");
      throw new HttpError(422,error.code==="P0001" ? error.message : "Perubahan ditolak. Periksa isian dan muat ulang data.");
    }
    if(!data) throw new HttpError(503,"Hasil perubahan belum dapat dipastikan. Muat ulang data sebelum mencoba kembali.");
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
