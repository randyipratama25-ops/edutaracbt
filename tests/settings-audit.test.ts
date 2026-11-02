import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/system/route";
import {
  appSettingsSchema,
  settingsReceipt,
  settingsValues,
  validTimezone,
} from "../lib/system/contracts";
const id = "10000000-0000-4000-8000-000000000001";
const settings = {
  name: "EDUTARA CBT",
  subtitle: "Ujian madrasah",
  timezone: "Asia/Jakarta",
  login_logo_id: null,
  login_background_id: null,
  violation_limit: 3,
  canvas_enabled: true,
  results_enabled: true,
  automation_enabled: false,
  reminders_enabled: false,
  retention_days: 180,
  smtp_sender: "",
  reminder_template: "Halo {{nama}}, periode {{periode}}.",
};
const full = {
  ...settings,
  version: 1,
  secrets: { smtp_password: false },
  scheduler: "Supabase Cron",
  secret_readback: false,
  worker_capabilities: { smtp: false, backup: true, retention: false },
};
const req = (data: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/system", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(data),
  });
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rpc = vi.fn(async () => ({ data: full, error: null }));
  vi.mocked(actor).mockResolvedValue({
    role: "admin",
    context: "staff",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
it("accepts capability flags and strips readonly metadata from drafts", () => {
  const data = appSettingsSchema.parse(full);
  expect(settingsValues(data)).toEqual(settings);
  expect(settingsValues(data)).not.toHaveProperty("version");
  expect(
    appSettingsSchema.safeParse({
      ...full,
      secrets: { smtp_password: "secret-value" },
    }).success,
  ).toBe(false);
});
it("rejects null/corrupt settings and fractional versions", () => {
  expect(appSettingsSchema.safeParse(null).success).toBe(false);
  expect(appSettingsSchema.safeParse({ ...full, version: 1.5 }).success).toBe(
    false,
  );
  expect(
    appSettingsSchema.safeParse({
      ...full,
      worker_capabilities: { smtp: "yes" },
    }).success,
  ).toBe(false);
});
it("validates timezones without limiting existing Indonesian options", () => {
  for (const zone of [
    "Asia/Jakarta",
    "Asia/Makassar",
    "Asia/Jayapura",
    "UTC",
    "America/Los_Angeles",
  ])
    expect(validTimezone(zone)).toBe(true);
  expect(validTimezone("not/a/timezone")).toBe(false);
});
it("requires exact true receipts without secret readback", () => {
  expect(settingsReceipt("save").safeParse({ saved: false }).success).toBe(
    false,
  );
  expect(
    settingsReceipt("secret").safeParse({ configured: true, readback: true })
      .success,
  ).toBe(false);
  expect(
    settingsReceipt("smtp_probe").safeParse({ queued: true }).success,
  ).toBe(false);
});
it.each([
  { role: "teacher", context: "staff" },
  { role: "supervisor", context: "supervisor" },
  { role: "student", context: "student" },
])("denies $role before RPC", async (a) => {
  vi.mocked(actor).mockResolvedValue({
    ...a,
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
  expect((await GET(new Request("https://cbt.test/api/system"))).status).toBe(
    403,
  );
  expect(
    (await POST(req({ action: "smtp_probe", request_id: id }))).status,
  ).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("rejects anonymous and cross-origin requests", async () => {
  expect(
    (
      await POST(
        req({ action: "smtp_probe", request_id: id }, "https://other.test"),
      )
    ).status,
  ).toBe(403);
  vi.mocked(actor).mockResolvedValue(null);
  expect((await GET(new Request("https://cbt.test/api/system"))).status).toBe(
    403,
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("returns503 for invalid settings and masks SQL details", async () => {
  rpc.mockResolvedValueOnce({ data: {}, error: null });
  expect((await GET(new Request("https://cbt.test/api/system"))).status).toBe(
    503,
  );
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "23502", message: "PRIVATE_SQL_SECRET" },
  });
  const r = await GET(new Request("https://cbt.test/api/system"));
  expect(r.status).toBe(422);
  expect(await r.text()).not.toContain("PRIVATE_SQL_SECRET");
});
it("preserves version CAS payload and conflict409", async () => {
  const input = { action: "save", version: 1, settings };
  rpc.mockResolvedValueOnce({ data: { saved: true }, error: null });
  expect((await POST(req(input))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("system_command", { input });
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "P0001", message: "CONFLICT: Pengaturan berubah" },
  });
  expect((await POST(req(input))).status).toBe(409);
});
it("does not accept empty or false save acknowledgements", async () => {
  for (const data of [null, {}, { saved: false }]) {
    rpc.mockResolvedValueOnce({ data, error: null });
    expect(
      (await POST(req({ action: "save", version: 1, settings }))).status,
    ).toBe(503);
  }
});
it("keeps SMTP job identity and strips unexpected response values", async () => {
  rpc.mockResolvedValue({
    data: { id, queued: true, password: "do-not-return" },
    error: null,
  });
  const r = await POST(req({ action: "smtp_probe", request_id: id }));
  expect((await r.json()).data).toEqual({ id, queued: true });
});
it("does not expose secret value from receipt and never offers secret readback", async () => {
  rpc.mockResolvedValue({
    data: { configured: true, readback: false, value: "do-not-return" },
    error: null,
  });
  const r = await POST(
    req({ action: "secret", key: "smtp_password", value: "valid-password" }),
  );
  expect((await r.json()).data).toEqual({ configured: true, readback: false });
  expect(
    (await POST(req({ action: "secret_read", key: "smtp_password" }))).status,
  ).toBe(422);
});
it("preserves existing job and audit RPC contracts", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(
    (await GET(new Request("https://cbt.test/api/system?action=jobs"))).status,
  ).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith("system_command", {
    input: expect.objectContaining({ action: "jobs" }),
  });
  rpc.mockResolvedValue({ data: { cancelled: true }, error: null });
  expect(
    (
      await POST(
        req({
          action: "cancel_backup",
          id,
          reason: "Dibatalkan untuk pengujian",
          confirmation: "KONFIRMASI",
        }),
      )
    ).status,
  ).toBe(200);
});
