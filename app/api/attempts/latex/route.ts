import { z } from "zod";
import { actor } from "../../../../lib/auth/actor";
import { body, failure, HttpError, requireOrigin } from "../../../../lib/http";
// Adapter contract deliberately disabled until an OCR provider, credentials and data consent are configured.
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "student")
      throw new HttpError(403, "Sesi siswa diperlukan.");
    const { canvas_id } = z
      .object({ canvas_id: z.uuid() })
      .parse(await body(request));
    const r = await a.client
      .from("answer_media")
      .select("id")
      .eq("id", canvas_id)
      .single();
    if (r.error || !r.data) throw new HttpError(404, "Canvas tidak tersedia.");
    throw new HttpError(
      503,
      "Konversi canvas ke LaTeX belum dikonfigurasi. Gambar tetap tersimpan; tulis LaTeX secara manual jika diperlukan.",
    );
  } catch (e) {
    return failure(e);
  }
}
