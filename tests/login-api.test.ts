import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  gateway: vi.fn(),
  session: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("../lib/auth/gateway", () => ({ gateway: m.gateway }));
vi.mock("../lib/supabase/server", () => ({
  db: async () => ({ auth: { setSession: m.session } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: m.cookie }) }));
import { POST as login } from "../app/api/auth/login/route";
import { POST as recover } from "../app/api/auth/recover/route";
import { HttpError } from "../lib/http";
const req = (path: string, input: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/auth/" + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  m.gateway
    .mockReset()
    .mockResolvedValue({
      session: { access_token: "test-access", refresh_token: "test-refresh" },
      accepted: true,
    });
  m.session.mockReset().mockResolvedValue({ error: null });
  m.cookie.mockReset();
});
describe("login/recovery contracts", () => {
  it("normalizes usernames, preserves passwords and sets HttpOnly context cookies", async () => {
    for (const [context, next] of [
      ["staff", "/dashboard"],
      ["student", "/student"],
      ["supervisor", "/supervisor"],
    ]) {
      const r = await login(
        req("login", {
          username: " GURU_1 ",
          password: " Password spaces ",
          context,
        }),
      );
      expect(r.status).toBe(200);
      expect((await r.json()).data.next).toBe(next);
      expect(m.gateway).toHaveBeenLastCalledWith({
        action: "login",
        username: "guru_1",
        password: " Password spaces ",
        context,
      });
      expect(m.cookie).toHaveBeenLastCalledWith(
        "edutara_context",
        context,
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
      );
    }
  });
  it("rejects invalid inputs and cross-origin before gateway calls", async () => {
    expect(
      (
        await login(
          req("login", { username: " ", password: "x", context: "staff" }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await login(
          req("login", { username: "guru_1", password: "x", context: "admin" }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await recover(
          req("recover", { username: "guru_1" }, "https://other.test"),
        )
      ).status,
    ).toBe(403);
    expect(m.gateway).not.toHaveBeenCalled();
  });
  it("does not set sessions/cookies on credential, context or rate failures", async () => {
    for (const status of [401, 403, 429]) {
      m.gateway.mockRejectedValueOnce(new HttpError(status, "Rejected"));
      expect(
        (
          await login(
            req("login", {
              username: "guru_1",
              password: "x",
              context: "staff",
            }),
          )
        ).status,
      ).toBe(status);
    }
    expect(m.cookie).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
  it("returns the same private non-enumerating recovery response", async () => {
    const messages = [];
    for (const username of ["known_user", "unknown_user"]) {
      const r = await recover(req("recover", { username }));
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      messages.push((await r.json()).data.message);
    }
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toContain("Jika akun tersedia");
    expect(m.session).not.toHaveBeenCalled();
  });
});
