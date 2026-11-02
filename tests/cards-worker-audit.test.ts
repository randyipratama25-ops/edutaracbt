import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../lib/reports/render", () => ({
  reportStyles: vi.fn(async () => ""),
  renderPDF: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
import { renderPDF, reportStyles } from "../lib/reports/render";
import { processCards } from "../lib/operations/cards";
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
const id = "08000000-0000-4000-8000-000000000001";
const snapshot = {
  settings: {
    school: "MTs",
    address: "",
    official: "",
    official_title: "",
    logo_media_id: null,
  },
  exam: {
    id,
    title: "Ujian",
    starts_at: "2026-11-02T00:00:00Z",
    ends_at: "2026-11-02T02:00:00Z",
  },
  students: [
    { id, name: "Peserta", username: "siswa", room: null },
    {
      id: "08000000-0000-4000-8000-000000000002",
      name: "Peserta2",
      username: "siswa2",
      room: null,
    },
  ],
};
const claim = {
  lease: id,
  requested_by: id,
  format: "zip",
  template: "compact",
  snapshot,
};
let rpc: ReturnType<typeof vi.fn>,
  upload: ReturnType<typeof vi.fn>,
  client: SupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderPDF).mockResolvedValue(new Uint8Array([1, 2, 3]));
  rpc = vi.fn(async () => ({ data: { saved: true }, error: null }));
  upload = vi.fn(async () => ({ error: null }));
  client = {
    rpc,
    storage: { from: () => ({ upload }) },
  } as unknown as SupabaseClient;
});
it("records invalid snapshots using the acquired lease", async () => {
  await processCards(client, id, "https://cbt.test/login", {
    ...claim,
    snapshot: null,
  });
  expect(rpc).toHaveBeenCalledWith("card_command", {
    input: expect.objectContaining({ action: "fail", lease: id }),
  });
  expect(upload).not.toHaveBeenCalled();
});
it("uses acquired claim without claiming again and shares CSS across ZIP PDFs", async () => {
  await processCards(client, id, "https://cbt.test/login", claim);
  expect(rpc.mock.calls.some((x) => x[1].input.action === "claim")).toBe(false);
  expect(reportStyles).toHaveBeenCalledTimes(1);
  const zip = await JSZip.loadAsync(upload.mock.calls[0][1]);
  expect(Object.keys(zip.files)).toHaveLength(2);
  expect(rpc).toHaveBeenLastCalledWith("card_command", {
    input: expect.objectContaining({ action: "finish", lease: id }),
  });
});
it("bounds uncompressed ZIP bytes before upload", async () => {
  vi.mocked(renderPDF).mockResolvedValue(new Uint8Array(27 * 1024 * 1024));
  await processCards(client, id, "https://cbt.test/login", claim);
  expect(upload).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenLastCalledWith("card_command", {
    input: expect.objectContaining({
      action: "fail",
      message: expect.stringContaining("50 MiB"),
    }),
  });
});
it("stops scheduling PDFs after the batch time budget", async () => {
  const now = vi
    .spyOn(Date, "now")
    .mockReturnValueOnce(0)
    .mockReturnValue(180001);
  await processCards(client, id, "https://cbt.test/login", claim);
  now.mockRestore();
  expect(renderPDF).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
