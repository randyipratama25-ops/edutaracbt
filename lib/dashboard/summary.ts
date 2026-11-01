import { z } from "zod";

const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
export const agendaSchema = z.object({
  exams: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().min(1),
      status: z.enum(["draft", "scheduled", "active", "closed", "archived"]),
      lifecycle: z.enum([
        "Diarsipkan",
        "Siap Ditinjau",
        "Draf",
        "Dipublikasikan",
        "Dinilai",
        "Selesai",
        "Berlangsung",
        "Terjadwal",
      ]),
      starts_at: timestamp,
      ready: z.boolean(),
    }),
  ),
  server_now: timestamp,
});
export const pendingSchema = z.object({
  total: z.number().int().nonnegative().safe(),
});
export type Agenda = z.infer<typeof agendaSchema>;
export const formatCount = (value: number) => value.toLocaleString("id-ID");
export function formatAgendaTime(value: string) {
  return (
    new Date(value).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}
export function summarizeAgenda(exams: Agenda["exams"]) {
  const visible = exams.filter((e) => e.status !== "archived");
  const rank = (e: Agenda["exams"][number]) =>
    e.lifecycle === "Berlangsung"
      ? 0
      : e.status === "draft"
        ? 1
        : e.lifecycle === "Terjadwal"
          ? 2
          : 3;
  const ordered = [...visible].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 3
        ? Date.parse(b.starts_at) - Date.parse(a.starts_at)
        : Date.parse(a.starts_at) - Date.parse(b.starts_at)) ||
      a.id.localeCompare(b.id),
  );
  return {
    visible: visible.length,
    running: visible.filter((e) => e.lifecycle === "Berlangsung").length,
    incomplete: visible.filter((e) => e.status === "draft" && !e.ready).length,
    finished: visible.filter((e) =>
      ["Selesai", "Dinilai", "Dipublikasikan"].includes(e.lifecycle),
    ).length,
    agenda: ordered.slice(0, 6),
  };
}
