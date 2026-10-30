import { staff } from "../../../lib/results/server";
import { failure, HttpError, json } from "../../../lib/http";
export async function GET() {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const r = await a.client.rpc("operational_snapshot");
    if (r.error)
      throw new HttpError(422, "Ringkasan operasional belum dapat dimuat.");
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
