import { z } from "zod";
import { feedbackJSON } from "../client/feedback-transport";

export const questionMediaTypes = {
  image: "image/png,image/jpeg,image/webp",
  audio: "audio/mpeg,audio/ogg,audio/wav",
};

export async function uploadQuestionMedia(file: File, signal: AbortSignal) {
  if (
    !Object.values(questionMediaTypes).some((types) =>
      types.split(",").includes(file.type),
    )
  )
    throw Error("Pilih gambar PNG/JPEG/WebP atau audio MP3/OGG/WAV.");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw Error("Berkas harus berisi data dan berukuran maksimal 5 MiB.");
  const body = new FormData();
  body.set("file", file);
  const { response, data } = await feedbackJSON<{
    success?: boolean;
    data?: unknown;
    error?: { message?: string };
  }>("/api/authoring/media", {
    method: "POST",
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
  });
  if (!response.ok || !data.success)
    throw Error(data.error?.message || "Lampiran belum dapat diunggah.");
  return z.object({ id: z.uuid() }).parse(data.data);
}
