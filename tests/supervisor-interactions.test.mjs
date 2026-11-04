import React, { act } from "react";
import { create } from "react-test-renderer";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("../components/ui/dialog", () => ({
  Dialog: ({ open, children }) =>
    open
      ? React.createElement("aside", { "data-dialog": true }, children)
      : null,
}));
vi.mock("../lib/client/request", async () => {
  const original = await vi.importActual("../lib/client/request");
  return { ...original, clientRequest: vi.fn() };
});
import { clientRequest, ClientRequestError } from "../lib/client/request";
import { IncidentPanel } from "../components/workflow/incidents";
const id = (n) => `07000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ticket = (n) => ({
  id: id(n),
  attempt_id: id(100 + n),
  student: "Peserta " + n,
  message: "Gangguan jaringan " + n,
  created_at: "2026-11-04T01:00:00Z",
  resolved_at: null,
  resolution: null,
  can_resolve: true,
});
let root, changed, dialogChanged, mode, tickets, calls, release;
const text = (node) => JSON.stringify(node.children);
const button = (label) =>
  root.root.findAllByType("button").find((b) => text(b).includes(label));
async function mount() {
  await act(async () => {
    root = create(
      React.createElement(IncidentPanel, {
        exam: id(90),
        rows: [],
        admin: false,
        onChanged: changed,
        onDialogChange: dialogChanged,
      }),
    );
  });
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  changed = vi.fn(async () => {});
  dialogChanged = vi.fn();
  mode = "ok";
  tickets = [ticket(1)];
  calls = [];
  clientRequest.mockImplementation(async (url, input) => {
    calls.push({ url, input });
    if (input) {
      if (mode === "hold")
        return new Promise((r) => {
          release = r;
        });
      if (mode === "uncertain")
        throw new ClientRequestError("Hasil belum pasti", true);
      return { resolved: true };
    }
    return url.includes("signals") ? [] : tickets;
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("pauses reads and coordinates parent while a help dialog is open, retains a busy dialog and blocks duplicate submits", async () => {
  await mount();
  await act(async () => button("Tangani").props.onClick());
  expect(dialogChanged).toHaveBeenLastCalledWith(true);
  const reads = calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(calls.length).toBe(reads);
  await act(async () =>
    root.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Sudah ditangani petugas" } }),
  );
  mode = "hold";
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(root.root.findByType("fieldset").props.disabled).toBe(true);
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.filter((c) => c.input)).toHaveLength(1);
  await act(async () => release({ resolved: true }));
  expect(dialogChanged).toHaveBeenLastCalledWith(false);
  expect(root.root.findAllByType("aside")).toHaveLength(0);
});
it("preserves response text and request identity after an uncertain write and explicit status check", async () => {
  await mount();
  await act(async () => button("Tangani").props.onClick());
  await act(async () =>
    root.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Sudah ditangani petugas" } }),
  );
  mode = "uncertain";
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(root.root.findByType("textarea").props.value).toBe(
    "Sudah ditangani petugas",
  );
  expect(root.root.findByType("fieldset").props.disabled).toBe(true);
  const original = calls.find((c) => c.input).input;
  await act(async () => button("Tutup dan periksa ulang").props.onClick());
  mode = "ok";
  await act(async () => button("Tangani").props.onClick());
  await act(async () =>
    root.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Sudah ditangani petugas" } }),
  );
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.filter((c) => c.input)[1].input.request_id).toBe(
    original.request_id,
  );
});
it("does not report a confirmed write as failed when parent refresh rejects", async () => {
  changed.mockRejectedValue(Error("offline"));
  await mount();
  await act(async () => button("Tangani").props.onClick());
  await act(async () =>
    root.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Sudah ditangani petugas" } }),
  );
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(JSON.stringify(root.toJSON())).toContain(
    "Tindakan tersimpan, tetapi status terbaru",
  );
  expect(root.root.findAllByType("aside")).toHaveLength(0);
});
it("paginates and filters many tickets without hiding access to resolved help", async () => {
  tickets = Array.from({ length: 31 }, (_, i) => ticket(i + 1));
  tickets.push({
    ...ticket(50),
    resolved_at: "2026-11-04T02:00:00Z",
    resolution: "Selesai",
  });
  await mount();
  expect(root.root.findAllByType("li")).toHaveLength(10);
  await act(async () => button("Bantuan berikutnya").props.onClick());
  expect(JSON.stringify(root.toJSON())).toContain("Peserta 11");
  const filter = root.root
    .findAllByType("select")
    .find((s) => s.props.value === "pending");
  await act(async () =>
    filter.props.onChange({ target: { value: "resolved" } }),
  );
  expect(root.root.findAllByType("li")).toHaveLength(1);
  expect(JSON.stringify(root.toJSON())).toContain("Peserta 50");
});

it("ignores a late help response after opening the reply dialog", async () => {
  await mount();
  let late;
  clientRequest.mockImplementation(async (url) =>
    url.includes("signals")
      ? []
      : new Promise((resolve) => {
          late = resolve;
        }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  await act(async () => button("Tangani").props.onClick());
  await act(async () => late([{ ...ticket(9), student: "LATE_MARKER" }]));
  expect(JSON.stringify(root.toJSON())).not.toContain("LATE_MARKER");
  expect(JSON.stringify(root.toJSON())).toContain("Peserta 1");
});
