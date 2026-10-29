export const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
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
