import { z } from "zod";
const uuid = z.uuid(),
  request_id = uuid,
  exam_id = uuid,
  id = uuid,
  student_ids = z.array(uuid).min(1).max(500),
  reason = z.string().trim().min(5).max(1000),
  dates = {
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
  };
export const operation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("room_save"),
    request_id,
    exam_id,
    id: id.optional(),
    name: z.string().trim().min(1).max(100),
    capacity: z.number().int().min(0).max(10000),
  }),
  z.object({
    action: z.enum(["room_delete", "session_delete", "unassign", "revoke"]),
    request_id,
    id,
  }),
  z.object({
    action: z.literal("session_save"),
    request_id,
    exam_id,
    id: id.optional(),
    name: z.string().trim().min(1).max(100),
    ...dates,
  }),
  z.object({
    action: z.enum(["roster_add", "roster_remove"]),
    request_id,
    exam_id,
    id,
    student_ids,
  }),
  z.object({
    action: z.literal("assign"),
    request_id,
    exam_id,
    room_id: uuid,
    session_id: uuid,
    supervisor_id: uuid,
  }),
  z.object({
    action: z.literal("substitute"),
    request_id,
    id,
    supervisor_id: uuid,
    ...dates,
  }),
  z.object({
    action: z.enum(["reset", "unlock", "disqualify"]),
    request_id,
    attempts: z
      .array(z.object({ id, version: z.number().int().min(1) }))
      .min(1)
      .max(100),
    reason,
    confirmation: z.literal("KONFIRMASI"),
  }),
  z.object({
    action: z.literal("broadcast"),
    request_id,
    scope: z.enum(["all", "exam", "selected"]),
    exam_id: exam_id.optional(),
    student_ids: student_ids.optional(),
    message: z.string().trim().min(1).max(2000),
  }),
  z.object({ action: z.literal("read"), id }),
]);
export const cardCreate = z.object({
  action: z.literal("create"),
  request_id,
  exam_id,
  student_ids,
  format: z.enum(["pdf", "zip"]),
  template: z.enum(["compact", "large"]),
});
