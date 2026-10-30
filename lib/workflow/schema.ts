import { z } from "zod";
import { userSchema } from "../domain/validation";
const id = z.uuid();
export const workflowCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("import_preview"),
    items: z.array(userSchema).min(1).max(200),
  }),
  z.object({
    action: z.literal("publish"),
    exam_id: id,
    request_id: id,
    confirmation: z.literal("PUBLIKASIKAN"),
  }),
  z.object({
    action: z.literal("help"),
    attempt_id: id,
    request_id: id,
    message: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("resolve"),
    id,
    request_id: id,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("extend"),
    attempt_id: id,
    request_id: id,
    version: z.number().int().positive(),
    minutes: z.number().int().min(1).max(60),
    reason: z.string().trim().min(5).max(1000),
    confirmation: z.literal("TAMBAH WAKTU"),
  }),
]);
export type Check = {
  code: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
  href: string;
};
export type Preparation = {
  id: string;
  title: string;
  status: string;
  lifecycle: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  ready: boolean;
  participants: number;
  unconfirmed: number;
  question_count: number;
  checks: Check[];
};
export type Help = {
  id: string;
  attempt_id: string;
  student: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  can_resolve: boolean;
};
export type Signal = {
  attempt_id: string;
  last_seen_at: string | null;
  connection: "recent" | "stale" | "unknown";
  help_count: number;
};
export type WorkflowData = {
  exams: Preparation[];
  admin: boolean;
  server_now: string;
};
