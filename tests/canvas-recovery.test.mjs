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
  vi.stubGlobal("window",new EventTarget());
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

it("does not acknowledge an upload without a media ID and retains the device draft",async()=>{
 canvas.toBlob=callback=>callback(new Blob(["png"]));vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:{}}),{status:200})));
 await mount();const c=root.root.findByType("canvas");await act(async()=>{c.props.onPointerDown({currentTarget:canvas,pointerId:1,clientX:1,clientY:1});c.props.onPointerUp();});await act(async()=>vi.advanceTimersByTimeAsync(1100));expect(saved).not.toHaveBeenCalled();expect(storage.has(key)).toBe(true);expect(JSON.stringify(root.toJSON())).toContain("belum dapat dipastikan");
});
it("ignores late upload callbacks after unmount without deleting the device draft",async()=>{
 let release;canvas.toBlob=callback=>callback(new Blob(["png"]));vi.stubGlobal("fetch",vi.fn(()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({data:{id:"10000000-0000-4000-8000-000000000001"}}),{status:200}));})));
 await mount();const c=root.root.findByType("canvas");await act(async()=>{c.props.onPointerDown({currentTarget:canvas,pointerId:1,clientX:1,clientY:1});c.props.onPointerUp();});await act(async()=>vi.advanceTimersByTimeAsync(1100));await act(async()=>root.unmount());dirty.mockClear();await act(async()=>release());expect(saved).not.toHaveBeenCalled();expect(dirty).not.toHaveBeenCalled();expect(storage.has(key)).toBe(true);
});
it("persists interrupted strokes on pagehide and stops drawing after lost pointer capture",async()=>{
 await mount();const c=root.root.findByType("canvas");await act(async()=>c.props.onPointerDown({currentTarget:canvas,pointerId:1,clientX:1,clientY:1}));await act(async()=>window.dispatchEvent(new Event("pagehide")));expect(storage.has(key)).toBe(true);await act(async()=>c.props.onLostPointerCapture());dirty.mockClear();await act(async()=>c.props.onPointerMove({currentTarget:canvas,pointerId:1,clientX:10,clientY:10}));expect(dirty).not.toHaveBeenCalled();
});
