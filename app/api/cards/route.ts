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
  rpcData,
} from "../../../lib/http";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function GET() {
  try {
    const a = await operator();
    return json(
      rpcData(
        await a.client.rpc("card_command", { input: { action: "list" } }),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await operator(),
      raw = await body(request);
    const input =
      raw?.action === "retry"
        ? z.object({ action: z.literal("retry"), job_id: z.uuid() }).parse(raw)
        : cardCreate.parse(raw);
    const created =
      input.action === "create"
        ? rpcData(await a.client.rpc("card_command", { input }), true)
        : { id: input.job_id };
    const receipt = z.object({ id: z.uuid() }).safeParse(created);
    if (!receipt.success)
      throw new HttpError(
        503,
        "Hasil pembuatan belum dapat dipastikan. Periksa daftar kartu.",
      );
    const id = receipt.data.id;
    const claim = rpcData(
      await a.client.rpc("card_command", {
        input: { action: "claim", job_id: id },
      }),
      true,
    );
    if (
      claim &&
      typeof claim === "object" &&
      "ready" in claim &&
      claim.ready === true
    )
      return json({ id, queued: false, state: "ready" });
    if (
      claim &&
      typeof claim === "object" &&
      "busy" in claim &&
      claim.busy === true
    )
      return json({ id, queued: false, state: "running" });
    if (!z.object({ lease: z.uuid() }).safeParse(claim).success)
      throw new HttpError(
        503,
        "Status proses belum dapat dipastikan. Muat ulang daftar kartu.",
      );
    after(() =>
      processCards(a.client, id, new URL("/login", request.url).href, claim),
    );
    return json({ id, queued: true });
  } catch (e) {
    return failure(e);
  }
}
