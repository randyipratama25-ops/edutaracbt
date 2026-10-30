import { staff } from "../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
import { evaluationSchema } from "../../../lib/advanced/schema";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const p = new URL(request.url).searchParams;
    const page = Number(p.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new HttpError(422, "Halaman tidak valid.");
    const r = await a.client.rpc("advanced_command", {
      input: { action: "list", page },
    });
    if (r.error) throw new HttpError(422, "Evaluasi belum dapat dimuat.");
    return json({
      ...r.data,
      candidate_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
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
    if (r.error)
      throw new HttpError(
        r.error.message.includes("CONFLICT") ? 409 : 422,
        r.error.message,
      );
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
