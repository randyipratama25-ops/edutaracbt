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
    void a;
    void input;
    throw new HttpError(
      503,
      "AI tetap nonaktif sesuai pilihan pengelola. Tidak ada jawaban yang dikirim ke penyedia eksternal; koreksi manual dan moderasi tetap tersedia.",
    );
  } catch (e) {
    return failure(e);
  }
}
