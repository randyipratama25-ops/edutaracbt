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
