import { actor } from "../../../lib/auth/actor";
import {
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";
import { examListSchema, parseAttempt } from "../../../lib/attempts/contracts";
import { attemptCommand } from "../../../lib/attempts/validation";
function attemptResponse(data: unknown) {
  try {
    return parseAttempt(data);
  } catch {
    throw new HttpError(
      503,
      "Status ujian belum dapat dipastikan. Periksa status sebelum mengulang.",
    );
  }
}
async function student() {
  const a = await actor();
  if (!a || a.context !== "student" || a.role !== "student")
    throw new HttpError(403, "Silakan masuk sebagai siswa.");
  return a;
}
export async function GET() {
  try {
    const a = await student();
    const { data, error } = await a.client.rpc("attempt_command", {
      input: { action: "list" },
    });
    const parsed = examListSchema.safeParse(rpcData({ data, error }));
    if (!parsed.success)
      throw new HttpError(503, "Daftar ujian belum dapat dimuat. Coba lagi.");
    return json(parsed.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await student();
    if (Number(request.headers.get("content-length") || 0) > 2_000_000)
      throw new HttpError(413, "Batch terlalu besar.");
    const text = await request.text();
    if (text.length > 2_000_000)
      throw new HttpError(413, "Batch terlalu besar.");
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "JSON tidak valid.");
    }
    const input = attemptCommand.parse(raw);
    if (input.action === "save") {
      // Supplemental recovery must never block canonical autosave.
      try {
        const backup = await a.client.rpc("attempt_recovery", {
          input: { ...input, action: "stage" },
        });
        if (backup.error)
          console.error(JSON.stringify({ event: "draft_backup_unavailable" }));
      } catch {
        console.error(JSON.stringify({ event: "draft_backup_unavailable" }));
      }
    }
    const { data, error } = await a.client.rpc("attempt_command", { input });
    if (error) {
      if (
        error.message.includes("CONFLICT") ||
        error.message.startsWith("AUTH")
      )
        throw new HttpError(
          error.message.includes("CONFLICT") ? 409 : 403,
          error.message,
        );
      rpcData({ data, error }, true);
    }
    if (data?.error) throw new HttpError(data.status || 422, data.error);
    if (
      ["start", "resume", "takeover"].includes(input.action) &&
      data?.status === "in_progress" &&
      !data.finalized_at
    ) {
      let recovery = null;
      try {
        const result = await a.client.rpc("attempt_recovery", {
          input: {
            action: "list",
            attempt_id: data.id,
            client_id: input.client_id,
            epoch: data.epoch,
          },
        });
        if (!result.error) recovery = result.data;
      } catch {
        console.error(JSON.stringify({ event: "draft_recovery_unavailable" }));
      }
      return json(attemptResponse({ ...data, recovery }));
    }
    if (["start", "resume", "takeover", "submit"].includes(input.action))
      return json(attemptResponse(data));
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
