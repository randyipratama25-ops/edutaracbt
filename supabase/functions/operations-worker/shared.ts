export const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
export function reminderText(
  template: string,
  v: { name: string; period: string; deficit: string; url: string },
) {
  return template.replace(
    /\{\{(nama|periode|kekurangan|tautan)\}\}/g,
    (_, key: string) =>
      ({
        nama: v.name,
        periode: v.period,
        kekurangan: v.deficit,
        tautan: v.url,
      })[key as "nama"],
  );
}
export function ambiguousDelivery(error: unknown) {
  const e = error as { code?: string; command?: string };
  return ["ETIMEDOUT", "ECONNRESET", "ESOCKET"].includes(e?.code || "");
}
export function validatePartPath(prefix: string, path: string) {
  if (
    !path.startsWith(prefix + "/") ||
    path.split("/").some((p) => p === ".." || p === ".") ||
    path.includes("\\")
  )
    throw Error("Path bagian tidak aman.");
}
export async function readSmallBody(request: Request, limit = 2048) {
  if (!request.body) throw Error("Missing body");
  const reader = request.body.getReader();
  let size = 0,
    result = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw Error("Request too large");
      }
      result += decoder.decode(r.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
