import { z } from "zod";
export const reportKinds = [
  "recap",
  "class",
  "student",
  "paper",
  "answers",
  "blank",
  "analytics",
] as const;
export const createReportSchema = z.object({
  action: z.literal("create"),
  request_id: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(500),
  kind: z.enum(reportKinds),
  format: z.enum(["pdf", "xlsx"]),
});
export const reportSettingsSchema = z.object({
  action: z.literal("settings"),
  school: z.string().trim().min(1).max(200),
  address: z.string().max(1000),
  official: z.string().max(150),
  official_title: z.string().max(150),
  logo_media_id: z.uuid().nullable(),
});
