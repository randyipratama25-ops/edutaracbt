import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: vi.fn(),
  user: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  signout: vi.fn(),
  remove: vi.fn(),
  session: vi.fn(),
  exchange: vi.fn(),
  otp: vi.fn(),
}));
vi.mock("../lib/supabase/server", () => ({ db: m.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: m.remove }),
}));
import { GET, POST } from "../app/api/auth/password/route";
import { POST as activate } from "../app/api/auth/activate/route";
import { GET as confirm } from "../app/auth/confirm/route";
const password = " Password unchanged 123 ";
const request = (input: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/auth/password", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.db.mockResolvedValue({
    auth: {
      getUser: m.user,
      updateUser: m.update,
      signOut: m.signout,
      setSession: m.session,
      exchangeCodeForSession: m.exchange,
      verifyOtp: m.otp,
    },
    rpc: m.audit,
  });
  m.user.mockResolvedValue({ data: { user: { id: "self" } }, error: null });
  for (const f of [m.update, m.audit, m.signout, m.session, m.exchange, m.otp])
    f.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("password API and confirmation boundaries", () => {
  it("checks session privately without changing password, audit or sessions", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect((await r.json()).data).toEqual({ ready: true });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    m.user.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
  });
  it("rejects cross-origin and invalid lengths before authentication or mutation", async () => {
    expect(
      (await POST(request({ password }, "https://other.test"))).status,
    ).toBe(403);
    for (const value of ["short", "x".repeat(129)])
      expect((await POST(request({ password: value }))).status).toBe(422);
    expect(m.db).not.toHaveBeenCalled();
  });
  it("preserves password bytes, then audits, globally signs out and removes context", async () => {
    const r = await POST(request({ password }));
    expect(r.status).toBe(200);
    expect((await r.json()).data.signed_out).toBe(true);
    expect(m.update).toHaveBeenCalledExactlyOnceWith({ password });
    expect(m.audit).toHaveBeenCalledWith("session_audit", {
      event_name: "PASSWORD_CHANGED",
    });
    expect(m.signout).toHaveBeenCalledWith({ scope: "global" });
    expect(m.remove).toHaveBeenCalledWith("edutara_context");
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(
      m.audit.mock.invocationCallOrder[0],
    );
    expect(m.audit.mock.invocationCallOrder[0]).toBeLessThan(
      m.signout.mock.invocationCallOrder[0],
    );
  });
  it("rejects missing/invalid session before updating", async () => {
    m.user.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect((await POST(request({ password }))).status).toBe(401);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("keeps known password rejections actionable and does not sign out", async () => {
    for (const code of ["weak_password", "same_password"]) {
      m.update.mockResolvedValueOnce({
        error: { code, status: 422, message: "private provider detail" },
      });
      const r = await POST(request({ password }));
      expect(r.status).toBe(422);
      expect(await r.text()).not.toContain("private provider detail");
    }
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.signout).not.toHaveBeenCalled();
  });
  it("does not retry mutations when provider outcome is unknown", async () => {
    m.update.mockRejectedValue(new Error("network internals"));
    const r = await POST(request({ password }));
    expect(r.status).toBe(503);
    expect(await r.text()).toContain("belum dapat dipastikan");
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.signout).not.toHaveBeenCalled();
  });
  it("still globally signs out when audit returns an error or throws", async () => {
    for (const throws of [false, true]) {
      m.audit.mockReset();
      if (throws) m.audit.mockRejectedValue(new Error("audit failed"));
      else m.audit.mockResolvedValue({ error: { message: "audit failed" } });
      const r = await POST(request({ password }));
      expect(r.status).toBe(200);
      expect((await r.json()).data.signed_out).toBe(true);
    }
    expect(m.signout).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      password,
    );
  });
  it("reports a confirmed password change honestly when signout fails", async () => {
    for (const throws of [false, true]) {
      m.signout.mockReset();
      if (throws) m.signout.mockRejectedValue(new Error("signout failed"));
      else
        m.signout.mockResolvedValue({ error: { message: "signout failed" } });
      const r = await POST(request({ password }));
      expect(r.status).toBe(200);
      const result = (await r.json()).data;
      expect(result.signed_out).toBe(false);
      expect(result.message).toContain("Password telah diperbarui");
    }
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("validates activation and never leaks tokens on rejected links", async () => {
    expect(
      (await activate(request({ access_token: "x", refresh_token: "y" })))
        .status,
    ).toBe(422);
    expect(m.session).not.toHaveBeenCalled();
    m.session.mockResolvedValue({
      error: { status: 400, message: "secret-token" },
    });
    const r = await activate(
      request({
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
      }),
    );
    expect(r.status).toBe(401);
    expect(await r.text()).not.toContain("secret-token");
  });
  it("confirms valid PKCE/email links only to fixed local routes", async () => {
    const r = await confirm(
      new Request(
        "https://cbt.test/auth/confirm?code=a%2Bb&next=https://outside.invalid",
      ),
    );
    expect(r.headers.get("location")).toBe("https://cbt.test/auth/reset");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(m.exchange).toHaveBeenCalledWith("a+b");
    for (const type of ["invite", "recovery"]) {
      await confirm(
        new Request(
          "https://cbt.test/auth/confirm?token_hash=hash&type=" + type,
        ),
      );
      expect(m.otp).toHaveBeenLastCalledWith({ token_hash: "hash", type });
    }
  });
  it("rejects malformed confirmation before the SDK and catches provider failures", async () => {
    for (const suffix of [
      "?code=",
      "?token_hash=hash&type=signup",
      "?error=access_denied&code=abc",
    ])
      expect(
        (
          await confirm(new Request("https://cbt.test/auth/confirm" + suffix))
        ).headers.get("location"),
      ).toBe("https://cbt.test/login?error=activation");
    expect(m.db).not.toHaveBeenCalled();
    m.exchange.mockRejectedValue(new Error("network private"));
    expect(
      (
        await confirm(new Request("https://cbt.test/auth/confirm?code=abc"))
      ).headers.get("location"),
    ).toBe("https://cbt.test/login?error=activation");
  });
});
