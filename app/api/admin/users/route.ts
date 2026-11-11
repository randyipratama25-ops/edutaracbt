import { roles } from "../../../../lib/domain/validation";
import { userCommand } from "../../../../lib/users/schema";
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
    query = query.eq("organization_id", a.organization_id);
    const literal = q.replace(/_/g, "\\_");
    if (q)
      query = query.or(
        `username.ilike.%${literal}%,full_name.ilike.%${literal}%`,
      );
    const role = params.get("role");
    if (role && roles.some((value) => value === role))
      query = query.eq("role", role);
    const active = params.get("active");
    if (active === "true" || active === "false")
      query = query.eq("active", active === "true");
    const { data, error, count } = await query
      .order("username", { ascending: params.get("sort") !== "desc" })
      .range((page - 1) * 20, page * 20 - 1)
      .abortSignal(AbortSignal.timeout(15000));
    if (
      error ||
      !Array.isArray(data) ||
      !Number.isSafeInteger(count) ||
      count === null ||
      count < 0
    )
      throw new HttpError(
        503,
        "Daftar pengguna belum dapat dimuat. Coba muat ulang.",
      );
    return json({ rows: data, count, page, canManage: a.role === "admin" });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(403, "Akses ditolak.");
    const payload = userCommand.parse(await body(request));
    if (
      a.role === "teacher" &&
      ((payload.operation !== "create" && payload.operation !== "update") ||
        (payload.operation === "create" && payload.role !== "student") ||
        (payload.operation === "update" && payload.active !== undefined))
    )
      throw new HttpError(403, "Tindakan di luar kewenangan Guru.");
    if (
      ["invitation_info", "resend_invitation"].includes(payload.operation) &&
      a.role !== "admin"
    )
      throw new HttpError(
        403,
        "Hanya Admin yang dapat mengirim ulang undangan.",
      );
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
