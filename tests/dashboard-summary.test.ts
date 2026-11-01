import { describe, it, expect } from "vitest";
import {
  agendaSchema,
  pendingSchema,
  summarizeAgenda,
  formatAgendaTime,
} from "../lib/dashboard/summary";
const exam = (n: number, extra: object = {}) => ({
  id: `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Ujian ${n}`,
  status: "scheduled" as const,
  lifecycle: "Terjadwal" as const,
  starts_at: "2026-11-01T01:00:00Z",
  ready: true,
  ...extra,
});
describe("dashboard snapshots", () => {
  it("counts all completed lifecycle stages and excludes archives", () => {
    const data = agendaSchema.parse({
      server_now: "2026-11-01T00:00:00Z",
      exams: [
        exam(1, { lifecycle: "Berlangsung" }),
        exam(2, { status: "draft", lifecycle: "Draf", ready: false }),
        exam(3, { lifecycle: "Selesai" }),
        exam(4, { lifecycle: "Dinilai" }),
        exam(5, { lifecycle: "Dipublikasikan" }),
        exam(6, { status: "archived", lifecycle: "Diarsipkan" }),
      ],
    });
    expect(summarizeAgenda(data.exams)).toMatchObject({
      running: 1,
      incomplete: 1,
      finished: 3,
      visible: 5,
    });
  });
  it("sorts by actual instants with deterministic ties, prioritizes running/drafts, and limits six without mutating", () => {
    const exams = agendaSchema.parse({
      server_now: "2026-11-01T00:00:00Z",
      exams: [
        exam(8, { starts_at: "2026-11-01T00:30:00Z" }),
        exam(7, { starts_at: "2026-11-01T07:00:00+07:00" }),
        exam(6, { status: "draft", lifecycle: "Draf" }),
        exam(5, { lifecycle: "Berlangsung" }),
        exam(4),
        exam(3),
        exam(2),
        exam(1),
      ],
    }).exams;
    const original = [...exams];
    expect(summarizeAgenda(exams).agenda.map((e) => e.id.slice(-1))).toEqual([
      "5",
      "6",
      "7",
      "8",
      "1",
      "2",
    ]);
    expect(exams).toEqual(original);
    expect(summarizeAgenda(exams).visible).toBe(8);
  });
  it("sorts completed records newest first and handles archive-only/empty lists", () => {
    const exams = agendaSchema.parse({
      server_now: "2026-11-01T00:00:00Z",
      exams: [
        exam(1, { lifecycle: "Dinilai", starts_at: "2026-10-01T00:00:00Z" }),
        exam(2, { lifecycle: "Dipublikasikan" }),
      ],
    }).exams;
    expect(summarizeAgenda(exams).agenda[0].id).toContain("000000000002");
    expect(summarizeAgenda([]).visible).toBe(0);
    expect(
      summarizeAgenda(
        agendaSchema.parse({
          server_now: "2026-11-01",
          exams: [exam(1, { status: "archived" })],
        }).exams,
      ).agenda,
    ).toEqual([]);
  });
  it("rejects missing arrays, malformed dates, unsafe ids, and invalid counts instead of showing zero", () => {
    for (const data of [
      null,
      {},
      { exams: null, server_now: "2026-11-01" },
      { exams: [exam(1, { starts_at: "bad" })], server_now: "2026-11-01" },
      {
        exams: [exam(1, { id: "unsafe&exam=other" })],
        server_now: "2026-11-01",
      },
    ])
      expect(agendaSchema.safeParse(data).success).toBe(false);
    for (const total of [
      -1,
      NaN,
      Infinity,
      1.5,
      "7",
      null,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(pendingSchema.safeParse({ total }).success).toBe(false);
    expect(pendingSchema.parse({ total: 0 }).total).toBe(0);
  });
  it("formats displayed times in WIB independent of client timezone", () => {
    expect(formatAgendaTime("2026-11-01T00:00:00Z")).toContain("07.00 WIB");
  });
});
