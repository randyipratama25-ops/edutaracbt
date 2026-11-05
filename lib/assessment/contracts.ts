import { z } from "zod";
import { resultDetailSchema, resultReceipt } from "../results/contracts";

const row = resultDetailSchema.shape.attempt
  .pick({
    id: true,
    exam_id: true,
    title: true,
    revision: true,
    pending: true,
    score: true,
  })
  .extend({ code: z.string() });

export const assessmentList = z.object({
  rows: z.array(row),
  total: z.number().int().nonnegative(),
  admin: z.boolean(),
});
export const assessmentDetail = z.object({
  attempt: row,
  questions: resultDetailSchema.shape.questions,
});
export const assessmentModerations = z.array(
  z.object({
    id: z.uuid(),
    attempt_id: z.uuid(),
    basis_revision: z.number(),
    current_revision: z.number(),
    points: z.number(),
    reason: z.string(),
    state: z.string(),
    can_decide: z.boolean(),
    decision_reason: z.string().nullable(),
  }),
);
export const assessmentPublications = z.array(
  z.object({
    exam_id: z.uuid(),
    scheduled_at: z.iso.datetime({ offset: true }),
    state: z.string(),
    error: z.string().nullable(),
  }),
);
export const assessmentExams = z.object({
  exams: z.array(z.object({ id: z.uuid(), title: z.string() })),
});

export function assessmentReceipt(url: string, input: { action: string }) {
  if (url === "/api/results") return resultReceipt(url, input);
  switch (input.action) {
    case "propose":
      return z.object({ id: z.uuid(), state: z.literal("pending") });
    case "schedule":
      return z.object({ scheduled: z.literal(true) });
    case "cancel":
      return z.object({ cancelled: z.boolean() });
    default:
      return z.object({ saved: z.literal(true) });
  }
}
