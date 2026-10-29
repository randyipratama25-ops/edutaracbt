import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
async function reviewer() {
  const a = await actor();
  if (
    !a ||
    !(
      (a.role === "admin" && a.context === "staff") ||
      a.context === "supervisor"
    )
  )
    throw new HttpError(403, "Akses pengawas atau Admin diperlukan.");
  return a;
}
export async function GET() {
  try {
    const a = await reviewer();
    const r = await a.client.rpc("review_attempt", {
      input: { action: "list" },
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
    const a = await reviewer();
    const input = z
      .object({
        action: z.enum(["events", "disqualify", "unlock"]),
        attempt_id: z.uuid(),
        reason: z.string().trim().min(5).max(1000).optional(),
      })
      .parse(await body(request));
    const r = await a.client.rpc("review_attempt", { input });
    if (r.error) throw new HttpError(422, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
