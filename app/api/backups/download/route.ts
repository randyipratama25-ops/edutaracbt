import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import { failure, HttpError, rpcData } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const q = new URL(request.url).searchParams,
      id = z.uuid().parse(q.get("id"));
    const r = await a.client.rpc("system_command", {
      input: { action: "parts", id },
    });
    const parts = z
      .array(
        z.object({ number: z.number().int().nonnegative(), path: z.string() }),
      )
      .parse(rpcData(r));
    const rawNumber = q.get("part");
    const number =
      rawNumber === null
        ? null
        : Number(z.string().regex(/^\d+$/).parse(rawNumber));
    if (number !== null && !Number.isSafeInteger(number))
      throw new HttpError(422, "Nomor bagian tidak valid.");
    const path =
      number === null
        ? `${a.organization_id}/${id}/manifest.json`
        : parts.find((p) => p.number === number)?.path;
    if (!path) throw new HttpError(404, "Bagian tidak tersedia.");
    if (!path.startsWith(`${a.organization_id}/${id}/`))
      throw new HttpError(422, "Referensi backup tidak valid.");
    const signed = await a.client.storage
      .from("system-backups")
      .createSignedUrl(path, 60, { download: true });
    if (signed.error) throw new HttpError(403, "Backup tidak tersedia.");
    return new Response(null, {
      status: 302,
      headers: {
        Location: signed.data.signedUrl,
        "Cache-Control": "private,no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
