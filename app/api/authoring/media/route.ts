import {z} from "zod";
import { readBounded, storeMedia } from "../../../../lib/operations/media";
import { actor } from "../../../../lib/auth/actor";
import { failure, HttpError, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(403, "Akses ditolak.");
    if(Number(request.headers.get("content-length")||0)>5300000)throw new HttpError(413,"Maksimal 5 MiB per berkas.");
    const raw=await readBounded(request.body,5300000).catch(()=>{throw new HttpError(413,"Data unggahan kosong atau melampaui batas.");});
    const form = await new Response(raw as unknown as BodyInit, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData().catch(()=>{throw new HttpError(400,"Format unggahan tidak valid.");});
    const f = form.get("file");
    if (!(f instanceof File)) throw new HttpError(422, "File wajib.");
    const row = await storeMedia(
      a.client,
      a,
      new Uint8Array(await f.arrayBuffer()),
      f.type,
    ).catch((e) => {
      if(e instanceof HttpError)throw e;
      throw new HttpError(422,"Isi atau tipe berkas tidak valid (maksimal 5 MiB).");
    });
    return json(row);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "staff") throw new HttpError(401, "Silakan masuk.");
    const id=z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { data, error } = await a.client
      .from("media_assets")
      .select("object_path,mime_type")
      .eq("id", id)
      .single();
    if (error || !data) throw new HttpError(404, "Lampiran tidak tersedia.");
    const r = await a.client.storage
      .from("exam-media")
      .createSignedUrl(data.object_path, 60);
    if(r.error||!r.data?.signedUrl)throw new HttpError(503,"URL lampiran belum dapat dibuat. Coba kembali.");
    return json({ url: r.data.signedUrl, mime: data.mime_type });
  } catch (e) {
    return failure(e);
  }
}
