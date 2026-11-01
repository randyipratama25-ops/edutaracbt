import { after } from "next/server";
import { z } from "zod";
import { staff, resultData } from "../../../../lib/results/server";
import {
  body,
  failure,
  json,
  requireOrigin,
} from "../../../../lib/http";
import { processReport } from "../../../../lib/reports/worker";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    const { job_id } = z
      .object({ job_id: z.uuid() })
      .parse(await body(request));
    const r = await a.client.rpc("report_command", {
      input: { action: "status", job_id },
    });
    resultData(r);
    after(() => processReport(a.client, job_id));
    return json({ queued: true });
  } catch (e) {
    return failure(e);
  }
}
