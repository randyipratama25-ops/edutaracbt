import { after } from "next/server";
import { z } from "zod";
import { staff, resultData } from "../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
import {
  createReportSchema,
  reportSettingsSchema,
} from "../../../lib/reports/schema";
import { processReport } from "../../../lib/reports/worker";
import { analyze } from "../../../lib/results/analytics";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const a = await staff();
    const s = new URL(request.url).searchParams;
    const input = s.get("settings")
      ? { action: "settings_get" }
      : s.get("job")
        ? { action: "status", job_id: z.uuid().parse(s.get("job")) }
        : { action: "list" };
    const r = await a.client.rpc("report_command", { input }).abortSignal(AbortSignal.timeout(15000));
    return json(resultData(r));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    const raw = await body(request);
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(422,"Payload harus berupa objek.");
    const input =
      raw.action === "settings"
        ? reportSettingsSchema.parse(raw)
        : raw.action === "analysis"
          ? z
              .object({
                action: z.literal("analysis"),
                ids: z.array(z.uuid()).min(1).max(500),
              })
              .parse(raw)
          : createReportSchema.parse(raw);
    const r = await a.client.rpc("report_command", { input });
    resultData(r,true);
    if (r.data?.error) throw new HttpError(r.data.status || 422, r.data.error);
    if (input.action === "create") {
      const receipt=z.object({id:z.uuid(),status:z.string()}).safeParse(r.data);
      if(!receipt.success)throw new HttpError(503,"Hasil pembuatan laporan belum dapat dipastikan. Muat status ekspor sebelum mencoba lagi.");
      after(() => processReport(a.client, receipt.data.id));
    }
    if(input.action==='analysis'&&!Array.isArray(r.data))throw new HttpError(503,'Data analisis belum tersedia.');
    return json(input.action === "analysis" ? analyze(r.data) : r.data);
  } catch (e) {
    return failure(e);
  }
}
