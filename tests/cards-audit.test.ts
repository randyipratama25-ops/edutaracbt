import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("../lib/operations/cards", () => ({ processCards: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { after } from "next/server";
import { GET, POST } from "../app/api/cards/route";
import { GET as download } from "../app/api/cards/download/route";
import { cardCreate } from "../lib/operations/schema";
import {
  cardJobsSchema,
  selectCards,
  cardClaimSchema,
} from "../lib/operations/card-contracts";
const id = "08000000-0000-4000-8000-000000000001";
const input = {
  action: "create",
  request_id: id,
  exam_id: id,
  student_ids: [id],
  format: "pdf",
  template: "compact",
};
let rpc: ReturnType<typeof vi.fn>, signed: ReturnType<typeof vi.fn>;
const request = (data: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/cards", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn(async (_name, { input }) => ({
    data:
      input.action === "create"
        ? { id }
        : input.action === "claim"
          ? { lease: id }
          : input.action === "list"
            ? []
            : { path: "private/cards.pdf" },
    error: null,
  }));
  signed = vi.fn(async () => ({
    data: { signedUrl: "https://storage.test/signed" },
    error: null,
  }));
  vi.mocked(actor).mockResolvedValue({
    id,
    context: "staff",
    role: "admin",
    organization_id: id,
    client: { rpc, storage: { from: () => ({ createSignedUrl: signed }) } },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
it("rejects duplicate participants and ZIP above50", () => {
  expect(
    cardCreate.safeParse({ ...input, student_ids: [id, id] }).success,
  ).toBe(false);
  expect(
    cardCreate.safeParse({
      ...input,
      format: "zip",
      student_ids: Array.from(
        { length: 51 },
        (_, i) => `08000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ),
    }).success,
  ).toBe(false);
});
it("selection is unique and bounded", () => {
  expect(selectCards(["a"], ["a", "b", "c"], 2)).toEqual(["a", "b"]);
});
it("rejects malformed progress and snapshot", () => {
  expect(
    cardJobsSchema.safeParse([
      { id, status: "ready", progress: 101, error: null, format: "pdf" },
    ]).success,
  ).toBe(false);
  expect(cardClaimSchema.safeParse({ lease: id, snapshot: null }).success).toBe(
    false,
  );
});
it("requires a session", async () => {
  vi.mocked(actor).mockResolvedValue(null);
  expect((await GET()).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("requires same origin and validates null JSON", async () => {
  expect((await POST(request(input, "https://evil.test"))).status).toBe(403);
  expect((await POST(request(null))).status).toBe(422);
  expect(rpc).not.toHaveBeenCalled();
});
it("claims exactly once before scheduling", async () => {
  const r = await POST(request(input));
  expect(r.status).toBe(200);
  expect(rpc.mock.calls.map((x) => x[1].input.action)).toEqual([
    "create",
    "claim",
  ]);
  expect(after).toHaveBeenCalledTimes(1);
});
it("does not schedule a denied retry or leak SQL", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "private secret SQL" },
  });
  const r = await POST(request({ action: "retry", job_id: id }));
  expect(r.status).toBe(422);
  expect(await r.text()).not.toContain("secret");
  expect(after).not.toHaveBeenCalled();
});
it("does not accept missing create receipt", async () => {
  rpc.mockResolvedValue({ data: {}, error: null });
  expect((await POST(request(input))).status).toBe(503);
  expect(after).not.toHaveBeenCalled();
});
it.each([
  ["busy", "running"],
  ["ready", "ready"],
])("reports %s without another worker", async (key, state) => {
  rpc.mockResolvedValue({ data: { [key]: true }, error: null });
  const r = await POST(request({ action: "retry", job_id: id }));
  expect((await r.json()).data).toMatchObject({ id, queued: false, state });
  expect(after).not.toHaveBeenCalled();
});
it("honors retry budget before acknowledgement", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "P0001", message: "Batas retry tercapai" },
  });
  expect((await POST(request({ action: "retry", job_id: id }))).status).toBe(
    422,
  );
  expect(after).not.toHaveBeenCalled();
});
it("validates download receipt and unavailable signed URL", async () => {
  rpc.mockResolvedValueOnce({ data: {}, error: null });
  const req = new Request("https://cbt.test/api/cards/download?id=" + id);
  expect((await download(req)).status).toBe(503);
  expect(signed).not.toHaveBeenCalled();
  signed.mockResolvedValue({ data: null, error: null });
  expect((await download(req)).status).toBe(503);
});
it("keeps download private and short lived", async () => {
  const r = await download(
    new Request("https://cbt.test/api/cards/download?id=" + id),
  );
  expect(r.status).toBe(302);
  expect(r.headers.get("Cache-Control")).toContain("private");
  expect(signed).toHaveBeenCalledWith("private/cards.pdf", 60, {
    download: true,
  });
});
