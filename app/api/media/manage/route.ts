import { z } from "zod";
import { staff, resultData } from "../../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff(),
      p = new URL(request.url).searchParams;
    const input = {
      action: p.get("cleanup") === "1" ? "cleanup_list" : "list",
      page: z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(p.get("page") || 1),
      mime: z.enum(["", "image/", "audio/"]).parse(p.get("mime") || ""),
      search: (p.get("search") || "").slice(0, 100),
    };
    return json(resultData(await a.client.rpc("media_command", { input })));
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
    resultData(r, true);
    const receipt = z
      .object({ path: z.string().min(1), cleanup_id: z.uuid().optional() })
      .safeParse(r.data);
    if (
      !receipt.success ||
      (input.action === "delete" && !receipt.data.cleanup_id)
    )
      throw new HttpError(
        503,
        "Hasil penghapusan belum pasti. Muat ulang media dan pembersihan sebelum mencoba lagi.",
      );
    const ticket =
      input.action === "delete" ? receipt.data.cleanup_id! : input.id;
    let pending = true;
    try {
      const removed = await a.client.storage
        .from("exam-media")
        .remove([receipt.data.path]);
      if (!removed.error) {
        const done = await a.client.rpc("media_command", {
          input: { action: "cleanup_done", id: ticket },
        });
        pending =
          !!done.error ||
          !z.object({ path: z.literal(receipt.data.path) }).safeParse(done.data)
            .success;
      }
    } catch {
      /* The database cleanup ticket remains retryable even if Storage/transport fails. */
    }
    return json({
      deleted: true,
      cleanup_pending: pending,
      message: pending
        ? "Referensi dihapus; pembersihan tercatat dan perlu dicoba kembali."
        : "Media dihapus.",
    });
  } catch (e) {
    return failure(e);
  }
}
