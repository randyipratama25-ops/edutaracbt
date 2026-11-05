import { staff } from "../../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../../lib/http";
import {
  providerSave,
  testProvider,
  providerControl,
} from "../../../../lib/ai/schema";
export async function GET() {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const r = await a.client
      .rpc("ai_configuration", { input: { action: "list" } })
      .abortSignal(AbortSignal.timeout(15000));
    if (r.error || !r.data)
      throw new HttpError(503, "Pengaturan AI belum tersedia.");
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const raw = await body(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Isian konfigurasi tidak valid.");
    if (raw.action === "test") {
      const input = testProvider.parse(raw);
      const r = await a.client.functions.invoke("ai-grading", { body: input });
      if (r.error) {
        let message = "Uji koneksi gagal. Periksa key, model dan kuota.";
        try {
          const payload = await r.error.context?.json();
          if (typeof payload?.error === "string") message = payload.error;
        } catch {}
        throw new HttpError(422, message);
      }
      return json(r.data);
    }
    const input =
      raw.action === "activate" || raw.action === "disable"
        ? providerControl.parse(raw)
        : providerSave.parse(raw);
    const r = await a.client.rpc("ai_configuration", { input });
    return json(rpcData(r, true));
  } catch (e) {
    return failure(e);
  }
}
