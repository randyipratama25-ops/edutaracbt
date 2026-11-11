import React, { act } from "react";
import { create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIntegrity } from "../components/attempts/integrity";
import { command } from "../components/attempts/queue";

vi.mock("../components/attempts/queue", () => ({
  command: vi.fn(),
  AttemptError: class extends Error {},
}));

const writer = {
  attempt_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  epoch: 1,
};
const question = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const doc = Object.assign(new EventTarget(), {
  hidden: false,
  activeElement: null,
});
const win = Object.assign(new EventTarget(), { setInterval, clearInterval });
const connection = { onLine: true };
const storage = new Map();
let root;
function Player() {
  useIntegrity(writer, true, question);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", connection);
  vi.stubGlobal("localStorage", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  doc.hidden = false;
  connection.onLine = true;
  storage.clear();
  vi.mocked(command).mockReset().mockResolvedValue({ recorded: true });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

describe("durable integrity telemetry", () => {
  it("records the start before the return and reuses its group with question context", async () => {
    await act(async () => {
      root = create(React.createElement(Player));
    });
    await act(async () => {
      doc.hidden = true;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(command).toHaveBeenCalledTimes(1);
    const start = vi.mocked(command).mock.calls[0][0];
    expect(start).toMatchObject({
      kind: "visibility_start",
      question_id: question,
    });
    await act(async () => {
      doc.hidden = false;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.mocked(command).mock.calls[1][0]).toMatchObject({
      kind: "visibility_hidden",
      group_id: start.group_id,
      question_id: question,
    });
  });

  it("restores queued events and interval after remount, then retries the same IDs", async () => {
    connection.onLine = false;
    await act(async () => {
      root = create(React.createElement(Player));
    });
    await act(async () => {
      doc.hidden = true;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(command).not.toHaveBeenCalled();
    const saved = JSON.parse([...storage.values()][0]).events;
    const start = saved.find((item) => item.kind === "visibility_start");
    expect(start).toBeTruthy();
    await act(async () => root?.unmount());
    doc.hidden = false;
    await act(async () => {
      root = create(React.createElement(Player));
    });
    vi.mocked(command).mockRejectedValueOnce(new Error("interrupted"));
    connection.onLine = true;
    await act(async () => {
      win.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      win.dispatchEvent(new Event("online"));
    });
    const payloads = vi.mocked(command).mock.calls.map(([payload]) => payload);
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads).toContainEqual(
      expect.objectContaining({
        event_id: start.event_id,
        group_id: start.group_id,
        kind: "visibility_start",
      }),
    );
    expect(payloads).toContainEqual(
      expect.objectContaining({
        group_id: start.group_id,
        kind: "visibility_hidden",
      }),
    );
    expect(storage.size).toBe(0);
  });
});
