import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
export const mediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
];
export function validateMedia(bytes: Uint8Array, mime: string) {
  if (
    bytes.length === 0 ||
    bytes.length > 5242880 ||
    !mediaTypes.includes(mime)
  )
    throw Error("Tipe/ukuran file tidak valid (maks. 5 MiB).");
  const tag = (a: number, b: number) =>
    new TextDecoder().decode(bytes.slice(a, b));
  const riff = tag(0, 4) === "RIFF",
    kind = tag(8, 12);
  const ok =
    mime === "image/png"
      ? bytes
          .slice(0, 8)
          .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) &&
        bytes.length >= 24
      : mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === "image/webp"
          ? riff && kind === "WEBP"
          : mime === "audio/wav"
            ? riff && kind === "WAVE"
            : mime === "audio/ogg"
              ? tag(0, 4) === "OggS"
              : tag(0, 3) === "ID3" ||
                (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!ok) throw Error("Isi file tidak cocok dengan tipe.");
  return createHash("sha256").update(bytes).digest("hex");
}
export async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
) {
  if (!stream) throw Error("Isi file kosong.");
  const reader = stream.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error("Ukuran file melampaui batas.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}
export async function storeMedia(
  client: SupabaseClient,
  actor: { id: string; organization_id: string },
  bytes: Uint8Array,
  mime: string,
  sourceId?: string,
) {
  const hash = validateMedia(bytes, mime);
  const path = `${actor.id}/${sourceId ? "drive-" + sourceId + "-" + hash : crypto.randomUUID()}`;
  if (sourceId) {
    const old = await client
      .from("media_assets")
      .select("id")
      .eq("object_path", path)
      .maybeSingle();
    if (old.data) return old.data;
  }
  const up = await client.storage
    .from("exam-media")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw Error("Unggah media gagal; file sumber tidak diubah.");
  const row = await client
    .from("media_assets")
    .insert({
      organization_id: actor.organization_id,
      uploader_id: actor.id,
      object_path: path,
      mime_type: mime,
      byte_size: bytes.length,
      sha256: hash,
    })
    .select("id")
    .single();
  if (row.error) {
    await client.storage.from("exam-media").remove([path]);
    throw Error("Pencatatan media gagal.");
  }
  return row.data;
}
