import { actor } from "../../../../lib/auth/actor";
import { gateway } from "../../../../lib/auth/gateway";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(403, "Akses ditolak.");
    const params = new URL(request.url).searchParams;
    const page = Math.max(
      1,
      Math.min(10000, Math.trunc(Number(params.get("page")) || 1)),
    );
    const q = (params.get("q") || "")
      .replace(/[^\p{L}\p{N}_. -]/gu, "")
      .slice(0, 80);
    let query = a.client
      .from("profiles")
      .select("id,username,full_name,role,active,archived_at", {
        count: "exact",
      });
    if (a.role === "teacher") query = query.eq("role", "student");
    if (q) query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
    const role = params.get("role");
    if (role && ["admin", "teacher", "supervisor", "student"].includes(role))
      query = query.eq("role", role);
    const active = params.get("active");
    if (active === "true" || active === "false")
      query = query.eq("active", active === "true");
    const { data, error, count } = await query
      .order("username", { ascending: params.get("sort") !== "desc" })
      .range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    return json({ rows: data, count, page, canManage: a.role === "admin" });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "staff") throw new HttpError(403, "Akses ditolak.");
    const payload = await body(request);
    if (["invitation_info", "resend_invitation"].includes(payload.operation) && a.role !== "admin")
      throw new HttpError(403, "Hanya Admin yang dapat mengirim ulang undangan.");
    const {
      data: { session },
    } = await a.client.auth.getSession();
    if (!session) throw new HttpError(401, "Sesi kedaluwarsa.");
    const result = await gateway(
      { ...payload, action: "manage_user" },
      session.access_token,
    );
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
