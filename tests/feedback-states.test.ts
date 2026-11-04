import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthApiError,
} from "@supabase/supabase-js";
vi.mock("../lib/supabase/server", () => ({ db: vi.fn() }));
import { db } from "../lib/supabase/server";
import { GET } from "../app/api/auth/session/route";
import {
  feedbackFetch,
  FEEDBACK_REQUEST_EVENT,
} from "../lib/client/feedback-transport";
const getUser = vi.fn();
beforeEach(() => {
  getUser.mockReset();
  vi.mocked(db).mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
    ReturnType<typeof db>
  >);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("exposes only authenticated status and private no-store, never identity", async () => {
  getUser.mockResolvedValue({
    data: { user: { id: "private-id", email: "secret@example.invalid" } },
    error: null,
  });
  const r = await GET();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect((await r.json()).data).toEqual({ authenticated: true });
});
it.each([
  new AuthSessionMissingError(),
  new AuthApiError("expired", 401, "session_expired"),
  new AuthApiError("bad jwt", 400, "bad_jwt"),
])("confirms missing/invalid session %j", async (error) => {
  getUser.mockResolvedValue({ data: { user: null }, error });
  expect((await GET()).status).toBe(401);
});
it.each([
  new AuthRetryableFetchError("private network error", 503),
  new AuthApiError("rate limit", 429, "over_request_rate_limit"),
  new Error("private failure"),
])("never calls an outage session expiry %j", async (error) => {
  getUser.mockResolvedValue({ data: { user: null }, error });
  const r = await GET();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private");
});
it("rejects a missing user without exposing session data", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET()).status).toBe(401);
});
it("preserves response, POST body, signal and one-shot mutation behavior", async () => {
  const target = new EventTarget(),
    events: unknown[] = [];
  vi.stubGlobal("window", target);
  target.addEventListener(FEEDBACK_REQUEST_EVENT, (e) =>
    events.push((e as CustomEvent).detail),
  );
  const response = new Response('{"saved":true}', { status: 200 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const c = new AbortController(),
    init = { method: "POST", body: "secret-value", signal: c.signal };
  expect(await feedbackFetch("/api/test", init)).toBe(response);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/test", init);
  expect(events).toEqual([
    { id: expect.any(Number), phase: "start" },
    { id: expect.any(Number), phase: "end", status: 200 },
  ]);
  expect(JSON.stringify(events)).not.toContain("secret");
});
it("ends aborted requests and propagates the original error without retry", async () => {
  const target = new EventTarget(),
    events: unknown[] = [];
  vi.stubGlobal("window", target);
  target.addEventListener(FEEDBACK_REQUEST_EVENT, (e) =>
    events.push((e as CustomEvent).detail),
  );
  const error = new DOMException("aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(feedbackFetch("/api/test")).rejects.toBe(error);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({ phase: "end" });
});
it("optional observation cannot break a request and is safe without DOM events", async () => {
  vi.stubGlobal("window", {
    dispatchEvent: () => {
      throw Error("observer failed");
    },
  });
  const r = new Response();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
  expect(await feedbackFetch("/api/test")).toBe(r);
  vi.stubGlobal("window", {});
  expect(await feedbackFetch("/api/test")).toBe(r);
});

it("tracks a slow JSON body until parsing completes without consuming it twice", async () => {
  const { feedbackJSON } = await import("../lib/client/feedback-transport");
  const target = new EventTarget(),
    events: unknown[] = [];
  vi.stubGlobal("window", target);
  target.addEventListener(FEEDBACK_REQUEST_EVENT, (e) =>
    events.push((e as CustomEvent).detail),
  );
  let release: (v: unknown) => void = () => {};
  const json = vi.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, json }));
  const pending = feedbackJSON("/api/test");
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toHaveLength(1);
  release({ saved: true });
  expect((await pending).data).toEqual({ saved: true });
  expect(json).toHaveBeenCalledTimes(1);
  expect(events).toHaveLength(2);
});
it("cleans up JSON observations when parsing fails and never retries", async () => {
  const { feedbackJSON } = await import("../lib/client/feedback-transport");
  const target = new EventTarget(),
    events: unknown[] = [];
  vi.stubGlobal("window", target);
  target.addEventListener(FEEDBACK_REQUEST_EVENT, (e) =>
    events.push((e as CustomEvent).detail),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("bad-json", { status: 403 })),
  );
  await expect(feedbackJSON("/api/test")).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(events[1]).toMatchObject({ phase: "end", status: 403 });
});
