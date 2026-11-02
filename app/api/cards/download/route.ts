import { z } from "zod";
import { operator } from "../../../../lib/operations/server";
import { failure, HttpError, rpcData } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await operator();
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const r = await a.client.rpc("card_command", {
      input: { action: "download", job_id: id },
    });
    const receipt = z.object({ path: z.string().min(1) }).safeParse(rpcData(r));
    if (!receipt.success)
      throw new HttpError(
        503,
        "Unduhan belum tersedia. Muat ulang daftar kartu.",
      );
    const s = await a.client.storage
      .from("exam-cards")
      .createSignedUrl(receipt.data.path, 60, { download: true });
    if (s.error || !s.data?.signedUrl)
      throw new HttpError(503, "Unduhan belum tersedia. Silakan coba lagi.");
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
