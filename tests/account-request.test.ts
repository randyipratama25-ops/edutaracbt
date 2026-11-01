import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  accountRequest,
  loginDestination,
  recoveryAcceptedMessage,
} from "../lib/auth/account-request";
const request = () =>
  accountRequest(
    "login",
    { username: "guru_1", password: " unchanged " },
    new AbortController(),
  );
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("account request transport", () => {
  it("uses one POST and preserves password bytes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { next: "/dashboard" } }),
      ),
    );
    expect(await request()).toEqual({ next: "/dashboard" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).password,
    ).toBe(" unchanged ");
  });
  it("rejects malformed envelopes and non-JSON responses safely", async () => {
    for (const body of [
      "<html>broken</html>",
      "null",
      '{"success":true,"data":null}',
      '{"success":true,"data":[]}',
    ]) {
      vi.mocked(fetch).mockResolvedValue(new Response(body));
      await expect(request()).rejects.toThrow("belum dapat dipastikan");
    }
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":{}}}', { status: 503 }),
    );
    await expect(request()).rejects.toThrow("Layanan akun");
  });
  it("preserves actionable rate-limit messages", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":"Coba lagi dalam 15 menit."}}', {
        status: 429,
      }),
    );
    await expect(request()).rejects.toThrow("15 menit");
  });
  it("aborts stalled recovery after 35 seconds without retry", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_u, o) =>
        new Promise((_r, reject) =>
          o!.signal!.addEventListener("abort", () =>
            reject(new DOMException("Abort", "AbortError")),
          ),
        ),
    );
    const pending = accountRequest("recover", {}, new AbortController());
    const check = expect(pending).rejects.toThrow("Periksa inbox dan spam");
    await vi.advanceTimersByTimeAsync(35000);
    await check;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps destinations local and recovery feedback generic", () => {
    expect(["staff", "student", "supervisor"].map(loginDestination)).toEqual([
      "/dashboard",
      "/student",
      "/supervisor",
    ]);
    expect(recoveryAcceptedMessage).toContain("Jika akun tersedia");
  });
});
