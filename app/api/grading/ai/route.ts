import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    const input = z
      .object({
        request_id: z.uuid(),
        items: z
          .array(z.object({ attempt_id: z.uuid(), question_id: z.uuid() }))
          .min(1)
          .max(50),
      })
      .parse(await body(request));
    const r = await a.client.rpc("results_command", {
      input: { ...input, action: "request_ai" },
    });
    if (r.error) throw new HttpError(422, r.error.message);
    if (r.data?.configured === false)
      return Response.json(
        { success: false, data: r.data, error: { message: r.data.message } },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    if (r.data?.error) throw new HttpError(r.data.status || 422, r.data.error);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
