import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({
  profile: null,
  live: null,
  signIn: vi.fn(),
  reset: vi.fn(),
  signOut: vi.fn(),
  audit: vi.fn(),
  budget: vi.fn(),
  assigned: true,
  handler: null,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url, key, options = {}) => {
    if (key === "test-service")
      return {
        rpc: m.budget,
        auth: {
          admin: {
            getUserById: async () => ({
              data: { user: { email: "fixture@example.invalid" } },
            }),
          },
        },
        from: (table) =>
          table === "audit_logs"
            ? { insert: m.audit }
            : {
                select: () => ({
                  eq: () => ({ single: async () => ({ data: m.profile }) }),
                }),
              },
      };
    if (options.global)
      return {
        from: () => ({
          select: () => ({
            eq: () => ({ single: async () => ({ data: m.live }) }),
          }),
        }),
        rpc: async () => ({ data: m.assigned }),
      };
    return {
      auth: {
        signInWithPassword: m.signIn,
        resetPasswordForEmail: m.reset,
        signOut: m.signOut,
      },
    };
  },
}));
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: {
      get: (key) =>
        key === "SUPABASE_SERVICE_ROLE_KEY"
          ? "test-service"
          : key === "SUPABASE_ANON_KEY"
            ? "test-anon"
            : "https://example.invalid",
    },
    serve: (handler) => {
      m.handler = handler;
    },
  });
  const path = "../supabase/functions/identity-gateway/index.ts";
  await import(path);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  m.profile = {
    id: "03000000-0000-4000-8000-000000000005",
    organization_id: "77777777-7777-4777-8777-777777777777",
    active: true,
    role: "teacher",
    archived_at: null,
  };
  m.live = { active: true, role: "teacher" };
  m.assigned = true;
  m.signIn
    .mockReset()
    .mockResolvedValue({
      data: {
        session: {
          access_token: "fake-access-token",
          refresh_token: "fake-refresh-token",
        },
      },
      error: null,
    });
  m.reset.mockReset().mockResolvedValue({ error: null });
  m.signOut.mockReset().mockResolvedValue({ error: null });
  m.audit.mockReset().mockResolvedValue({ error: null });
  m.budget.mockReset().mockResolvedValue({ data: true, error: null });
});
const call = (input) =>
  m.handler(
    new Request("https://example.invalid/functions/v1/identity-gateway", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
const login = {
  action: "login",
  username: "guru_1",
  password: " Password unchanged ",
  context: "staff",
};
describe("real gateway handler with isolated SDK", () => {
  it("attributes audit to each account organization without leaking session tokens", async () => {
    for (const org of [
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ]) {
      m.profile.organization_id = org;
      expect((await call(login)).status).toBe(200);
      expect(m.audit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          organization_id: org,
          actor_id: m.profile.id,
          action: "LOGIN",
        }),
      );
      expect(JSON.stringify(m.audit.mock.calls)).not.toContain(
        "fake-access-token",
      );
    }
    expect(m.signIn).toHaveBeenLastCalledWith({
      email: "fixture@example.invalid",
      password: " Password unchanged ",
    });
  });
  it("keeps credential and inactive failures generic with no success audit", async () => {
    m.signIn.mockResolvedValueOnce({
      data: { session: null },
      error: { status: 400 },
    });
    const a = await call(login);
    m.profile.active = false;
    const b = await call(login);
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("enforces assignment and rate limits", async () => {
    m.assigned = false;
    expect((await call({ ...login, context: "supervisor" })).status).toBe(403);
    expect(m.audit).not.toHaveBeenCalled();
    m.budget.mockResolvedValueOnce({ data: false, error: null });
    expect((await call(login)).status).toBe(429);
  });
  it("keeps recovery accepted for present and missing profiles", async () => {
    const a = await call({ action: "recover", username: "guru_1" });
    m.profile = null;
    const b = await call({ action: "recover", username: "missing_user" });
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    expect(m.reset).toHaveBeenCalledTimes(1);
    expect(m.reset).toHaveBeenCalledWith("fixture@example.invalid", {
      redirectTo: "https://edutara-cbt.vercel.app/auth/reset",
    });
  });
});
