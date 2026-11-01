import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { userRequest, UserRequestError } from "../lib/users/request";
import {
  savedSchema,
  createdSchema,
  userListSchema,
} from "../lib/users/schema";
const fetcher = vi.fn();
const response = (data: unknown, status = 200, success = true) => ({
  ok: status < 400,
  status,
  json: async () =>
    status < 400
      ? { success, data }
      : { success: false, error: { message: data } },
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("bounded user transport", () => {
  it("preserves endpoint/envelope/abort contract and returns valid confirmed writes once", async () => {
    fetcher.mockResolvedValue(response({ saved: true }));
    const c = new AbortController();
    expect(
      await userRequest(
        "/api/admin/users",
        { operation: "update" },
        savedSchema,
        c,
        true,
      ),
    ).toEqual({ saved: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST",
      signal: c.signal,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("treats malformed/non-JSON/failed envelopes as uncertain after a mutation, never retries", async () => {
    for (const r of [
      response(null),
      response({ saved: true }, 200, false),
      {
        ok: true,
        json: async () => {
          throw Error("HTML body");
        },
      },
    ]) {
      fetcher.mockResolvedValueOnce(r);
      await expect(
        userRequest(
          "/api/admin/users",
          { operation: "update" },
          savedSchema,
          new AbortController(),
          true,
        ),
      ).rejects.toMatchObject({ uncertain: true });
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("reports failed read generically without raw provider content or false zero", async () => {
    fetcher.mockResolvedValue(response("SECRET_SQL", 503));
    await expect(
      userRequest(
        "/api/admin/users",
        undefined,
        userListSchema,
        new AbortController(),
      ),
    ).rejects.toMatchObject({ uncertain: false });
    try {
      await userRequest(
        "/api/admin/users",
        undefined,
        userListSchema,
        new AbortController(),
      );
    } catch (e) {
      expect((e as Error).message).not.toContain("SECRET_SQL");
    }
  });
  it("distinguishes rejected validation from partial creation and uncertain invitations", async () => {
    fetcher.mockResolvedValueOnce(response("Username sudah digunakan.", 422));
    await expect(
      userRequest(
        "/api/admin/users",
        { operation: "create" },
        createdSchema,
        new AbortController(),
        true,
      ),
    ).rejects.toMatchObject({ uncertain: false, status: 422 });
    fetcher.mockResolvedValueOnce(response("Profil gagal disimpan.", 422));
    await expect(
      userRequest(
        "/api/admin/users",
        { operation: "create" },
        createdSchema,
        new AbortController(),
        true,
      ),
    ).rejects.toMatchObject({ uncertain: true });
    fetcher.mockRejectedValueOnce(Error("lost"));
    await expect(
      userRequest(
        "/api/admin/users",
        { operation: "resend_invitation" },
        savedSchema,
        new AbortController(),
        true,
      ),
    ).rejects.toThrow("inbox");
  });
  it("aborts hung mutations at deadline and cleans timers/listeners without resending", async () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    const c = new AbortController();
    const promise = userRequest(
      "/api/admin/users",
      { operation: "archive" },
      savedSchema,
      c,
      true,
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(UserRequestError);
    await vi.advanceTimersByTimeAsync(35000);
    await assertion;
    expect(c.signal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("supports explicit cancellation and rejects already-aborted reads before fetch", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      userRequest("/api/admin/users", undefined, userListSchema, c),
    ).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
