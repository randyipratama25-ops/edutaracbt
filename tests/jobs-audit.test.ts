import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/system/route";
import { GET as download } from "../app/api/backups/download/route";
import {
  jobsSchema,
  partsSchema,
  jobActions,
  type Job,
} from "../lib/system/jobs";
import { healthSchema } from "../lib/operational/health";
const id = "10000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000002";
const job: Job = {
  id,
  kind: "backup",
  status: "failed",
  progress: 20,
  attempts: 1,
  error: null,
  created_at: "2026-11-04T01:00:00+00:00",
  outcome: null,
};
const rpc = vi.fn(),
  sign = vi.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [job], error: null });
  sign
    .mockReset()
    .mockResolvedValue({
      data: { signedUrl: "https://files.test/part" },
      error: null,
    });
  vi.mocked(actor).mockResolvedValue({
    role: "admin",
    context: "staff",
    organization_id: org,
    client: { rpc, storage: { from: () => ({ createSignedUrl: sign }) } },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
it("rejects invalid job rows, duplicates, nulls, and unsupported statuses", () => {
  for (const rows of [
    null,
    {},
    [job, job],
    [{ ...job, progress: 101 }],
    [{ ...job, created_at: "yesterday" }],
    [{ ...job, status: "new" }],
    [{ ...job, attempts: null }],
  ])
    expect(jobsSchema.safeParse(rows).success).toBe(false);
  expect(jobsSchema.parse([{ ...job, step: 3 }])[0]).toHaveProperty("step", 3);
});
it("never offers retry/cancel/download for retained or cancelled artifacts", () => {
  for (const outcome of ["cancelled", "retention_pending", "retired"]) {
    expect(jobActions({ ...job, outcome })).toMatchObject({
      retry: false,
      cancel: false,
      download: false,
    });
  }
  expect(jobActions({ ...job, status: "succeeded" })).toMatchObject({
    download: true,
    retry: false,
    cancel: false,
  });
  expect(
    jobActions({ ...job, kind: "smtp_probe", status: "uncertain" }).reconcile,
  ).toBe(false);
  expect(
    jobActions({ ...job, kind: "reminder", status: "uncertain" }).reconcile,
  ).toBe(true);
});
it("accepts metadata part zero and rejects corrupt or duplicate part data", () => {
  const part = {
    number: 0,
    kind: "metadata",
    bytes: 10,
    sha256: "a".repeat(64),
    path: "private-path",
    metadata: { existing: true },
  };
  expect(partsSchema.parse([part])).toEqual([part]);
  for (const rows of [
    null,
    [part, part],
    [{ ...part, number: -1 }],
    [{ ...part, bytes: -1 }],
    [{ ...part, sha256: "broken" }],
  ])
    expect(partsSchema.safeParse(rows).success).toBe(false);
});
it("guards jobs/parts responses at the server boundary while preserving the RPC payload", async () => {
  const r = await GET(new Request("https://cbt.test/api/system?action=jobs"));
  expect(r.status).toBe(200);
  expect((await r.json()).data).toEqual([job]);
  expect(r.headers.get("cache-control")).toContain("no-store");
  for (const data of [null, {}, [{ ...job, progress: 200 }]]) {
    rpc.mockResolvedValueOnce({ data, error: null });
    expect(
      (await GET(new Request("https://cbt.test/api/system?action=jobs")))
        .status,
    ).toBe(503);
  }
  rpc.mockResolvedValueOnce({ data: [{ number: 0 }], error: null });
  expect(
    (
      await GET(
        new Request(`https://cbt.test/api/system?action=parts&id=${id}`),
      )
    ).status,
  ).toBe(503);
});
it.each(["teacher", "supervisor", "student"])(
  "denies %s reads and job writes before RPC",
  async (role) => {
    vi.mocked(actor).mockResolvedValue({
      role,
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect(
      (await GET(new Request("https://cbt.test/api/system?action=jobs")))
        .status,
    ).toBe(403);
    expect(
      (
        await POST(
          new Request("https://cbt.test/api/system", {
            method: "POST",
            headers: { origin: "https://cbt.test" },
            body: JSON.stringify({ action: "backup", request_id: id }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("does not acknowledge malformed or negative mutation receipts", async () => {
  rpc.mockResolvedValue({ data: { queued: false }, error: null });
  expect(
    (
      await POST(
        new Request("https://cbt.test/api/system", {
          method: "POST",
          headers: { origin: "https://cbt.test" },
          body: JSON.stringify({ action: "retry", id }),
        }),
      )
    ).status,
  ).toBe(503);
});
it("rejects incomplete operational status before rendering drills", () => {
  expect(healthSchema.safeParse({ drills: null }).success).toBe(false);
  expect(
    healthSchema.safeParse({
      observed_at: "2026-11-04T01:00:00Z",
      heartbeat_at: null,
      last_passed_drill_at: null,
      automation_enabled: false,
      worker_approved: false,
      job_issues: 0,
      stalled_jobs: 0,
      backup: null,
      drills: [],
    }).success,
  ).toBe(true);
});
it("validates download numbers and tenant prefix without signing invalid paths", async () => {
  rpc.mockResolvedValue({
    data: [{ number: 0, path: `${org}/${id}/metadata.json` }],
    error: null,
  });
  for (const part of ["", "-1", "0.5", "NaN", "9007199254740992"]) {
    expect(
      (
        await download(
          new Request(
            `https://cbt.test/api/backups/download?id=${id}&part=${part}`,
          ),
        )
      ).status,
    ).toBe(422);
  }
  expect(sign).not.toHaveBeenCalled();
  expect(
    (
      await download(
        new Request(`https://cbt.test/api/backups/download?id=${id}&part=0`),
      )
    ).status,
  ).toBe(302);
  expect(sign).toHaveBeenCalledWith(`${org}/${id}/metadata.json`, 60, {
    download: true,
  });
  sign.mockClear();
  rpc.mockResolvedValue({
    data: [{ number: 0, path: `other/${id}/metadata.json` }],
    error: null,
  });
  expect(
    (
      await download(
        new Request(`https://cbt.test/api/backups/download?id=${id}&part=0`),
      )
    ).status,
  ).toBe(422);
  expect(sign).not.toHaveBeenCalled();
});
