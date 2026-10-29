import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff();
    const action =
      new URL(request.url).searchParams.get("cleanup") === "1"
        ? "cleanup_list"
        : "list";
    const r = await a.client.rpc("media_command", {
      input: {
        action,
        page: Math.max(
          1,
          Math.min(
            100000,
            Number(new URL(request.url).searchParams.get("page") || 1),
          ),
        ),
        mime: z
          .enum(["", "image/", "audio/"])
          .parse(new URL(request.url).searchParams.get("mime") || ""),
        search: (new URL(request.url).searchParams.get("search") || "").slice(
          0,
          100,
        ),
      },
    });
    if (r.error) throw new HttpError(403, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    const input = z
      .object({ action: z.enum(["delete", "cleanup"]), id: z.uuid() })
      .parse(await body(request));
    const r = await a.client.rpc("media_command", { input });
    if (r.error) throw new HttpError(422, r.error.message);
    const removed = await a.client.storage
      .from("exam-media")
      .remove([r.data.path]);
    const ticket = input.action === "delete" ? r.data.cleanup_id : input.id;
    if (!removed.error)
      await a.client.rpc("media_command", {
        input: { action: "cleanup_done", id: ticket },
      });
    return json({
      deleted: true,
      cleanup_pending: !!removed.error,
      message: removed.error
        ? "Referensi dihapus; pembersihan tersimpan dan dapat dicoba kembali."
        : "Media dihapus.",
    });
  } catch (e) {
    return failure(e);
  }
}
