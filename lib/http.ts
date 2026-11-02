import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  if (request.headers.get("host")) expected.host = request.headers.get("host")!;
  if (!origin || origin !== expected.origin)
    throw new HttpError(403, "Permintaan dari sumber yang tidak diizinkan.");
}
export function json(
  data: unknown,
  status = 200,
  requestId = crypto.randomUUID(),
) {
  return NextResponse.json(
    {
      success: status < 400,
      ...(status < 400 ? { data } : { error: { message: data } }),
      requestId,
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": requestId,
      },
    },
  );
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json(error.message, error.status);
  if (error instanceof ZodError)
    return json(error.issues.map((i) => i.message).join("; "), 422);
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ requestId, event: "request_failed" }));
  return json("Permintaan gagal diproses. Silakan coba lagi.", 500, requestId);
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 100_000)
    throw new HttpError(413, "Data terlalu besar.");
  const text = await request.text();
  if (text.length > 100_000) throw new HttpError(413, "Data terlalu besar.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Format JSON tidak valid.");
  }
}

/** Preserve business exceptions; never expose SQL details or accept a missing receipt. */
export function rpcData(
  r: { data: unknown; error: { code?: string; message: string } | null },
  mutation = false,
) {
  if (r.error) {
    const e = r.error;
    if (!e.code || ["57014", "08000", "08006"].includes(e.code))
      throw new HttpError(
        503,
        mutation
          ? "Hasil perubahan belum dapat dipastikan. Muat ulang dan periksa hasil sebelum mencoba lagi."
          : "Data belum dapat dimuat. Silakan coba lagi.",
      );
    throw new HttpError(
      e.code === "P0001" && e.message.includes("CONFLICT")
        ? 409
        : e.code === "P0001" && e.message.startsWith("AUTH")
          ? 403
          : 422,
      e.code === "P0001"
        ? e.message
        : "Permintaan ditolak. Periksa isian dan muat ulang data.",
    );
  }
  if (r.data === null || r.data === undefined)
    throw new HttpError(
      503,
      mutation
        ? "Hasil perubahan belum dapat dipastikan. Muat ulang dan periksa hasil."
        : "Data belum dapat dimuat. Silakan coba lagi.",
    );
  return r.data;
}
