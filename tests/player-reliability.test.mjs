import React, { act } from "react";
import { create } from "react-test-renderer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/auth/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../components/attempts/integrity", () => ({ useIntegrity: () => "" }));
vi.mock("../components/ui/dialog", () => ({ Dialog: ({ open, children }) => open ? React.createElement("section", null, children) : null }));
import { ExamPlayer } from "../components/attempts/player";
let root, onUpdate, storage;
const attempt = {
  id: "attempt", exam_id: "exam", title: "Ujian uji", status: "in_progress",
  deadline_at: new Date(Date.now() + 600000).toISOString(), server_now: new Date().toISOString(),
  epoch: 1, finalized_at: null, grading_pending: 0, score: null, result_visible: false, review_reason: null,
  questions: [{ id: "q", position: 1, version: 1, payload: { type: "PG", stem: "Question", options: [{ id: "A", text: "A" }] } }], answers: [],
};
const response = data => new Response(JSON.stringify({ data }), { status: 200 });
const buttons = () => root.root.findAllByType("button");
const button = label => buttons().find(b => b.children.join("") === label);
const mount = async (a = attempt) => act(async () => { root = create(React.createElement(ExamPlayer, {
  attempt: a, studentId: "student", clientId: "client", onUpdate, onReload: vi.fn(),
})); });
beforeEach(() => {
  vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true; onUpdate = vi.fn();
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {} });
  storage = new Map();
  vi.stubGlobal("localStorage", { get length() { return storage.size; }, key: i => [...storage.keys()][i] || null, getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("student submission fault flow", () => {
  it("flushes answers before submit, locks edits after a lost response, and retries the same request", async () => {
    const calls = []; let submits = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const input = JSON.parse(init.body); calls.push(input);
      if (input.action === "save") return response({ acknowledgements: [{ question_id: "q", saved: true, revision: 1 }] });
      if (input.action === "submit") {
        if (++submits === 1) throw TypeError("response lost");
        return response({ ...attempt, status: "submitted", finalized_at: "2026-10-30T00:00:00Z" });
      }
      return response(attempt);
    }));
    await mount();
    await act(async () => root.root.findByType("input").props.onChange());
    await act(async () => button("Akhiri ujian").props.onClick());
    await act(async () => button("Ya, akhiri ujian").props.onClick());
    expect(calls.map(c => c.action)).toEqual(["save", "submit"]);
    expect(root.root.findByType("fieldset").props.disabled).toBe(true);
    await act(async () => button("Periksa / ulangi pengumpulan").props.onClick());
    const submitted = calls.filter(c => c.action === "submit");
    expect(submitted[1]).toEqual(submitted[0]);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "submitted" }));
  });
  it("does not submit when pending answers cannot be acknowledged", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const input = JSON.parse(init.body); calls.push(input);
      return response({ acknowledgements: [{ question_id: "q", saved: false, revision: 2, value: ["B"] }] });
    }));
    await mount();
    await act(async () => root.root.findByType("input").props.onChange());
    await act(async () => button("Akhiri ujian").props.onClick());
    await act(async () => button("Ya, akhiri ujian").props.onClick());
    expect(calls.some(c => c.action === "submit")).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it("shows receipt only after a server-confirmed completed attempt", async () => {
    await mount({ ...attempt, status: "submitted", finalized_at: "2026-10-30T00:00:00Z", questions: [] });
    expect(JSON.stringify(root.toJSON())).toContain("EDU-attempt");
    expect(button("Unduh bukti pengumpulan")).toBeDefined();
  });
  it("offers a closed-tab draft without overwriting before selection", async () => {
    storage.set("edutara:draft:v1:student:attempt:old-tab",JSON.stringify({version:1,epoch:1,updatedAt:Date.now(),rows:{q:{revision:0,value:["A"]}}}));
    await mount();expect(root.root.findByType("input").props.checked).toBe(false);
    await act(async () => button("Pulihkan draf ini").props.onClick());expect(root.root.findByType("input").props.checked).toBe(true);
  });
  it("requires revision resolution after choosing a server draft from an old writer", async () => {
    await mount({...attempt,answers:[{question_id:"q",revision:2,value:[]}],recovery:{drafts:[{question_id:"q",client_id:"old-device",epoch:1,revision:0,value:["A"],updated_at:new Date().toISOString()}],canvases:[]}});
    expect(root.root.findByType("input").props.checked).toBe(false);
    await act(async () => button("Pulihkan draf ini").props.onClick());
    expect(root.root.findByType("input").props.checked).toBe(true);expect(button("Gunakan versi server")).toBeDefined();
  });
  it("confirms transfer readiness only after pending answers are acknowledged", async () => {
    const calls=[];vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{const input=JSON.parse(init.body);calls.push(input);return response({acknowledgements:[{question_id:"q",saved:true,revision:1}]});}));
    await mount();await act(async()=>root.root.findByType("input").props.onChange());
    await act(async()=>button("Pindah perangkat").props.onClick());await act(async()=>button("Simpan dan periksa kesiapan").props.onClick());
    expect(calls[0].action).toBe("save");expect(JSON.stringify(root.toJSON())).toContain("Jawaban saat persiapan sudah diakui server");
  });

});
