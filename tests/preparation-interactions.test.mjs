import React, { act, StrictMode } from "react";
import { create } from "react-test-renderer";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, ...props }) =>
    React.createElement("a", props, children),
}));
vi.mock("../components/ui/dialog", () => ({
  Dialog: ({ open, children }) =>
    open ? React.createElement("aside", null, children) : null,
}));
vi.mock("../lib/client/request", async () => ({
  ...(await vi.importActual("../lib/client/request")),
  clientRequest: vi.fn(),
}));
import { clientRequest, ClientRequestError } from "../lib/client/request";
import { PreparationPanel } from "../components/workflow/preparation";
const id = (n) => `08000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exam = (n) => ({
  id: id(n),
  title: "Ujian " + n,
  status: "draft",
  lifecycle: "Draf",
  starts_at: "2031-01-10T01:00:00Z",
  ends_at: "2031-01-10T02:00:00Z",
  duration_minutes: 60,
  ready: true,
  participants: 20,
  unconfirmed: 0,
  question_count: 1,
  checks: [
    {
      code: "questions",
      label: "Soal",
      ok: true,
      blocking: true,
      detail: "Lengkap",
      href: "/dashboard/exams?exam=" + id(n),
    },
  ],
});
let root, calls, mode, readFail, created, list, release;
const buttons = () => root.root.findAllByType("button");
const text = (n) =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const btn = (t) => buttons().find((b) => text(b).includes(t));
const dialog = () => root.root.findByType("aside");
const change = async (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
const submit = async () =>
  act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
const step = () => dialog().findByType("h3").children.join("");
async function mount(wrapper = PreparationPanel) {
  await act(async () => {
    root = create(React.createElement(wrapper));
  });
}
async function schedule() {
  await act(async () => btn("Buat ujian terpandu").props.onClick());
  await change(dialog().findAllByType("input")[0], "Ujian baru");
  await change(dialog().findByType("select"), id(80));
  await submit();
  await act(async () =>
    dialog()
      .findByType("input")
      .props.onChange({ target: { checked: true } }),
  );
  await submit();
  const inputs = dialog().findAllByType("input");
  await change(inputs[0], "2031-01-10T08:00");
  await change(inputs[1], "2031-01-10T09:00");
  await change(inputs[3], "1234");
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("location", { search: "" });
  calls = [];
  mode = "ok";
  readFail = false;
  created = false;
  list = [];
  clientRequest.mockImplementation(async (url, input) => {
    calls.push({ url, input });
    if (!input) {
      if (url.includes("authoring"))
        return {
          canManage: true,
          classes: [{ id: id(70), name: "Kelas 7", active: true }],
          subjects: [{ id: id(80), name: "IPS", active: true }],
        };
      if (readFail) throw new ClientRequestError("Kesiapan gagal dimuat");
      return {
        exams: created ? [exam(1)] : list,
        admin: true,
        server_now: "2026-11-04T00:00:00Z",
      };
    }
    if (mode === "hold")
      return new Promise((r) => {
        release = r;
      });
    if (mode === "uncertain")
      throw new ClientRequestError("Hasil belum pasti", true);
    if (input.action === "exam") {
      created = true;
      return { id: id(1) };
    }
    list = list.map((e) =>
      e.id === input.exam_id ? { ...e, status: "scheduled" } : e,
    );
    return { published: true, id: input.exam_id };
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("locks metadata opening synchronously against double clicks", async () => {
  await mount();
  let resolve;
  clientRequest.mockImplementation(
    async () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () => {
    btn("Buat ujian terpandu").props.onClick();
    btn("Buat ujian terpandu").props.onClick();
  });
  expect(calls.filter((c) => c.url.includes("authoring"))).toHaveLength(0);
  expect(
    clientRequest.mock.calls.filter((c) => c[0].includes("authoring")),
  ).toHaveLength(1);
  await act(async () =>
    resolve({ canManage: true, classes: [], subjects: [] }),
  );
  expect(step()).toBe("Identitas");
});
it("preserves the exact draft payload and request_id after uncertain close/reopen and retries in WIB", async () => {
  await mount();
  await schedule();
  mode = "uncertain";
  await submit();
  const original = calls.find((c) => c.input).input;
  expect(original.exam.starts_at).toBe("2031-01-10T01:00:00.000Z");
  expect(dialog().findAllByType("fieldset")[0].props.disabled).toBe(true);
  await act(async () => btn("Tutup wizard").props.onClick());
  expect(root.root.findAllByType("aside")).toHaveLength(0);
  await act(async () => btn("Periksa tindakan tertunda").props.onClick());
  mode = "ok";
  await act(async () => btn("Periksa / ulangi penyimpanan").props.onClick());
  expect(calls.filter((c) => c.input)[1].input).toEqual(original);
  expect(step()).toBe("Soal");
});
it("blocks duration longer than schedule before sending any draft write", async () => {
  await mount();
  await schedule();
  await change(dialog().findAllByType("input")[2], "120");
  await submit();
  expect(calls.filter((c) => c.input)).toHaveLength(0);
  expect(step()).toBe("Jadwal");
  expect(JSON.stringify(root.toJSON())).toContain("Durasi ujian harus muat");
});
it("does not advance a read-only step or show false zero questions when readiness refresh fails", async () => {
  await mount();
  await schedule();
  await submit();
  expect(step()).toBe("Soal");
  readFail = true;
  await submit();
  expect(step()).toBe("Soal");
  expect(JSON.stringify(root.toJSON())).toContain(
    "Kesiapan belum dapat dipastikan",
  );
  readFail = false;
  await submit();
  expect(step()).toBe("Aturan");
});
it("keeps a pending draft dialog open during writes and blocks a duplicate form submit", async () => {
  await mount();
  await schedule();
  mode = "hold";
  await submit();
  await act(async () => btn("Tutup wizard").props.onClick());
  expect(root.root.findAllByType("aside")).toHaveLength(1);
  await submit();
  expect(calls.filter((c) => c.input)).toHaveLength(1);
  created = true;
  await act(async () => release({ id: id(1) }));
  expect(step()).toBe("Soal");
});
it("binds publication retries to the exam and disables changing the target while uncertain", async () => {
  list = [exam(1), exam(2)];
  await mount();
  const select = root.root.findByType("select");
  await change(select, id(2));
  const confirmation = root.root.findByType("input");
  await change(confirmation, "PUBLIKASIKAN");
  mode = "uncertain";
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  const first = calls.find((c) => c.input).input;
  expect(first.exam_id).toBe(id(2));
  expect(root.root.findByType("select").props.disabled).toBe(true);
  mode = "ok";
  await act(async () => btn("Periksa / ulangi publikasi").props.onClick());
  expect(calls.filter((c) => c.input)[1].input).toEqual(first);
  await change(root.root.findByType("select"), id(1));
  await change(root.root.findByType("input"), "PUBLIKASIKAN");
  await act(async () =>
    root.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.filter((c) => c.input)[2].input.request_id).not.toBe(
    first.request_id,
  );
});
it("can load after Strict Mode effect cleanup instead of retaining an aborted flight", async () => {
  await act(async () => {
    root = create(
      React.createElement(
        StrictMode,
        null,
        React.createElement(PreparationPanel),
      ),
    );
  });
  expect(btn("Buat ujian terpandu")).toBeDefined();
  expect(
    calls.filter((c) => c.url === "/api/workflow").length,
  ).toBeGreaterThanOrEqual(2);
});
