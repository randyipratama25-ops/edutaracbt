import { z } from "zod";
import { operator } from "../../../lib/operations/server";
import { resultData } from "../../../lib/results/server";
import {
  operationReceipt,
  operationOptionsSchema,
  monitorRowsSchema,
  sentNotificationsSchema,
  monitorHistorySchema,
} from "../../../lib/operations/contracts";
import { roomActions } from "../../../lib/operations/rooms";
import { operation } from "../../../lib/operations/schema";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
export async function GET(request: Request) {
  try {
    const s = new URL(request.url).searchParams;
    const action = z
      .enum([
        "options",
        "rooms",
        "monitor",
        "inbox",
        "inbox_page",
        "sent",
        "history",
      ])
      .parse(s.get("action") || "options");
    const a = await operator(action === "inbox" || action === "inbox_page");
    if (action === "rooms" && (a.role !== "admin" || a.context !== "staff"))
      throw new HttpError(403, "Hanya Admin mengelola ruang dan penugasan.");
    const input = {
      action,
      exam_id: s.get("exam") ? z.uuid().parse(s.get("exam")) : undefined,
      id: s.get("id") ? z.uuid().parse(s.get("id")) : undefined,
      room_id: s.get("room") ? z.uuid().parse(s.get("room")) : undefined,
      search: (s.get("search") || "").slice(0, 150),
      ...(action === "inbox_page"
        ? {
            page: z.coerce
              .number()
              .int()
              .min(1)
              .max(100000)
              .parse(s.get("page") || 1),
            filter: z.enum(["all", "unread"]).parse(s.get("filter") || "all"),
          }
        : {}),
    };
    if (["rooms", "monitor"].includes(action) && !input.exam_id)
      throw new HttpError(422, "Pilih ujian terlebih dahulu.");
    if (action === "history" && !input.id)
      throw new HttpError(422, "Attempt riwayat wajib.");
    const r = await a.client.rpc("ops_command", { input });
    const data = resultData(r);
    const schema =
      action === "options"
        ? operationOptionsSchema
        : action === "monitor"
          ? monitorRowsSchema
          : action === "sent"
            ? sentNotificationsSchema
            : action === "history"
              ? monitorHistorySchema
              : null;
    if (schema && !schema.safeParse(data).success)
      throw new HttpError(
        503,
        "Data operasional belum dapat dimuat. Coba muat ulang.",
      );
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = operation.parse(await body(request));
    const a = await operator(
      input.action === "read" || input.action === "read_batch",
    );
    if (
      (roomActions as readonly string[]).includes(input.action) &&
      (a.role !== "admin" || a.context !== "staff")
    )
      throw new HttpError(403, "Hanya Admin mengelola ruang dan penugasan.");
    const r = await a.client.rpc("ops_command", { input });
    if (r.error && ["23503", "23505"].includes(r.error.code || ""))
      throw new HttpError(
        422,
        r.error.code === "23503"
          ? "Data masih dirujuk roster/penugasan; riwayat tidak dihapus."
          : r.error.code === "23505"
            ? "Data, peserta atau tugas sudah terdaftar. Periksa kembali pilihan Anda."
            : r.error.message,
      );
    const receipt = resultData(r, true);
    if ((roomActions as readonly string[]).includes(input.action)) {
      if (
        receipt &&
        typeof receipt === "object" &&
        "saved" in receipt &&
        receipt.saved === false
      )
        throw new HttpError(
          409,
          "CONFLICT: Data tidak tersedia; muat ulang daftar.",
        );
      if (!operationReceipt(input.action).safeParse(receipt).success)
        throw new HttpError(
          503,
          "Hasil perubahan belum dapat dipastikan. Muat ulang daftar dan periksa hasil.",
        );
    }
    if (["reset", "unlock", "disqualify", "broadcast"].includes(input.action)) {
      const valid = operationReceipt(input.action).safeParse(receipt);
      if (
        !valid.success ||
        ("attempts" in input &&
          (!Array.isArray(receipt) || receipt.length !== input.attempts.length))
      )
        throw new HttpError(
          503,
          "Hasil tindakan belum dapat dipastikan. Muat ulang monitor dan periksa riwayat sebelum mencoba lagi.",
        );
    }
    return json(receipt);
  } catch (e) {
    return failure(e);
  }
}
