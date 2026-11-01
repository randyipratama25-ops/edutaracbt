import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/admin/master/route";
import { loadMasterData } from "../lib/master/server";
const id = (n: number) =>
  `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let records: Record<string, Record<string, unknown>[]>,
  writes: {
    table: string;
    fields: unknown;
    options?: unknown;
    filters: unknown[];
  }[],
  reads: { table: string; filters: unknown[]; range?: number[] }[],
  failedRead: string | undefined,
  writeResult: Record<string, unknown>,
  userActive: boolean,
  classActive: boolean;
function client() {
  return {
    from: (table: string) => {
      const filters: unknown[] = [];
      let range = [0, 499],
        write = false;
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((...x) => {
          filters.push(x);
          return q;
        }),
        in: vi.fn((...x) => {
          filters.push(x);
          return q;
        }),
        order: vi.fn(() => q),
        range: vi.fn((a, b) => {
          range = [a, b];
          return q;
        }),
        abortSignal: vi.fn(() => q),
        overrideTypes: vi.fn(async () => {
          reads.push({ table, filters, range });
          return {
            data:
              table === failedRead
                ? null
                : (records[table] || []).slice(range[0], range[1] + 1),
            error: table === failedRead ? { message: "SECRET_SQL" } : null,
          };
        }),
        single: vi.fn(async () => {
          if (write) return writeResult;
          const target = filters.find(
            (x) => Array.isArray(x) && x[0] === "id",
          ) as string[] | undefined;
          return {
            data:
              table === "profiles"
                ? {
                    role: target?.[1] === id(2) ? "student" : "teacher",
                    active: userActive,
                  }
                : { id: id(3), active: classActive },
            error: null,
          };
        }),
        update: vi.fn((fields) => {
          write = true;
          writes.push({ table, fields, filters });
          return q;
        }),
        insert: vi.fn((fields) => {
          write = true;
          writes.push({ table, fields, filters });
          return q;
        }),
        upsert: vi.fn((fields, options) => {
          write = true;
          writes.push({ table, fields, options, filters });
          return q;
        }),
      };
      return q;
    },
  };
}
function a(role = "admin", context = "staff") {
  return {
    role,
    context,
    organization_id: "org",
    client: client(),
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>;
}
const post = (body: unknown, origin = "https://app.test") =>
  POST(
    new Request("https://app.test/api/admin/master", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  records = {
    classes: [],
    subjects: [],
    teacher_assignments: [],
    student_enrollments: [],
    profiles: [],
  };
  reads = [];
  writes = [];
  failedRead = undefined;
  userActive = true;
  classActive = true;
  writeResult = { data: { id: id(8) }, error: null, status: 200 };
  vi.mocked(actor).mockResolvedValue(a());
});
describe("master API and read scope", () => {
  it("paginates beyond 1000 references without truncation and keeps inactive names", async () => {
    records.profiles = Array.from({ length: 1001 }, (_, i) => ({
      id: id(i + 1),
      full_name: "Guru " + i,
      role: "teacher",
      active: i !== 1000,
    }));
    const data = await loadMasterData(a());
    expect(data.people).toHaveLength(1001);
    expect(data.people[1000].active).toBe(false);
    expect(
      reads.filter((r) => r.table === "profiles").map((r) => r.range),
    ).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
    for (const r of reads)
      expect(r.filters).toContainEqual(["organization_id", "org"]);
    expect(
      reads.find((r) => r.table === "profiles")?.filters,
    ).not.toContainEqual(["active", true]);
  });
  it("returns a safe read error instead of empty people when a dependency fails", async () => {
    failedRead = "profiles";
    const r = await GET();
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("SECRET_SQL");
  });
  it("allows teacher read-only scope, rejects guest/context mutations and validates Origin", async () => {
    vi.mocked(actor).mockResolvedValue(a("teacher"));
    expect((await GET()).status).toBe(200);
    expect((await post({ kind: "classes", name: "Kelas" })).status).toBe(403);
    vi.mocked(actor).mockResolvedValue(a("teacher", "supervisor"));
    expect((await GET()).status).toBe(401);
    expect(
      (await post({ kind: "classes", name: "Kelas" }, "https://outside.test"))
        .status,
    ).toBe(403);
    expect(writes).toEqual([]);
  });
  it("rejects null, empty names and incomplete relations before writes", async () => {
    for (const x of [
      null,
      [],
      {},
      { kind: "classes", name: " " },
      { kind: "assignment", user_id: id(1), class_id: id(3) },
      { kind: "enrollment", user_id: "bad", class_id: id(3) },
    ])
      expect((await post(x)).status).toBe(422);
    expect(writes).toEqual([]);
  });
  it("preserves master create/update payload and explicitly scopes updates", async () => {
    expect((await post({ kind: "classes", name: " VII A " })).status).toBe(200);
    expect(writes[0]).toMatchObject({
      table: "classes",
      fields: { organization_id: "org", name: "VII A" },
    });
    expect(
      (await post({ kind: "subjects", id: id(4), name: "IPS", active: false }))
        .status,
    ).toBe(200);
    expect(writes[1].filters).toContainEqual(["id", id(4)]);
    expect(writes[1].filters).toContainEqual(["organization_id", "org"]);
  });
  it("keeps assignment/enrollment upsert keys and existing saved:true contract", async () => {
    const teacher = await post({
      kind: "assignment",
      user_id: id(1),
      class_id: id(3),
      subject_id: id(4),
    });
    expect((await teacher.json()).data).toEqual({ saved: true });
    expect(writes[0]).toMatchObject({
      table: "teacher_assignments",
      options: { onConflict: "teacher_id,class_id,subject_id" },
    });
    expect(
      (await post({ kind: "enrollment", user_id: id(2), class_id: id(3) }))
        .status,
    ).toBe(200);
    expect(writes[1]).toMatchObject({
      table: "student_enrollments",
      options: { onConflict: "student_id,class_id" },
    });
  });
  it("rejects wrong-role/inactive references on activation but permits cleanup deactivation", async () => {
    expect(
      (
        await post({
          kind: "assignment",
          user_id: id(2),
          class_id: id(3),
          subject_id: id(4),
        })
      ).status,
    ).toBe(422);
    userActive = false;
    expect(
      (await post({ kind: "enrollment", user_id: id(2), class_id: id(3) }))
        .status,
    ).toBe(422);
    userActive = true;
    classActive = false;
    expect(
      (
        await post({
          kind: "assignment",
          user_id: id(1),
          class_id: id(3),
          subject_id: id(4),
        })
      ).status,
    ).toBe(422);
    userActive = false;
    expect(
      (
        await post({
          kind: "assignment",
          id: id(5),
          user_id: id(1),
          class_id: id(3),
          subject_id: id(4),
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(writes).toHaveLength(1);
  });
  it("distinguishes known database rejection from uncertain write receipts", async () => {
    writeResult = { error: { code: "23505" }, data: null, status: 409 };
    expect((await post({ kind: "classes", name: "Duplikat" })).status).toBe(
      422,
    );
    for (const r of [
      { error: { message: "fetch lost" }, data: null, status: 0 },
      { error: { message: "upstream" }, data: null, status: 503 },
      { error: null, data: null, status: 200 },
    ]) {
      writeResult = r;
      const res = await post({ kind: "classes", name: "Data" });
      expect(res.status).toBe(503);
      expect(await res.text()).toContain("belum dapat dipastikan");
    }
  });
});
