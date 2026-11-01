import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { initializeReset } from "../lib/auth/reset-session";
import { homeCallback } from "../lib/auth/home-callback";
let url: URL;
const replace = vi.fn();
beforeEach(() => {
  url = new URL("https://cbt.test/auth/reset");
  replace.mockReset();
  vi.stubGlobal("window", {
    get location() {
      return {
        search: url.search,
        hash: url.hash,
        origin: url.origin,
        pathname: url.pathname,
        replace,
      };
    },
    history: {
      state: { next: true },
      replaceState: vi.fn((_state, _unused, value) => {
        url = new URL(String(value), url);
      }),
    },
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("reset initialization", () => {
  it("requires a real session for a bare reset page", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"success":true,"data":{"ready":true}}'),
    );
    expect((await initializeReset(new AbortController())).phase).toBe("ready");
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });
  it("blocks a missing session with a read-only retry path", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":"Sesi kedaluwarsa"}}', { status: 401 }),
    );
    expect(await initializeReset(new AbortController())).toMatchObject({
      phase: "blocked",
      retry: true,
    });
  });
  it("scrubs rejected fragments and never falls back to an old session", async () => {
    url.hash = "access_token=private-token&error=access_denied";
    expect((await initializeReset(new AbortController())).phase).toBe(
      "blocked",
    );
    expect(url.hash).toBe("");
    expect(url.searchParams.get("activation")).toBe("invalid");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("scrubs credentials before activation and removes the marker only after success", async () => {
    url.hash =
      "access_token=fake-access-token&refresh_token=fake-refresh-token";
    vi.mocked(fetch).mockImplementation(async () => {
      expect(url.hash).toBe("");
      expect(url.searchParams.get("activation")).toBe("pending");
      return new Response('{"success":true,"data":{"ready":true}}');
    });
    expect((await initializeReset(new AbortController())).phase).toBe("ready");
    expect(url.search).toBe("");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains a non-secret marker after uncertain activation and blocks refresh fallback", async () => {
    url.hash =
      "access_token=fake-access-token&refresh_token=fake-refresh-token";
    vi.mocked(fetch).mockRejectedValue(new Error("network"));
    expect((await initializeReset(new AbortController())).phase).toBe(
      "blocked",
    );
    expect(url.searchParams.get("activation")).toBe("pending");
    await initializeReset(new AbortController());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("hands supported email and code links to the existing confirmation route", async () => {
    for (const search of ["?code=a%2Bb", "?token_hash=hash&type=recovery"]) {
      url = new URL("https://cbt.test/auth/reset" + search);
      expect((await initializeReset(new AbortController())).phase).toBe(
        "redirecting",
      );
      expect(replace).toHaveBeenLastCalledWith("/auth/confirm" + search);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps home callback behavior and reset cleanup path local", () => {
    expect(homeCallback("", "#main-content")).toEqual({ kind: "none" });
    expect(homeCallback("?utm=school&code=", "", "/auth/reset")).toEqual({
      kind: "invalid",
      cleanHref: "/auth/reset?utm=school",
    });
  });
});
