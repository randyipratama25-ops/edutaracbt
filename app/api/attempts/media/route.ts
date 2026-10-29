import { z } from "zod";
import { actor } from "../../../../lib/auth/actor";
import { failure, HttpError, json } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "student")
      throw new HttpError(403, "Sesi siswa diperlukan.");
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { data, error } = await a.client
      .from("media_assets")
      .select("object_path,mime_type")
      .eq("id", id)
      .single();
    if (error || !data) throw new HttpError(404, "Lampiran tidak tersedia.");
    const r = await a.client.storage
      .from("exam-media")
      .createSignedUrl(data.object_path, 60);
    if (r.error) throw new HttpError(403, "Akses lampiran ditolak.");
    return json({ url: r.data.signedUrl, mime: data.mime_type });
  } catch (e) {
    return failure(e);
  }
}
