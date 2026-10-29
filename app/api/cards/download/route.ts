import { z } from "zod";
import { operator } from "../../../../lib/operations/server";
import { failure, HttpError } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await operator();
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const r = await a.client.rpc("card_command", {
      input: { action: "download", job_id: id },
    });
    if (r.error) throw new HttpError(403, r.error.message);
    const s = await a.client.storage
      .from("exam-cards")
      .createSignedUrl(r.data.path, 60, { download: true });
    if (s.error) throw new HttpError(403, "Unduhan ditolak.");
    return new Response(null, {
      status: 302,
      headers: {
        Location: s.data.signedUrl,
        "Cache-Control": "private,no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
