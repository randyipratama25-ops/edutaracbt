import { staff } from "../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";
import {
  evaluationList,
  evaluationReceipt,
  evaluationSchema,
} from "../../../lib/advanced/schema";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const p = new URL(request.url).searchParams;
    const page = Number(p.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new HttpError(422, "Halaman tidak valid.");
    const r = await a.client
      .rpc("advanced_command", {
        input: { action: "list", page },
      })
      .abortSignal(AbortSignal.timeout(15000));
    const raw = rpcData(r);
    const result = evaluationList.safeParse(raw);
    if (!result.success)
      throw new HttpError(503, "Evaluasi belum dapat dimuat.");
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    return json({
      ...result.data,
      candidate_sha: sha && /^[a-f0-9]{40}$/.test(sha) ? sha : null,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const input = evaluationSchema.parse(await body(request));
    const r = await a.client.rpc("advanced_command", { input });
    const receipt = evaluationReceipt.safeParse(rpcData(r, true));
    if (!receipt.success)
      throw new HttpError(503, "Hasil pencatatan belum dapat dipastikan.");
    return json(receipt.data);
  } catch (e) {
    return failure(e);
  }
}
