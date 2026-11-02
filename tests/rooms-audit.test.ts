import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/operations/route";
import { operation } from "../lib/operations/schema";
import {
  roomActions,
  roomLocalDate,
  roomInstant,
  roomSelection,
  sortRooms,
} from "../lib/operations/rooms";
import { operationReceipt, roomsSchema } from "../lib/operations/contracts";
const id = "09000000-0000-4000-8000-000000000001",
  req = (data: unknown) =>
    new Request("https://cbt.test/api/operations", {
      method: "POST",
      headers: { origin: "https://cbt.test" },
      body: JSON.stringify(data),
    });
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rpc = vi.fn(async () => ({ data: { id }, error: null }));
  vi.mocked(actor).mockResolvedValue({
    role: "admin",
    context: "staff",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
it("uses WIB independent of device timezone and round-trips dates", () => {
  expect(roomLocalDate("2026-11-02T00:00:00Z")).toBe("2026-11-02T07:00");
  expect(roomInstant("2026-11-02T07:00")).toBe("2026-11-02T00:00:00.000Z");
  expect(() => roomInstant("2026-02-30T07:00")).toThrow();
  expect(() => roomInstant("")).toThrow();
});
it("caps unique roster selections500 and preserves existing selections", () => {
  const ids = Array.from({ length: 501 }, (_, i) => String(i));
  expect(roomSelection(["0"], ids)).toEqual(ids.slice(0, 500));
});
it("requires unique roster IDs and valid session times", () => {
  expect(
    operation.safeParse({
      action: "roster_add",
      request_id: id,
      exam_id: id,
      id,
      student_ids: [id, id],
    }).success,
  ).toBe(false);
  expect(
    operation.safeParse({
      action: "session_save",
      request_id: id,
      exam_id: id,
      name: "Sesi",
      starts_at: "2026-11-02T02:00:00Z",
      ends_at: "2026-11-02T01:00:00Z",
    }).success,
  ).toBe(false);
});
it("accepts zero capacity and rejects false acknowledgement", () => {
  expect(
    operation.parse({
      action: "room_save",
      request_id: id,
      exam_id: id,
      name: "Ruang",
      capacity: 0,
    }),
  ).toHaveProperty("capacity", 0);
  expect(
    operationReceipt("room_delete").safeParse({ saved: false }).success,
  ).toBe(false);
});
it("validates nullable legacy session and orders data without mutating snapshots", () => {
  const data = {
    rooms: [
      { id, name: "Ruang 10", capacity: 0, count: 0 },
      {
        id: "09000000-0000-4000-8000-000000000002",
        name: "Ruang 2",
        capacity: 3,
        count: 0,
      },
    ],
    sessions: [],
    roster: [],
    eligible: [],
    assignments: [
      {
        id,
        room_id: id,
        session_id: null,
        original_supervisor_id: id,
        effective_supervisor: null,
        active: false,
        substitutions: [],
      },
    ],
  };
  const parsed = roomsSchema.parse(data);
  expect(sortRooms(parsed).rooms[0].name).toBe("Ruang 2");
  expect(parsed.rooms[0].name).toBe("Ruang 10");
  expect(roomsSchema.safeParse({ ...data, roster: null }).success).toBe(false);
});
it.each(["teacher", "supervisor", "student"])(
  "rejects %s room reads before RPC",
  async (role) => {
    vi.mocked(actor).mockResolvedValue({
      role,
      context: role === "teacher" ? "staff" : role,
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect(
      (
        await GET(
          new Request(
            "https://cbt.test/api/operations?action=rooms&exam=" + id,
          ),
        )
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it.each([...roomActions])(
  "denies nonadmin %s mutation before RPC",
  async (action) => {
    vi.mocked(actor).mockResolvedValue({
      role: "teacher",
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    const data = {
      action,
      request_id: id,
      id,
      exam_id: id,
      room_id: id,
      session_id: id,
      supervisor_id: id,
      name: "Sesi",
      capacity: 0,
      student_ids: [id],
      starts_at: "2026-11-02T00:00:00Z",
      ends_at: "2026-11-02T01:00:00Z",
    };
    expect((await POST(req(data))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("preserves admin payload and maps missing session conflict", async () => {
  const input = {
    action: "room_save",
    request_id: id,
    exam_id: id,
    name: "Ruang",
    capacity: 0,
  };
  expect((await POST(req(input))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("ops_command", { input });
  rpc.mockResolvedValue({
    data: null,
    error: {
      code: "P0001",
      message: "CONFLICT: Sesi tidak tersedia; muat ulang daftar",
    },
  });
  expect(
    (
      await POST(
        req({
          action: "session_save",
          request_id: id,
          exam_id: id,
          id,
          name: "Sesi",
          starts_at: "2026-11-02T00:00:00Z",
          ends_at: "2026-11-02T01:00:00Z",
        }),
      )
    ).status,
  ).toBe(409);
});

it("rejects false and malformed room mutation receipts", async () => {
  const input = { action: "room_delete", request_id: id, id };
  rpc.mockResolvedValueOnce({ data: { saved: false }, error: null });
  expect((await POST(req(input))).status).toBe(409);
  rpc.mockResolvedValueOnce({ data: {}, error: null });
  expect((await POST(req(input))).status).toBe(503);
});
