import { z } from "zod";
export const allowedMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
] as const;
export const mediaRowSchema = z.object({
  id: z.uuid(),
  object_path: z.string().min(1),
  mime_type: z.enum(allowedMediaTypes),
  byte_size: z.number().int().positive().max(5242880),
  referenced: z.boolean(),
});
export type MediaRow = z.infer<typeof mediaRowSchema>;
export const mediaListSchema = z.object({
  rows: z.array(mediaRowSchema),
  total: z.number().int().nonnegative(),
});
export const cleanupListSchema = z.array(
  z.object({ id: z.uuid(), path: z.string().min(1) }),
);
export const signedMediaSchema = z.object({
  url: z
    .url()
    .refine(
      (v) =>
        new URL(v).protocol === "https:" || new URL(v).hostname === "127.0.0.1",
      "URL media tidak valid.",
    ),
  mime: z.enum(allowedMediaTypes).optional(),
});
export const mediaWriteSchema = z.object({
  deleted: z.literal(true),
  cleanup_pending: z.boolean(),
  message: z.string().min(1),
});
export const driveFileSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{10,200}$/),
  name: z.string(),
  mimeType: z.enum(allowedMediaTypes),
  size: z
    .string()
    .refine(
      (v) =>
        Number.isSafeInteger(Number(v)) &&
        Number(v) > 0 &&
        Number(v) <= 5242880,
    ),
});
export const driveListSchema = z.object({
  files: z.array(driveFileSchema),
  folder: z.string().min(1),
  next_page_token: z.string().default(""),
});
export function fileProblem(file: Pick<File, "size" | "type">) {
  return file.size === 0
    ? "Berkas kosong."
    : file.size > 5242880
      ? "Maksimal 5 MiB per berkas."
      : !allowedMediaTypes.includes(
            file.type as (typeof allowedMediaTypes)[number],
          )
        ? "Tipe berkas tidak didukung."
        : "";
}
