import { actor } from "../../../../lib/auth/actor";
import { failure, HttpError, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(403, "Akses ditolak.");
    if (Number(request.headers.get("content-length") || 0) > 5_300_000)
      throw new HttpError(413, "Maksimal 5 MB.");
    const f = (await request.formData()).get("file");
    if (!(f instanceof File) || f.size > 5242880 || !f.size)
      throw new HttpError(422, "File tidak valid.");
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
      ].includes(f.type)
    )
      throw new HttpError(422, "Tipe file tidak didukung.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216;
    const riff = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF";
    const ogg = new TextDecoder().decode(bytes.slice(0, 4)) === "OggS";
    const mp3 =
      new TextDecoder().decode(bytes.slice(0, 3)) === "ID3" ||
      (bytes[0] === 255 && (bytes[1] & 224) === 224);
    if (
      !(
        (f.type === "image/png" && png) ||
        (f.type === "image/jpeg" && jpg) ||
        (f.type === "image/webp" && riff) ||
        (f.type === "audio/wav" && riff) ||
        (f.type === "audio/ogg" && ogg) ||
        (f.type === "audio/mpeg" && mp3)
      )
    )
      throw new HttpError(422, "Isi file tidak cocok dengan tipe.");
    const path = `${a.id}/${crypto.randomUUID()}`;
    const uploaded = await a.client.storage
      .from("exam-media")
      .upload(path, bytes, { contentType: f.type, upsert: false });
    if (uploaded.error) throw new HttpError(422, "Unggah gagal.");
    const row = await a.client
      .from("media_assets")
      .insert({
        organization_id: a.organization_id,
        uploader_id: a.id,
        object_path: path,
        mime_type: f.type,
        byte_size: f.size,
      })
      .select("id")
      .single();
    if (row.error) {
      await a.client.storage.from("exam-media").remove([path]);
      throw new HttpError(422, "Pencatatan lampiran gagal.");
    }
    return json(row.data);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "staff") throw new HttpError(401, "Silakan masuk.");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(422, "ID lampiran wajib.");
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
