import { z } from "zod";
import type { Question } from "../authoring/schema";
import type { AnswerValue } from "./recovery";
const id = z.string().min(1).max(128),
  instant = z.iso.datetime({ offset: true });
const value = z.union([z.array(z.string()), z.record(z.string(), z.string())]);
export const studentQuestionSchema = z
  .object({
    type: z.enum(["PG", "PG_KOMPLEKS", "BS", "JODOH", "Esai"]),
    stem: z.string().min(1),
    options: z.array(z.object({ id, text: z.string() })),
    points: z.number().positive().default(1),
    required: z.boolean().default(true),
    minChars: z.number().int().nonnegative().default(0),
    direction: z.enum(["ltr", "rtl"]).default("ltr"),
    attachments: z.array(id).default([]),
    canvas: z
      .object({
        enabled: z.boolean(),
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
      })
      .default({ enabled: false, width: 1000, height: 600 }),
    choices: z.array(z.string()).optional(),
  })
  .refine(
    (q) => new Set(q.options.map((o) => o.id)).size === q.options.length,
    "Pilihan soal berulang.",
  );
const attemptStatus = z.enum([
  "in_progress",
  "submitted",
  "time_expired",
  "disqualified",
  "graded",
  "reset",
]);
const attemptBase = z.object({
  id,
  exam_id: id,
  title: z.string(),
  status: attemptStatus,
  deadline_at: instant,
  server_now: instant,
  epoch: z.number().int().positive(),
  finalized_at: instant.nullable(),
  questions: z.array(
    z.object({
      id,
      version: z.number().int().positive(),
      position: z.number().int().positive(),
      payload: studentQuestionSchema,
    }),
  ),
  answers: z.array(
    z.object({
      question_id: id,
      revision: z.number().int().nonnegative(),
      value,
      saved_at: instant.optional(),
      checksum: z.string().optional(),
    }),
  ),
  grading_pending: z.number().int().nonnegative(),
  score: z.number().min(0).max(100).nullable(),
  result_visible: z.boolean(),
  review_reason: z.string().nullable(),
  policy: z
    .object({
      integrity_mode: z.string(),
      unlock_time: z.string(),
      tolerance_ms: z.number().nonnegative(),
      incident_cooldown_ms: z.number().nonnegative(),
    })
    .optional(),
  recovery: z
    .object({
      drafts: z.array(
        z.object({
          question_id: id,
          value,
          revision: z.number().int().nonnegative(),
          updated_at: instant,
          client_id: id,
          epoch: z.number().int().positive(),
        }),
      ),
      canvases: z.array(z.object({ id, question_id: id, created_at: instant })),
    })
    .nullable()
    .optional()
    .catch(null),
});
export const attemptSchema = attemptBase.refine(
  (a) =>
    new Set(a.questions.map((q) => q.id)).size === a.questions.length &&
    new Set(a.answers.map((r) => r.question_id)).size === a.answers.length,
  "Soal atau jawaban berulang.",
);
export const examListSchema = z.object({
  exams: z
    .array(
      z.object({
        id,
        title: z.string(),
        starts_at: instant,
        ends_at: instant,
        duration_minutes: z.number().positive(),
        status: z.enum(["scheduled", "active", "closed"]),
        attempt: z
          .object({
            id,
            status: attemptStatus,
            finalized_at: instant.nullable(),
          })
          .nullable(),
      }),
    )
    .refine(
      (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
      "Ujian berulang.",
    ),
  server_now: instant.optional(),
});
export type Exam = z.infer<typeof examListSchema>["exams"][number];
// Preserve the public player prop contract used by fixtures and existing integrations.
export type Attempt = {
  id: string;
  exam_id: string;
  title: string;
  status: string;
  deadline_at: string;
  server_now: string;
  epoch: number;
  finalized_at: string | null;
  questions: {
    id: string;
    version: number;
    position: number;
    payload: Omit<Question, "key" | "rubric" | "explanation" | "keywords"> & {
      choices?: string[];
    };
  }[];
  answers: { question_id: string; revision: number; value: AnswerValue }[];
  grading_pending: number;
  score: number | null;
  result_visible: boolean;
  review_reason: string | null;
  recovery?: {
    drafts: {
      question_id: string;
      value: AnswerValue;
      revision: number;
      updated_at: string;
      client_id: string;
      epoch: number;
    }[];
    canvases: { id: string; question_id: string; created_at: string }[];
  } | null;
};
export function parseAttempt(data: unknown): Attempt {
  return attemptSchema.parse(data) as Attempt;
}
export function isAttempt(data: unknown): data is Attempt {
  return attemptSchema.safeParse(data).success;
}
export const attemptStatusLabels: Record<string, string> = {
  in_progress: "Sedang dikerjakan",
  submitted: "Sudah dikumpulkan",
  time_expired: "Waktu habis",
  disqualified: "Dikunci pengawas",
  graded: "Sudah dinilai",
  reset: "Sesi direset",
};
