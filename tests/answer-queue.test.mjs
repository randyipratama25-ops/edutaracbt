import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, useEffect } from "react";
import { create } from "react-test-renderer";
import { useAnswerQueue } from "../components/attempts/queue";
const writer = { attempt_id: "a", client_id: "c", epoch: 1 };
const response = (data) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
let queue, root;
let terminalCallback = () => {};
function Harness() {
  const value = useAnswerQueue(writer, [], terminalCallback);
  useEffect(() => {
    queue = value;
  });
  return null;
}
beforeEach(async () => {
  vi.useFakeTimers();
  terminalCallback = vi.fn();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  await act(async () => {
    root = create(createElement(Harness));
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("versioned autosave queue under network faults", () => {
  it("keeps a newer local edit while acknowledging an older in-flight value", async () => {
    let release;
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const data = JSON.parse(init.body);
        calls.push(data);
        if (calls.length === 1)
          return new Promise((resolve) => {
            release = () =>
              resolve(
                response({
                  acknowledgements: [
                    { question_id: "q", saved: true, revision: 1 },
                  ],
                }),
              );
          });
        return response({
          acknowledgements: [{ question_id: "q", saved: true, revision: 2 }],
        });
      }),
    );
    await act(async () => queue.change("q", ["A"]));
    await act(async () => vi.advanceTimersByTimeAsync(900));
    await act(async () => queue.change("q", ["B"]));
    await act(async () => release());
    expect(queue.pendingCount).toBe(1);
    expect(queue.values.q).toEqual(["B"]);
    await act(async () => vi.advanceTimersByTimeAsync(900));
    expect(calls[1].answers[0].expected_revision).toBe(1);
    expect(calls[1].answers[0].value).toEqual(["B"]);
    expect(queue.pendingCount).toBe(0);
  });
  it("retries a lost response using the identical request ID and payload", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u, init) => {
        calls.push(JSON.parse(init.body));
        if (calls.length === 1) throw TypeError("Network response lost");
        return response({
          acknowledgements: [{ question_id: "q", saved: true, revision: 1 }],
        });
      }),
    );
    await act(async () => queue.change("q", ["A"]));
    await act(async () => vi.advanceTimersByTimeAsync(1800));
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(queue.pendingCount).toBe(0);
  });
  it("never reports saved after exhausting bounded retries", async () => {
    const send = vi.fn(async () => {
      throw TypeError("Offline");
    });
    vi.stubGlobal("fetch", send);
    await act(async () => queue.change("q", ["A"]));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(send).toHaveBeenCalledTimes(3);
    expect(queue.pendingCount).toBe(1);
    expect(queue.status).toContain("belum diakui server");
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("requires explicit conflict resolution rather than overwriting the server", async () => {
    const send = vi.fn(async () =>
      response({
        acknowledgements: [
          {
            question_id: "q",
            saved: false,
            error: "CONFLICT",
            revision: 4,
            value: ["B"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", send);
    await act(async () => queue.change("q", ["A"]));
    await act(async () => vi.advanceTimersByTimeAsync(900));
    expect(queue.conflicts.q.revision).toBe(4);
    expect(queue.values.q).toEqual(["A"]);
    expect(queue.pendingCount).toBe(1);
    await act(async () => queue.resolve("q", false));
    expect(queue.values.q).toEqual(["B"]);
    expect(queue.pendingCount).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("stops retrying unsaved edits when the server returns a terminal attempt", async () => {
    const send = vi.fn(async () =>
      response({ id: "a", status: "time_expired", finalized_at: "now" }),
    );
    vi.stubGlobal("fetch", send);
    await act(async () => queue.change("q", ["A"]));
    await act(async () => vi.advanceTimersByTimeAsync(900));
    expect(terminalCallback).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
