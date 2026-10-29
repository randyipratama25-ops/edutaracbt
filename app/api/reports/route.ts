import { after } from "next/server";
import { z } from "zod";
import { staff } from "../../../lib/results/server";
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
    const r = await a.client.rpc("report_command", { input });
    if (r.error) throw new HttpError(422, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    const raw = await body(request);
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
    if (r.error) throw new HttpError(422, r.error.message);
    if (r.data?.error) throw new HttpError(r.data.status || 422, r.data.error);
    if (input.action === "create")
      after(() => processReport(a.client, r.data.id));
    return json(input.action === "analysis" ? analyze(r.data) : r.data);
  } catch (e) {
    return failure(e);
  }
}
