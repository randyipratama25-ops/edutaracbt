import { z } from "zod";
import { settingsSchema } from "./validation";
export const secretKeys = [
  "smtp_password",
  "ai_api_key",
  "drive_access_token",
] as const;
export const appSettingsSchema = settingsSchema.extend({
  version: z.number().int().positive(),
  secrets: z.record(z.string(), z.boolean()),
  scheduler: z.string(),
  secret_readback: z.literal(false).optional(),
  worker_capabilities: z
    .object({ backup: z.boolean(), smtp: z.boolean(), retention: z.boolean() })
    .optional(),
});
export type SettingsResponse = z.infer<typeof appSettingsSchema>;
export function settingsReceipt(action: string): z.ZodType<unknown> {
  if (action === "save") return z.object({ saved: z.literal(true) });
  if (action === "secret")
    return z.object({
      configured: z.literal(true),
      readback: z.literal(false),
    });
  if (action === "smtp_probe" || action === "backup")
    return z.object({ id: z.uuid(), queued: z.literal(true) });
  if (action === "cancel_backup")
    return z.object({ cancelled: z.literal(true) });
  if (action === "retry") return z.object({ queued: z.literal(true) });
  return z.object({ saved: z.literal(true) });
}
export function settingsValues(value: SettingsResponse) {
  return settingsSchema.parse(value);
}
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
