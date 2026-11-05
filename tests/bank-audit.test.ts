import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/bank/route";
import { bankCommand } from "../lib/bank/schema";
import {
  bankListFor,
  bankDetailSchema,
  bankReceipt,
  bankDecisions,
  bankQualitySchema,
} from "../lib/bank/contracts";
import { questionSchema } from "../lib/authoring/schema";
import { templates } from "../lib/authoring/imports";
const id = (n: number) =>
  `09000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const meta = {
  subject_id: id(2),
  class_ids: [id(3)],
  topic: "Materi",
  indicator: "Memahami materi",
  difficulty: "medium",
  cognitive: "C2",
};
const row = {
  id: id(1),
  metadata: meta,
  state: "draft",
  version: 2,
  owner_id: id(4),
  payload: questionSchema.parse(templates.PG),
  can_edit: true,
  can_review: true,
};
const raw = {
  action: "save",
  request_id: id(9),
  meta,
  payload: row.payload,
  reason: "Catatan versi",
};
let result: { data: unknown; error: { code?: string; message: string } | null },
  rpc: ReturnType<typeof vi.fn>;
const req = (value: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/bank", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  result = { data: { rows: [row], total: 1 }, error: null };
  rpc = vi.fn(async () => result);
  vi.mocked(actor).mockResolvedValue({
    role: "teacher",
    context: "staff",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
describe("bank audit", () => {
  it("rejects decimal/infinite pages, invalid filters, and missing detail target before RPC", async () => {
    for (const q of [
      "page=1.2",
      "page=Infinity",
      "page=10001",
      "state=unknown",
      "subject=bad",
      "action=detail",
      "action=quality",
    ])
      expect(
        (await GET(new Request("https://cbt.test/api/bank?" + q))).status,
      ).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates lists, duplicate identities, and a shrinking out-of-range page", () => {
    expect(bankListFor(1).safeParse({ rows: [row], total: 1 }).success).toBe(
      true,
    );
    expect(
      bankListFor(1).safeParse({ rows: [row, row], total: 2 }).success,
    ).toBe(false);
    expect(bankListFor(1).safeParse({ rows: [], total: 1 }).success).toBe(
      false,
    );
    expect(bankListFor(4).safeParse({ rows: [], total: 1 }).success).toBe(true);
  });
  it("requires complete detail versions and constrains archived decisions to reopening", () => {
    const d = {
      item: row,
      versions: [{ version: 1, payload: row.payload, reason: "Awal" }],
      reviews: [],
      similar: 0,
      usage: [],
    };
    expect(bankDetailSchema.safeParse(d).success).toBe(false);
    expect(
      bankDecisions(
        { state: "archived" },
        { can_edit: true, can_review: true },
      ),
    ).toEqual(["draft"]);
    expect(
      bankDecisions({ state: "draft" }, { can_edit: false, can_review: false }),
    ).toEqual([]);
  });
  it("requires current version for edits and unique class/target selections", () => {
    expect(bankCommand.safeParse({ ...raw, id: id(1) }).success).toBe(false);
    expect(
      bankCommand.safeParse({
        ...raw,
        meta: { ...meta, class_ids: [id(3), id(3)] },
      }).success,
    ).toBe(false);
    expect(
      bankCommand.safeParse({
        action: "preview",
        request_id: id(9),
        exam_ids: [id(1), id(1)],
        rules: [{ type: "PG", count: 1, points: 1 }],
      }).success,
    ).toBe(false);
  });
  it("does not accept null or a wrong receipt as successful mutation", async () => {
    for (const data of [null, { saved: true }, { id: "bad" }]) {
      result.data = data;
      expect((await POST(req(raw))).status).toBe(503);
    }
    result.data = { id: id(1) };
    expect((await POST(req(raw))).status).toBe(200);
  });
  it("validates import cardinality/row identity and all packet target receipts", () => {
    const input = bankCommand.parse({
      ...raw,
      action: "import",
      items: [row.payload, row.payload],
    });
    expect(
      bankReceipt(input).safeParse([{ row: 1, saved: true, id: id(1) }])
        .success,
    ).toBe(false);
    expect(
      bankReceipt(input).safeParse([
        { row: 1, saved: true, id: id(1) },
        { row: 1, saved: false, error: "Duplikat" },
      ]).success,
    ).toBe(false);
    expect(
      bankReceipt(input).safeParse([
        { row: 1, saved: true, id: id(1) },
        { row: 2, saved: false, error: "Duplikat" },
      ]).success,
    ).toBe(true);
    const pack = bankCommand.parse({
      action: "assemble",
      request_id: id(9),
      exam_ids: [id(7), id(8)],
      rules: [{ type: "PG", count: 2, points: 1 }],
    });
    expect(
      bankReceipt(pack).safeParse([
        { exam_id: id(7), count: 2, pack_id: id(10) },
      ]).success,
    ).toBe(false);
    expect(
      bankReceipt(pack).safeParse([
        { exam_id: id(7), count: 2, pack_id: id(10) },
        { exam_id: id(8), count: 1, pack_id: id(11) },
      ]).success,
    ).toBe(false);
  });
  it("matches every preview group/target rather than enabling assembly from partial candidates", () => {
    const input = bankCommand.parse({
      action: "preview",
      request_id: id(9),
      exam_ids: [id(7)],
      rules: [
        { type: "PG", count: 2, points: 1 },
        { type: "Esai", count: 1, points: 5 },
      ],
    });
    if (!("rules" in input)) throw Error("Expected rules");
    expect(
      bankReceipt(input).safeParse([
        { exam_id: id(7), rule: input.rules[0], available: 4 },
      ]).success,
    ).toBe(false);
    expect(
      bankReceipt(input).safeParse(
        input.rules.map((rule) => ({ exam_id: id(7), rule, available: 5 })),
      ).success,
    ).toBe(true);
  });
  it("masks transport/SQL errors while preserving authorization and version conflicts", async () => {
    for (const [error, status] of [
      [{ code: "08006", message: "PRIVATE_HOST" }, 503],
      [{ code: "23502", message: "PRIVATE_SQL" }, 422],
      [{ code: "P0001", message: "AUTH: Di luar penugasan" }, 403],
      [{ code: "P0001", message: "CONFLICT: Versi berubah" }, 409],
    ] as const) {
      result.error = error;
      const r = await POST(req(raw));
      expect(r.status).toBe(status);
      expect(await r.text()).not.toContain("PRIVATE_");
    }
  });
  it("keeps authentication/origin/body limits ahead of RPC", async () => {
    expect((await POST(req(raw, "https://other.test"))).status).toBe(403);
    vi.mocked(actor).mockResolvedValue(null);
    expect((await GET(new Request("https://cbt.test/api/bank"))).status).toBe(
      403,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("treats malformed quality rows as unavailable rather than crashing or reporting zero", async () => {
    result.data = [{}];
    expect(
      (
        await GET(
          new Request("https://cbt.test/api/bank?action=quality&id=" + id(1)),
        )
      ).status,
    ).toBe(503);
    result.data = [];
    const r = await GET(
      new Request("https://cbt.test/api/bank?action=quality&id=" + id(1)),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({
      eligible: 0,
      limit: 300,
      items: [],
    });
  });
  it("quality projection does not introduce individual student details", () => {
    const parsed = bankQualitySchema.parse({
      eligible: 1,
      items: [
        {
          id: "group",
          type: "PG",
          n: 1,
          p: 1,
          d: 0,
          small_sample: true,
          difficulty: "Mudah",
          discrimination: "Cukup",
          options: [
            {
              id: "A",
              choices: { selected: 1 },
              is_key: true,
              selection_rate: 1,
              nonfunctional: false,
              wrong: [{ student: "PRIVATE_NAME", attempt_id: id(1) }],
              text: "private option",
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE_NAME");
    expect(JSON.stringify(parsed)).not.toContain("private option");
  });
});
it('bounds streamed multibyte input by bytes before parsing or calling RPC',async()=>{
 const request=new Request('https://cbt.test/api/bank',{method:'POST',headers:{origin:'https://cbt.test'},body:'漢'.repeat(1_700_000)});
 expect((await POST(request)).status).toBe(413);
 expect((await POST(new Request('https://cbt.test/api/bank',{method:'POST',headers:{origin:'https://cbt.test'},body:'{bad'}))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
