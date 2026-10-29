import { after } from "next/server";
import { z } from "zod";
import { operator } from "../../../lib/operations/server";
import { cardCreate } from "../../../lib/operations/schema";
import { processCards } from "../../../lib/operations/cards";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function GET() {
  try {
    const a = await operator();
    const r = await a.client.rpc("card_command", { input: { action: "list" } });
    if (r.error) throw new HttpError(403, r.error.message);
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await operator();
    const raw = await body(request);
    const input =
      raw.action === "retry"
        ? z.object({ action: z.literal("retry"), job_id: z.uuid() }).parse(raw)
        : cardCreate.parse(raw);
    const r = await a.client.rpc("card_command", {
      input:
        input.action === "retry"
          ? { action: "download", job_id: input.job_id }
          : input,
    });
    if (input.action !== "retry" && r.error)
      throw new HttpError(422, r.error.message);
    const id = input.action === "retry" ? input.job_id : r.data.id;
    // claim performs fresh scope/lease validation for retries; no protected data leaves the worker on denial.
    after(() =>
      processCards(a.client, id, new URL("/login", request.url).href),
    );
    return json({ id, queued: true });
  } catch (e) {
    return failure(e);
  }
}
