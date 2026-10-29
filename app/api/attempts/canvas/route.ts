import { createHash } from "node:crypto";
import { z } from "zod";
import { actor } from "../../../../lib/auth/actor";
import { failure, HttpError, json, requireOrigin } from "../../../../lib/http";
const fields = z.object({
  attempt_id: z.uuid(),
  question_id: z.uuid(),
  client_id: z.uuid(),
  epoch: z.coerce.number().int().positive(),
});
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "student")
      throw new HttpError(403, "Sesi siswa diperlukan.");
    if (Number(request.headers.get("content-length") || 0) > 5_300_000)
      throw new HttpError(
        413,
        "Canvas maksimal 5 MiB; gambar tidak akan dipotong.",
      );
    const f = await request.formData();
    const input = fields.parse(Object.fromEntries(f));
    const file = f.get("file");
    if (
      !(file instanceof File) ||
      file.type !== "image/png" ||
      file.size > 5242880 ||
      file.size < 24
    )
      throw new HttpError(422, "PNG utuh maksimal 5 MiB diperlukan.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
      throw new HttpError(422, "Signature PNG tidak valid.");
    const width = new DataView(bytes.buffer).getUint32(16),
      height = new DataView(bytes.buffer).getUint32(20);
    if (width > 4096 || height > 4096 || !width || !height)
      throw new HttpError(422, "Ukuran canvas maksimal 4096 × 4096.");
    const path = `${a.id}/${input.attempt_id}/${input.question_id}/${crypto.randomUUID()}.png`;
    const up = await a.client.storage
      .from("attempt-canvas")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (up.error) throw new HttpError(422, "Canvas belum berhasil diunggah.");
    const r = await a.client.rpc("attempt_command", {
      input: {
        ...input,
        action: "canvas",
        path,
        byte_size: file.size,
        checksum: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    if (r.error || !r.data?.id) {
      await a.client.storage.from("attempt-canvas").remove([path]);
      throw new HttpError(
        409,
        r.error?.message ||
          "Attempt tidak dapat menerima canvas. Muat ulang status ujian.",
      );
    }
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "student")
      throw new HttpError(403, "Sesi siswa diperlukan.");
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const row = await a.client
      .from("answer_media")
      .select("object_path")
      .eq("id", id)
      .single();
    if (row.error || !row.data)
      throw new HttpError(404, "Canvas tidak tersedia.");
    const r = await a.client.storage
      .from("attempt-canvas")
      .download(row.data.object_path);
    if (r.error) throw new HttpError(404, "Canvas tidak tersedia.");
    return new Response(r.data, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
