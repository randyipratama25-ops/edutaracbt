import { z } from "zod";
import { staff } from "../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
import { systemMutation } from "../../../lib/system/validation";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const p = new URL(request.url).searchParams;
    const action = z
      .enum(["get", "audit", "jobs", "parts"])
      .parse(p.get("action") || "get");
    const input = {
      action,
      id: p.get("id") ? z.uuid().parse(p.get("id")) : undefined,
      page: Math.max(1, Math.min(100000, Number(p.get("page") || 1))),
      search: (p.get("search") || "").slice(0, 100),
      from: p.get("from")
        ? z.iso.datetime({ offset: true }).parse(p.get("from"))
        : undefined,
      until: p.get("until")
        ? z.iso.datetime({ offset: true }).parse(p.get("until"))
        : undefined,
    };
    const r = await a.client.rpc("system_command", { input });
    if (r.error) throw new HttpError(422, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const input = systemMutation.parse(await body(request));
    const r = await a.client.rpc("system_command", { input });
    if (r.error) throw new HttpError(422, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
