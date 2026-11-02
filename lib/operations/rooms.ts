import type { z } from "zod";
import type { roomsSchema } from "./contracts";
export type RoomsData = z.infer<typeof roomsSchema>;
export const roomActions = [
  "room_save",
  "room_delete",
  "session_save",
  "session_delete",
  "roster_add",
  "roster_remove",
  "assign",
  "unassign",
  "substitute",
  "revoke",
] as const;
export const roomTitles: Record<string, string> = {
  room_save: "Ruang ujian",
  room_delete: "Hapus ruang",
  session_save: "Sesi ujian",
  session_delete: "Hapus sesi",
  roster_add: "Tambah peserta ruang",
  roster_remove: "Keluarkan peserta ruang",
  assign: "Tugaskan pengawas",
  unassign: "Nonaktifkan tugas",
  substitute: "Tunjuk pengganti",
  revoke: "Cabut pengganti",
};
export function roomLocalDate(value: string) {
  const n = Date.parse(value);
  return Number.isFinite(n)
    ? new Date(n + 7 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function roomInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw Error("Waktu tidak valid.");
  const n = Date.parse(value + ":00+07:00");
  if (!Number.isFinite(n) || roomLocalDate(new Date(n).toISOString()) !== value)
    throw Error("Waktu tidak valid.");
  return new Date(n).toISOString();
}
export function roomDate(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)) + " WIB"
  );
}
export function roomSelection(current: string[], ids: string[]) {
  return [...new Set([...current, ...ids])].slice(0, 500);
}
export function sortRooms(value: RoomsData): RoomsData {
  const byName = (
    a: { id: string; name: string },
    b: { id: string; name: string },
  ) =>
    a.name.localeCompare(b.name, "id", { numeric: true }) ||
    a.id.localeCompare(b.id);
  return {
    ...value,
    rooms: [...value.rooms].sort(byName),
    sessions: [...value.sessions].sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at) || byName(a, b),
    ),
    eligible: [...value.eligible].sort(byName),
    roster: [...value.roster].sort(
      (a, b) =>
        a.name.localeCompare(b.name, "id") ||
        a.student_id.localeCompare(b.student_id),
    ),
    assignments: [...value.assignments].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id),
    ),
  };
}
