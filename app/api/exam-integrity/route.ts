import { z } from "zod";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";
import {
  policyConfig,
  policySave,
  pendingTransfers,
  transferDecision,
} from "../../../lib/operations/exam-policy";
import { operator } from "../../../lib/operations/server";

export async function GET(request: Request) {
  try {
    const a = await operator();
    const params = new URL(request.url).searchParams;
    const action = z.enum(["config", "transfers"]).parse(params.get("action"));
    const exam_id = z.uuid().parse(params.get("exam"));
    if (action === "config" && (a.role !== "admin" || a.context !== "staff"))
      throw new HttpError(
        403,
        "Hanya Admin dapat melihat konfigurasi integritas.",
      );
    const result = rpcData(
      await a.client.rpc("exam_integrity_command", {
        input: { action, exam_id },
      }),
    );
    const parsed = (
      action === "config" ? policyConfig : pendingTransfers
    ).safeParse(result);
    if (!parsed.success)
      throw new HttpError(503, "Data integritas belum dapat dimuat.");
    return json(parsed.data);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await operator();
    const raw = await body(request);
    const input = z.union([policySave, transferDecision]).parse(raw);
    if (
      input.action === "save" &&
      (a.role !== "admin" || a.context !== "staff")
    )
      throw new HttpError(403, "Hanya Admin dapat mengatur kebijakan ujian.");
    const result = rpcData(
      await a.client.rpc("exam_integrity_command", { input }),
      true,
    );
    const parsed = (
      input.action === "save"
        ? policyConfig
        : z.object({ saved: z.literal(true) })
    ).safeParse(result);
    if (!parsed.success)
      throw new HttpError(503, "Periksa kembali hasil perubahan.");
    return json(parsed.data);
  } catch (error) {
    return failure(error);
  }
}
