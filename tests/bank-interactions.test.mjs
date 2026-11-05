import React, { act } from "react";
import { create } from "react-test-renderer";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, ...props }) =>
    React.createElement("a", props, children),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => React.createElement("div", null, "Pratinjau"),
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
import { BankPanel } from "../components/bank/panel";
import { questionSchema } from "../lib/authoring/schema";
import { templates } from "../lib/authoring/imports";
const id = (n) => `09000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = questionSchema.parse(templates.PG),
  meta = {
    subject_id: id(90),
    class_ids: [id(91)],
    topic: "Materi",
    indicator: "Indikator",
    difficulty: "medium",
    cognitive: "C2",
  };
const row = {
  id: id(1),
  metadata: meta,
  state: "draft",
  version: 2,
  owner_id: id(92),
  payload,
  can_edit: true,
  can_review: true,
};
const detail = {
  item: row,
  versions: [
    { version: 2, payload, reason: "Terbaru" },
    { version: 1, payload, reason: "Lama" },
  ],
  reviews: [],
  similar: 0,
  usage: [],
};
let root, calls, mode, release;
const text = (n) =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const button = (label) =>
  root.root.findAllByType("button").find((b) => text(b) === label);
const dialog = () => root.root.findByType("aside");
const field = (label) =>
  dialog()
    .findAllByType("label")
    .find((l) => text(l).startsWith(label))
    .findAll((n) => ["input", "select", "textarea"].includes(n.type))[0];
const set = async (label, value) =>
  act(async () => field(label).props.onChange({ target: { value } }));
async function mount() {
  await act(async () => {
    root = create(React.createElement(BankPanel));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  calls = [];
  mode = "ok";
  clientRequest.mockImplementation(async (url, input) => {
    calls.push({ url, input });
    if (!input) {
      if (url === "/api/authoring")
        return {
          classes: [{ id: id(91), name: "Kelas" }],
          subjects: [{ id: id(90), name: "IPS" }],
          exams: [],
          examClasses: [],
        };
      if (url.includes("action=detail")) {
        if (mode === "holdDetail") return new Promise((r) => (release = r));
        return detail;
      }
      return { rows: [row], total: 1 };
    }
    if (mode === "uncertain")
      throw new ClientRequestError("Hasil belum pasti", true);
    if (mode === "hold") return new Promise((r) => (release = r));
    return input.action === "review"
      ? { saved: true }
      : input.action === "import"
        ? [{ row: 1, saved: true, id: id(2) }]
        : { id: id(1) };
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("opens detail immediately and ignores a late response after closing it", async () => {
  await mount();
  mode = "holdDetail";
  await act(async () => button("Detail & review").props.onClick());
  expect(text(dialog())).toContain("Memuat versi");
  const late = release;
  await act(async () => dialog().parent.findAllByType("button"));
  await act(async () =>
    root.root
      .findAll((n) => n.props.title === "Versi, review dan kualitas")[0]
      .props.onOpenChange(false),
  );
  mode = "ok";
  await act(async () => button("Tambah soal bank").props.onClick());
  await act(async () => late({ ...detail, similar: 999 }));
  expect(text(dialog())).not.toContain("999");
  expect(field("Catatan versi")).toBeDefined();
});
it("does not review the latest version while the user is viewing an older one", async () => {
  await mount();
  await act(async () => button("Detail & review").props.onClick());
  await set("Versi", "1");
  await set("Catatan review", "Catatan peninjauan");
  expect(button("Simpan keputusan review").props.disabled).toBe(true);
  await act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.filter((c) => c.input)).toHaveLength(0);
  await set("Versi", "2");
  await act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.find((c) => c.input).input.expected_version).toBe(2);
});
it("freezes editing and preserves the same payload/request_id across an uncertain retry", async () => {
  await mount();
  await act(async () => button("Ubah").props.onClick());
  await set("Catatan versi", "Catatan perubahan");
  mode = "uncertain";
  await act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  const first = calls.find((c) => c.input).input;
  expect(dialog().findAllByType("fieldset")[0].props.disabled).toBe(true);
  expect(field("Catatan versi").props.value).toBe("Catatan perubahan");
  await act(async () => button("Tutup sementara").props.onClick());
  await act(async () => button("Kembali ke tindakan tertunda").props.onClick());
  mode = "ok";
  await act(async () => button("Periksa / ulangi tindakan").props.onClick());
  expect(calls.filter((c) => c.input)[1].input).toEqual(first);
  expect(root.root.findAllByType("aside")).toHaveLength(0);
});
it("uses a synchronous mutation lock against duplicate form submissions", async () => {
  await mount();
  await act(async () => button("Ubah").props.onClick());
  await set("Catatan versi", "Catatan perubahan");
  mode = "hold";
  await act(async () => {
    void dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} });
  });
  await act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  expect(calls.filter((c) => c.input)).toHaveLength(1);
  await act(async () => release({ id: id(1) }));
});
it("maps import result rows back to original blocks after skipping invalid questions", async () => {
  await mount();
  await act(async () => button("Impor / ambil dari ujian").props.onClick());
  await set("Mata pelajaran", id(90));
  await set("Materi", "Materi");
  await set("Indikator", "Indikator");
  await act(async () =>
    dialog()
      .findAllByType("input")
      .find((i) => i.props.type === "checkbox")
      .props.onChange({ target: { checked: true } }),
  );
  await set("Data JSON", JSON.stringify([{ bad: true }, payload]));
  await act(async () => button("Pratinjau impor bank").props.onClick());
  await set("Catatan impor", "Catatan impor");
  await act(async () =>
    dialog()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  expect(text(dialog())).toContain("Baris 2: Berhasil");
});
it("ignores obsolete metadata after Strict Mode cleanup without disabling the new editor", async () => {
  const pending = [];
  clientRequest.mockImplementation(async (url) =>
    url === "/api/authoring"
      ? new Promise((resolve, reject) => pending.push({ resolve, reject }))
      : { rows: [row], total: 1 },
  );
  await act(async () => {
    root = create(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(BankPanel),
      ),
    );
  });
  expect(pending).toHaveLength(2);
  await act(async () =>
    pending[1].resolve({
      classes: [{ id: id(91), name: "Kelas" }],
      subjects: [{ id: id(90), name: "IPS" }],
      exams: [],
      examClasses: [],
    }),
  );
  await act(async () => pending[0].reject(Error("STALE_META_ERROR")));
  expect(text(root.root)).not.toContain("STALE_META_ERROR");
  expect(button("Tambah soal bank").props.disabled).toBe(false);
});
it("does not open an editor with unavailable category metadata", async () => {
  clientRequest.mockImplementation(async (url) => {
    if (url === "/api/authoring") throw Error("Kategori belum tersedia");
    return { rows: [row], total: 1 };
  });
  await mount();
  expect(button("Ubah").props.disabled).toBe(true);
  expect(button("Tambah soal bank").props.disabled).toBe(true);
  await act(async () => button("Ubah").props.onClick());
  expect(root.root.findAllByType("aside")).toHaveLength(0);
});
it("allows removing an inactive class from an existing item without offering it to new items", async () => {
  clientRequest.mockImplementation(async (url) =>
    url === "/api/authoring"
      ? {
          classes: [
            { id: id(91), name: "Kelas lama", active: false },
            { id: id(93), name: "Kelas aktif", active: true },
          ],
          subjects: [{ id: id(90), name: "IPS", active: true }],
          exams: [],
          examClasses: [],
        }
      : { rows: [row], total: 1 },
  );
  await mount();
  await act(async () => button("Ubah").props.onClick());
  expect(text(dialog())).toContain("Kelas lama (nonaktif)");
  const check = dialog()
    .findAllByType("input")
    .find((i) => i.props.type === "checkbox" && i.props.checked);
  await act(async () => check.props.onChange({ target: { checked: false } }));
  expect(text(dialog())).not.toContain("Kelas lama");
});
