import { z } from "zod";
export const checkLabels = {
  login: "Login dan konteks siswa",
  questions: "Lima tipe soal dan rumus",
  media: "Lampiran gambar/audio",
  canvas: "Canvas dan unggahan",
  recovery: "Putus koneksi dan pemulihan",
  submit: "Submit dan hasil akhir",
};
export const evaluationSchema = z
  .object({
    action: z.literal("record"),
    request_id: z.uuid(),
    candidate_sha: z.string().regex(/^[a-f0-9]{40}$/),
    platform: z.enum(["Windows", "macOS", "iOS", "other"]),
    device_label: z.string().trim().min(2).max(100),
    seb_version: z.string().trim().min(1).max(50),
    checks: z
      .object({
        login: z.boolean(),
        questions: z.boolean(),
        media: z.boolean(),
        canvas: z.boolean(),
        recovery: z.boolean(),
        submit: z.boolean(),
      })
      .strict(),
    notes: z.string().trim().min(10).max(2000),
    evidence_ref: z
      .string()
      .min(5)
      .max(200)
      .regex(/^[a-zA-Z0-9_./ -]+$/),
  })
  .strict();
export type Evaluation = z.infer<typeof evaluationSchema> & {
  id: string;
  recorded_at: string;
  actor_id: string;
};
export type Overview = {
  ai_enabled: false;
  seb_enforced: false;
  rows: Evaluation[];
  total: number;
};
