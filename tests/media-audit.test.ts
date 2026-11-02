import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/media/manage/route";
import {
  GET as signedGET,
  POST as uploadPOST,
} from "../app/api/authoring/media/route";
import { POST as drivePOST } from "../app/api/media/drive/route";
import { storeMedia } from "../lib/operations/media";
import {
  mediaListSchema,
  mediaWriteSchema,
  fileProblem,
  driveListSchema,
} from "../lib/operations/media-contracts";
const id = "08000000-0000-4000-8000-000000000001",
  path = id + "/media";
const req = (
  value: unknown,
  url = "/api/media/manage",
  origin = "https://cbt.test",
) =>
  new Request("https://cbt.test" + url, {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(value),
  });
let rpc: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>,
  response: { data: unknown; error: { code?: string; message: string } | null };
beforeEach(() => {
  vi.unstubAllEnvs();
  response = { data: { path, cleanup_id: id }, error: null };
  rpc = vi.fn(async () => response);
  remove = vi.fn(async () => ({ data: [], error: null }));
  vi.mocked(actor).mockResolvedValue({
    id,
    organization_id: id,
    role: "admin",
    context: "staff",
    client: { rpc, storage: { from: () => ({ remove }) } },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
describe("media audit", () => {
  it("rejects malformed lists and false deletion receipts", () => {
    expect(mediaListSchema.safeParse({ rows: null, total: 0 }).success).toBe(
      false,
    );
    expect(
      mediaWriteSchema.safeParse({
        deleted: false,
        cleanup_pending: false,
        message: "x",
      }).success,
    ).toBe(false);
    expect(
      driveListSchema.safeParse({
        files: [],
        folder: "folder",
        next_page_token: null,
      }).success,
    ).toBe(false);
  });
  it("validates supported file type, empty files and the 5MiB boundary before upload", () => {
    expect(fileProblem({ type: "image/png", size: 5242880 })).toBe("");
    expect(fileProblem({ type: "image/svg+xml", size: 20 })).toContain("Tipe");
    expect(fileProblem({ type: "image/png", size: 0 })).toContain("kosong");
    expect(fileProblem({ type: "image/png", size: 5242881 })).toContain(
      "5 MiB",
    );
  });
  it("validates pagination and MIME before calling the RPC", async () => {
    for (const page of ["NaN", "1.5", "0", "100001"])
      expect(
        (
          await GET(
            new Request("https://cbt.test/api/media/manage?page=" + page),
          )
        ).status,
      ).toBe(422);
    expect(
      (await GET(new Request("https://cbt.test/api/media/manage?mime=video/")))
        .status,
    ).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves search/filters in the existing RPC contract", async () => {
    response.data = { rows: [], total: 0 };
    expect(
      (
        await GET(
          new Request(
            "https://cbt.test/api/media/manage?page=2&mime=image%2F&search=abc",
          ),
        )
      ).status,
    ).toBe(200);
    expect(rpc.mock.calls[0][1].input).toMatchObject({
      action: "list",
      page: 2,
      mime: "image/",
      search: "abc",
    });
  });
  it("denies anonymous/non-staff deletion and cross-origin writes", async () => {
    vi.mocked(actor).mockResolvedValue(null);
    expect((await POST(req({ action: "delete", id }))).status).toBe(403);
    expect(
      (
        await POST(
          req({ action: "delete", id }, undefined, "https://other.test"),
        )
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("stops before Storage when the deletion receipt is missing or malformed", async () => {
    for (const data of [null, {}, { path }]) {
      response.data = data;
      expect((await POST(req({ action: "delete", id }))).status).toBe(503);
    }
    expect(remove).not.toHaveBeenCalled();
  });
  it("keeps cleanup pending when Storage fails or throws after the database deletion", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    let r = await POST(req({ action: "delete", id }));
    expect((await r.json()).data.cleanup_pending).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    remove.mockRejectedValue(Error("lost response"));
    r = await POST(req({ action: "delete", id }));
    expect((await r.json()).data.cleanup_pending).toBe(true);
  });
  it("does not mark cleanup complete when acknowledgement fails or has the wrong path", async () => {
    rpc.mockImplementation(async (_n, args) =>
      args.input.action === "cleanup_done"
        ? { data: { path: "other" }, error: null }
        : response,
    );
    expect(
      (await (await POST(req({ action: "delete", id }))).json()).data
        .cleanup_pending,
    ).toBe(true);
  });
  it("completes cleanup only with a valid matching receipt", async () => {
    const r = await POST(req({ action: "cleanup", id }));
    expect((await r.json()).data).toMatchObject({
      deleted: true,
      cleanup_pending: false,
    });
    expect(rpc.mock.calls[1][1].input).toEqual({ action: "cleanup_done", id });
  });
  it("conceals SQL details and preserves referenced-media business errors", async () => {
    response.error = { code: "42501", message: "PRIVATE_SQL" };
    const r = await POST(req({ action: "delete", id }));
    expect(await r.text()).not.toContain("PRIVATE_SQL");
    response.error = { code: "P0001", message: "Media masih dipakai soal" };
    expect((await POST(req({ action: "delete", id }))).status).toBe(422);
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects invalid signed-media IDs before querying storage", async () => {
    expect(
      (
        await signedGET(
          new Request("https://cbt.test/api/authoring/media?id=invalid"),
        )
      ).status,
    ).toBe(422);
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects oversized and malformed multipart bodies explicitly", async () => {
    const huge = new Request("https://cbt.test/api/authoring/media", {
      method: "POST",
      headers: { origin: "https://cbt.test", "content-length": "5300001" },
      body: "x",
    });
    expect((await uploadPOST(huge)).status).toBe(413);
    const bad = new Request("https://cbt.test/api/authoring/media", {
      method: "POST",
      headers: { origin: "https://cbt.test", "content-type": "text/plain" },
      body: "bad",
    });
    expect((await uploadPOST(bad)).status).toBe(400);
  });
  it("keeps Drive import Admin-only and reports unavailable configuration", async () => {
    vi.mocked(actor).mockResolvedValue({
      role: "teacher",
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect(
      (await drivePOST(req({ action: "list" }, "/api/media/drive"))).status,
    ).toBe(403);
  });
});
describe("media upload compensation", () => {
  const bytes = new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...Array(16).fill(0),
  ]);
  function client(
    error: { code?: string; message: string } | null,
    data: unknown = { id },
  ) {
    const remove = vi.fn(async () => ({ error: null })),
      upload = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(
        async () => ({ error: null }),
      );
    const client = {
      storage: { from: () => ({ remove, upload }) },
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data, error }) }),
        }),
      }),
    };
    return {
      client: client as unknown as Parameters<typeof storeMedia>[0],
      remove,
      upload,
    };
  }
  it("preserves uploaded bytes after an uncertain database INSERT", async () => {
    const c = client({ code: "08006", message: "response lost" });
    await expect(
      storeMedia(c.client, { id, organization_id: id }, bytes, "image/png"),
    ).rejects.toMatchObject({ status: 503 });
    expect(c.remove).not.toHaveBeenCalled();
  });
  it("compensates only a definitive database rejection", async () => {
    const c = client({ code: "23514", message: "constraint" });
    await expect(
      storeMedia(c.client, { id, organization_id: id }, bytes, "image/png"),
    ).rejects.toMatchObject({ status: 422 });
    expect(c.remove).toHaveBeenCalledOnce();
  });
  it("does not report a missing upload receipt as success or remove its bytes", async () => {
    const c = client(null, null);
    await expect(
      storeMedia(c.client, { id, organization_id: id }, bytes, "image/png"),
    ).rejects.toMatchObject({ status: 503 });
    expect(c.remove).not.toHaveBeenCalled();
  });
  it("preserves a valid successful receipt and immutable non-upsert storage", async () => {
    const c = client(null);
    expect(
      await storeMedia(
        c.client,
        { id, organization_id: id },
        bytes,
        "image/png",
      ),
    ).toEqual({ id });
    expect(c.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
    expect(c.remove).not.toHaveBeenCalled();
  });
});
