import React, { act, useEffect } from "react";
import { create } from "react-test-renderer";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useSummary } from "../components/dashboard/use-summary";
import { pendingSchema } from "../lib/dashboard/summary";
let root;
const fetcher = vi.fn();
let state;
function Probe() {
  const result = useSummary("/api/results?state=pending&page=1", pendingSchema);
  useEffect(() => {state = result;}, [result]);
  return null;
}
const response = (data, success = true) => ({
  ok: true,
  json: async () => ({ success, data }),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    root = create(React.createElement(Probe));
  });
}
describe("dashboard read lifecycle", () => {
  it("loads zero as real data and keeps the last snapshot after refresh failure", async () => {
    fetcher.mockResolvedValueOnce(response({ total: 0 }));
    await mount();
    expect(state).toMatchObject({
      data: { total: 0 },
      loading: false,
      error: false,
    });
    fetcher.mockRejectedValueOnce(Error("internal SQL error"));
    await act(async () => state.refresh());
    expect(state).toMatchObject({
      data: { total: 0 },
      loading: false,
      error: true,
    });
    fetcher.mockResolvedValueOnce(response({ total: 7 }));
    await act(async () => state.refresh());
    expect(state).toMatchObject({ data: { total: 7 }, error: false });
  });
  it("rejects malformed or failed envelopes/counts and allows read-only recovery", async () => {
    for (const r of [
      response({ total: 7 }, false),
      response({ total: -1 }),
      {
        ok: true,
        json: async () => {
          throw Error("HTML");
        },
      },
    ]) {
      fetcher.mockResolvedValueOnce(r);
      if (!root) await mount();
      else await act(async () => state.refresh());
      expect(state.error).toBe(true);
      expect(state.data).toBe(null);
    }
  });
  it("releases a hung read at the deadline and ignores its late response", async () => {
    let resolve;
    fetcher.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await mount();
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(state).toMatchObject({ loading: false, error: true, data: null });
    fetcher.mockResolvedValueOnce(response({ total: 4 }));
    await act(async () => state.refresh());
    await act(async () => resolve(response({ total: 99 })));
    expect(state.data?.total).toBe(4);
  });
  it("aborts on unmount, clears timers and avoids duplicate refresh while pending", async () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    await mount();
    const signal = fetcher.mock.calls[0][1].signal;
    await act(async () => {
      state.refresh();
      state.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => root?.unmount());
    root = undefined;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
