import { z } from "zod";
const date = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "Waktu tidak valid.");
const count = z.number().int().nonnegative().safe();
export const preparationSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]),
    lifecycle: z.string().min(1),
    starts_at: date,
    ends_at: date,
    duration_minutes: count.min(1).max(1440),
    ready: z.boolean(),
    participants: count,
    unconfirmed: count,
    question_count: count,
    checks: z
      .array(
        z.object({
          code: z.string().min(1),
          label: z.string().min(1),
          ok: z.boolean(),
          blocking: z.boolean(),
          detail: z.string(),
          href: z
            .string()
            .regex(
              /^\/dashboard\/(?:exams|master-data|users|media|rooms)(?:[?#].*)?$/,
            ),
        }),
      )
      .min(1),
  })
  .refine(
    (e) => new Set(e.checks.map((c) => c.code)).size === e.checks.length,
    "Pemeriksaan duplikat.",
  )
  .refine(
    (e) => !e.ready || e.checks.every((c) => !c.blocking || c.ok),
    "Kesiapan belum konsisten.",
  );
export const preparationDataSchema = z
  .object({
    exams: z.array(preparationSchema),
    admin: z.boolean(),
    server_now: date,
  })
  .refine(
    (d) => new Set(d.exams.map((e) => e.id)).size === d.exams.length,
    "Ujian duplikat.",
  );
export const preparationMetaSchema = z.object({
  classes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      active: z.boolean().optional(),
    }),
  ),
  subjects: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      active: z.boolean().optional(),
    }),
  ),
  canManage: z.boolean(),
});
export const publishReceipt = (target: string) =>
  z.object({ published: z.literal(true), id: z.literal(target) });
export function preparationSelection(
  exams: { id: string; status: string }[],
  current: string,
  requested: string | null,
) {
  if (exams.some((e) => e.id === current)) return current;
  if (exams.some((e) => e.id === requested)) return requested!;
  return exams.find((e) => e.status !== "archived")?.id || exams[0]?.id || "";
}
