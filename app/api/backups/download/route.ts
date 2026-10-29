import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import { failure, HttpError } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const q = new URL(request.url).searchParams,
      id = z.uuid().parse(q.get("id"));
    const r = await a.client.rpc("system_command", {
      input: { action: "parts", id },
    });
    if (r.error) throw new HttpError(403, r.error.message);
    const number = q.get("part");
    const path =
      number === null
        ? `${a.organization_id}/${id}/manifest.json`
        : r.data.find((p: { number: number }) => p.number === Number(number))
            ?.path;
    if (!path) throw new HttpError(404, "Bagian tidak tersedia.");
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
