import { z } from "zod";
import { reportSettingsSchema } from "../reports/schema";
export const cardStudentsSchema = z.array(
  z.object({
    student_id: z.uuid(),
    student: z.string(),
    username: z.string(),
    room: z.string().nullable(),
  }),
);
export const cardJobsSchema = z.array(
  z.object({
    id: z.uuid(),
    status: z.enum(["queued", "running", "ready", "failed"]),
    progress: z.number().int().min(0).max(100),
    error: z.string().nullable(),
    format: z.enum(["pdf", "zip"]),
  }),
);
export const cardReceiptSchema = z.object({
  id: z.uuid(),
  queued: z.boolean(),
  state: z.enum(["ready", "running"]).optional(),
});
const date = z.string().refine((v) => Number.isFinite(Date.parse(v)));
export const cardClaimSchema = z
  .object({
    lease: z.uuid(),
    requested_by: z.uuid(),
    format: z.enum(["pdf", "zip"]),
    template: z.enum(["compact", "large"]),
    snapshot: z.object({
      settings: reportSettingsSchema.omit({ action: true }),
      exam: z.object({
        id: z.uuid(),
        title: z.string(),
        starts_at: date,
        ends_at: date,
      }),
      students: z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            username: z.string(),
            room: z.string().nullable(),
          }),
        )
        .min(1)
        .max(500),
    }),
  })
  .refine((v) => v.format !== "zip" || v.snapshot.students.length <= 50);
export const cardLimit = (format: string) => (format === "zip" ? 50 : 500);
export function selectCards(current: string[], ids: string[], limit: number) {
  return [...new Set([...current, ...ids])].slice(0, limit);
}
