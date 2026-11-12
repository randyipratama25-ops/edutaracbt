import { z } from "zod";
const id = z.uuid(),
  count = z.number().int().nonnegative(),
  date = z
    .string()
    .refine((v) => Number.isFinite(Date.parse(v)), "Waktu tidak valid.");
export const operationOptionsSchema = z.object({
  admin: z.boolean(),
  organization_id: z.string().min(1),
  exams: z.array(z.object({
    id,
    title: z.string(),
    pin_configured: z.boolean().optional(),
    attendance_confirmed: z.boolean().optional(),
  })),
  staff: z.array(z.object({ id, name: z.string(), role: z.string() })),
});
export const monitorRowSchema = z.object({
  student_id: id,
  student: z.string(),
  username: z.string(),
  attempt_id: id.nullable(),
  version: z.number().int().positive().nullable(),
  status: z.string().min(1),
  logged_in: z.boolean(),
  answers: count,
  events: count,
  countable_events: count,
  open_integrity: count.optional(),
  watermark_code: z.string().nullish(),
  last_seen_at: date.nullish(),
  last_saved_at: date.nullish(),
  session: z.string().nullish(),
  deadline_at: date.nullable(),
  room: z.string().nullable(),
  room_id: id.nullable(),
  can_act: z.boolean(),
  can_view_history: z.boolean().optional(),
  score: z.number().nullable(),
  pending: count.nullable(),
});
export const monitorRowsSchema = z
  .array(monitorRowSchema)
  .refine(
    (rows) => new Set(rows.map((r) => r.student_id)).size === rows.length,
    "Peserta duplikat.",
  );
export type MonitorRow = z.infer<typeof monitorRowSchema>;
export const roomsSchema = z.object({
  rooms: z.array(z.object({ id, name: z.string(), capacity: count, count })),
  sessions: z.array(
    z.object({ id, name: z.string(), starts_at: date, ends_at: date }),
  ),
  eligible: z.array(z.object({ id, name: z.string() })),
  roster: z.array(z.object({ room_id: id, student_id: id, name: z.string() })),
  assignments: z.array(
    z.object({
      id,
      room_id: id,
      session_id: id.nullable(),
      original_supervisor_id: id,
      effective_supervisor: id.nullable(),
      active: z.boolean(),
      substitutions: z.array(
        z.object({
          id,
          revoked_at: date.nullable(),
          effective_from: date,
          effective_until: date.nullable(),
        }),
      ),
    }),
  ),
});
export const sentNotificationsSchema = z.array(
  z.object({
    id,
    title: z.string().optional(),
    priority: z.string().optional(),
    message: z.string(),
    created_at: date,
    receipts: z
      .array(z.object({ student: z.string(), read_at: date.nullable() }))
      .nullable(),
  }),
);
export const monitorHistorySchema = z.object({
  events: z.array(
    z.object({
      kind: z.string(),
      countable: z.boolean(),
      metadata: z.unknown(),
      created_at: date,
    }),
  ),
  overrides: z.array(
    z
      .object({ id, action: z.string(), reason: z.string(), created_at: date })
      .passthrough(),
  ),
});
export const signalsSchema = z
  .array(
    z.object({
      attempt_id: id,
      last_seen_at: date.nullable(),
      connection: z.enum(["recent", "stale", "unknown"]),
      help_count: count,
    }),
  )
  .refine(
    (rows) => new Set(rows.map((r) => r.attempt_id)).size === rows.length,
    "Sinyal sesi duplikat.",
  );
export const helpListSchema = z
  .array(
    z.object({
      id,
      attempt_id: id,
      student: z.string(),
      message: z.string(),
      created_at: date,
      resolved_at: date.nullable(),
      resolution: z.string().nullable(),
      can_resolve: z.boolean(),
    }),
  )
  .refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
    "Permintaan bantuan duplikat.",
  );
export function operationReceipt(action: string): z.ZodType<unknown> {
  if (["reset", "unlock", "disqualify"].includes(action))
    return z
      .array(
        z
          .object({
            saved: z.literal(true).optional(),
            reset: z.literal(true).optional(),
            status: z.literal("time_expired").optional(),
          })
          .refine((r) => r.saved || r.reset || r.status === "time_expired"),
      )
      .min(1);
  if (action === "broadcast") return z.object({ id, recipients: count.min(1) });
  if (["room_save", "session_save", "assign"].includes(action))
    return z.object({ id });
  return z.object({ saved: z.literal(true) });
}
export function reviewTargets(rows: MonitorRow[], selected: string[]) {
  const set = new Set(selected);
  return rows.filter(
    (r) => set.has(r.student_id) && r.attempt_id !== null && r.version !== null,
  );
}
export function canReview(rows: MonitorRow[], action: string) {
  return (
    rows.length > 0 &&
    rows.length <= 100 &&
    rows.every(
      (r) =>
        r.can_act &&
        (action === "unlock"
          ? r.status === "disqualified"
          : action === "disqualify"
            ? r.status === "in_progress"
            : r.status !== "reset"),
    )
  );
}
export function monitorPage(page: number, total: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / 25)));
}
