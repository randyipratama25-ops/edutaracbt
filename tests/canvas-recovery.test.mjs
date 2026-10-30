import React, { act } from "react";
import { create } from "react-test-renderer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EssayCanvas } from "../components/attempts/canvas";
let root, storage, dirty, saved, canvas;
const key = "edutara:canvas:v1:student:attempt:client:1:q";
const mount = async (savedId) => act(async () => {
  root = create(React.createElement(EssayCanvas, {
    writer: { attempt_id: "attempt", client_id: "client", epoch: 1 }, questionId: "q", recoveryScope: "student",
    savedId, disabled: false, onDirty: dirty, onSaved: saved,
  }), { createNodeMock: e => e.type === "canvas" ? canvas : null });
});
beforeEach(() => {
  vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.stubGlobal("React", React);
  storage = new Map(); dirty = vi.fn(); saved = vi.fn();
  vi.stubGlobal("localStorage", { get length() { return storage.size; }, key: i => [...storage.keys()][i] || null, getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) });
  const ctx = new Proxy({}, { get: (obj,k) => obj[k] || (() => {}), set: (obj,k,v) => { obj[k] = v; return true; } });
  canvas = { width: 1200, height: 800, getContext: () => ctx, toDataURL: () => "data:image/png;base64,draft", setPointerCapture() {}, getBoundingClientRect: () => ({ left:0,top:0,width:1200,height:800 }) };
  vi.stubGlobal("Image", class { set src(_v) { this.onload(); } });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("canvas recovery", () => {
  it("stores a stroke before the upload debounce and restores it as unsaved", async () => {
    await mount();
    const c = root.root.findByType("canvas");
    await act(async () => {
      c.props.onPointerDown({ currentTarget: canvas, pointerId:1,clientX:10,clientY:20 });
      c.props.onPointerUp();
    });
    expect(JSON.parse(storage.get(key)).image).toContain("data:image/png;base64,");
    await act(async () => root.unmount()); await mount();
    expect(dirty).toHaveBeenCalledWith(true);
    expect(JSON.stringify(root.toJSON())).toContain("Draf canvas dipulihkan");
    expect(saved).not.toHaveBeenCalled();
  });
  it("keeps drawing disabled if the previous server image cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status:503 })));
    await mount("previous-media");
    for (const input of root.root.findAllByType("input")) expect(input.props.disabled).toBe(true);
    expect(JSON.stringify(root.toJSON())).toContain("agar gambar lama tidak tertimpa");
  });
  it("offers an unsent canvas from a closed tab under a different writer", async () => {
    storage.set("edutara:canvas:v1:student:attempt:closed-client:1:q",JSON.stringify({image:"data:image/png;base64,previous",updatedAt:Date.now()}));
    await mount();const restore=root.root.findAllByType("button").find(b=>b.children.join("").startsWith("Pulihkan canvas"));
    expect(restore).toBeDefined();await act(async()=>restore.props.onClick());expect(dirty).toHaveBeenCalledWith(true);expect(JSON.parse(storage.get(key)).image).toContain("data:image/png;base64,");expect(saved).not.toHaveBeenCalled();
  });

});
