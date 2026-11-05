import { snapshotSchema } from "../../../lib/acceptance/readiness";
import { staff } from "../../../lib/results/server";
import { failure, HttpError, json } from "../../../lib/http";

export async function GET() {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const result = await a.client
      .rpc("operational_snapshot")
      .abortSignal(AbortSignal.timeout(15000));
    if (result.error || !result.data)
      throw new HttpError(503, "Ringkasan operasional belum dapat dimuat.");
    const snapshot = snapshotSchema.safeParse(result.data);
    if (!snapshot.success)
      throw new HttpError(503, "Ringkasan operasional belum dapat dimuat.");
    return json(snapshot.data);
  } catch (error) {
    return failure(error);
  }
}
