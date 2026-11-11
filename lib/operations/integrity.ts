import { z } from "zod";

export const integrityWarning = z.object({ id: z.uuid(), message: z.string() });
const followupAction = z.enum(["warn", "note", "resolve"]);
export const integrityFollowup = z.object({
  action: followupAction,
  attempt_id: z.uuid(),
  group_id: z.uuid(),
  request_id: z.uuid(),
  message: z.string().trim().min(5).max(1000),
});
export const integrityHistory = z.object({
  open_groups: z.array(z.uuid()),
  events: z.array(
    z.object({
      event_id: z.uuid(),
      group_id: z.uuid(),
      kind: z.string(),
      countable: z.boolean(),
      created_at: z.iso.datetime({ offset: true }),
      metadata: z
        .object({
          occurred_at: z.iso.datetime({ offset: true }).nullish(),
          duration_ms: z.number().int().nonnegative().nullish(),
          question_number: z.number().int().positive().nullish(),
          editing: z.boolean().nullish(),
          orientation_recent: z.boolean().nullish(),
        })
        .nullish(),
    }),
  ),
  followups: z.array(
    z.object({
      id: z.uuid(),
      group_id: z.uuid(),
      action: followupAction,
      message: z.string(),
      actor: z.string(),
      created_at: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type IntegrityHistory = z.infer<typeof integrityHistory>;

export const integrityLabels: Record<string, string> = {
  visibility_start: "Halaman mulai tersembunyi",
  visibility_hidden: "Kembali ke halaman ujian",
  focus_loss: "Jendela kehilangan fokus",
  fullscreen_exit: "Keluar dari layar penuh",
  connection_lost: "Koneksi terputus",
  connection_restored: "Koneksi tersambung kembali",
  pagehide: "Halaman ditutup atau ditinggalkan",
  shortcut: "Pintasan keyboard",
  copy: "Menyalin",
  cut: "Memotong teks",
  paste: "Menempel",
  contextmenu: "Menu konteks",
};
