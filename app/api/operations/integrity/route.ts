import { z } from "zod";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../../lib/http";
import {
  integrityFollowup,
  integrityHistory,
} from "../../../../lib/operations/integrity";
import { operator } from "../../../../lib/operations/server";

export async function GET(request: Request) {
  try {
    const a = await operator();
    const attempt_id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("attempt"));
    const result = await a.client.rpc("integrity_command", {
      input: { action: "history", attempt_id },
    });
    const parsed = integrityHistory.safeParse(rpcData(result));
    if (!parsed.success)
      throw new HttpError(503, "Riwayat integritas belum dapat dimuat.");
    return json(parsed.data);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await operator();
    const input = integrityFollowup.parse(await body(request));
    const result = await a.client.rpc("integrity_command", { input });
    const receipt = rpcData(result, true);
    if (!z.object({ saved: z.literal(true) }).safeParse(receipt).success)
      throw new HttpError(
        503,
        "Periksa riwayat untuk memastikan tindak lanjut tersimpan.",
      );
    return json(receipt);
  } catch (error) {
    return failure(error);
  }
}
