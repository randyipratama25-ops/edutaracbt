import { z } from "zod";
const maybeUUID = z.union([z.uuid(), z.literal(""), z.null()]);
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subtitle: z.string().max(200),
  timezone: z.string().min(1).max(80),
  login_logo_id: maybeUUID,
  login_background_id: maybeUUID,
  violation_limit: z.number().int().min(1).max(100),
  canvas_enabled: z.boolean(),
  results_enabled: z.boolean(),
  automation_enabled: z.boolean(),
  reminders_enabled: z.boolean(),
  retention_days: z.number().int().min(7).max(730),
  smtp_sender: z.union([z.email(), z.literal("")]),
  reminder_template: z.string().min(20).max(5000),
});
export const systemMutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    version: z.number().int().min(1),
    settings: settingsSchema,
  }),
  z.object({
    action: z.literal("secret"),
    key: z.enum(["smtp_password", "ai_api_key", "drive_access_token"]),
    value: z.string().min(8).max(10000),
  }),
  z.object({ action: z.enum(["backup", "smtp_probe"]), request_id: z.uuid() }),
  z.object({ action: z.literal("retry"), id: z.uuid() }),
  z.object({
    action: z.literal("cancel_backup"),
    id: z.uuid(),
    reason: z.string().trim().min(5).max(1000),
    confirmation: z.literal("KONFIRMASI"),
  }),
  z.object({
    action: z.literal("resolve_email"),
    id: z.uuid(),
    resolution: z.enum(["sent", "not_sent"]),
    reason: z.string().trim().min(5).max(1000),
    confirmation: z.literal("KONFIRMASI"),
  }),
]);
export type AppSettings = z.infer<typeof settingsSchema> & {
  version: number;
  secrets: Record<string, boolean>;
  scheduler: string;worker_capabilities?:{backup:boolean;smtp:boolean;retention:boolean};
};
