import { z } from "zod";
import { operator } from "../../../lib/operations/server";
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
      .enum(["options", "rooms", "monitor", "inbox", "sent", "history"])
      .parse(s.get("action") || "options");
    const a = await operator(action === "inbox");
    const input = {
      action,
      exam_id: s.get("exam") ? z.uuid().parse(s.get("exam")) : undefined,
      id: s.get("id") ? z.uuid().parse(s.get("id")) : undefined,
      room_id: s.get("room") ? z.uuid().parse(s.get("room")) : undefined,
      search: (s.get("search") || "").slice(0, 150),
    };
    const r = await a.client.rpc("ops_command", { input });
    if (r.error) throw new HttpError(403, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = operation.parse(await body(request));
    const a = await operator(input.action === "read");
    const r = await a.client.rpc("ops_command", { input });
    if (r.error)
      throw new HttpError(
        422,
        r.error.code === "23503"
          ? "Data masih dirujuk roster/penugasan; riwayat tidak dihapus."
          : r.error.code === "23505"
            ? "Data, peserta atau tugas sudah terdaftar. Periksa kembali pilihan Anda."
            : r.error.message,
      );
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
