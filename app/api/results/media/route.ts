import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import { failure, HttpError, json } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff();
    const s = new URL(request.url).searchParams;
    const id = z.uuid().parse(s.get("id")),
      canvas = s.get("kind") === "canvas";
    const row = await a.client
      .from(canvas ? "answer_media" : "media_assets")
      .select("*")
      .eq("id", id)
      .single();
    if (row.error || !row.data)
      throw new HttpError(404, "Lampiran di luar cakupan atau tidak tersedia.");
    const r = await a.client.storage
      .from(canvas ? "attempt-canvas" : "exam-media")
      .createSignedUrl(row.data.object_path, 60);
    if (r.error) throw new HttpError(403, "Lampiran tidak dapat dibaca.");
    return json({
      url: r.data.signedUrl,
      mime: canvas ? "image/png" : row.data.mime_type,
    });
  } catch (e) {
    return failure(e);
  }
}
