import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a) throw new HttpError(401, "Silakan masuk.");
    const x = z
      .object({
        operation: z.enum(["upload", "read"]),
        name: z.string().regex(/^[a-zA-Z0-9._-]{1,120}$/),
        path: z.string().optional(),
      })
      .parse(await body(request));
    const path =
      x.operation === "upload"
        ? `${a.id}/${crypto.randomUUID()}-${x.name}`
        : x.path;
    if (!path || (!path.startsWith(`${a.id}/`) && a.role !== "admin"))
      throw new HttpError(403, "Akses file ditolak.");
    const result =
      x.operation === "upload"
        ? await a.client.storage.from("exam-media").createSignedUploadUrl(path)
        : await a.client.storage.from("exam-media").createSignedUrl(path, 60);
    if (result.error) throw new HttpError(422, "Akses media gagal.");
    return json(result.data);
  } catch (e) {
    return failure(e);
  }
}
