import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import { failure, HttpError } from "../../../../lib/http";
export async function GET(request: Request) {
  try {
    const a = await staff();
    const job_id = z.uuid().parse(new URL(request.url).searchParams.get("job"));
    const r = await a.client.rpc("report_command", {
      input: { action: "download", job_id },
    });
    if (r.error) throw new HttpError(403, r.error.message);
    const signed = await a.client.storage
      .from("exam-reports")
      .createSignedUrl(r.data.path, 60, {
        download: `edutara-${r.data.kind}.${r.data.format}`,
      });
    if (signed.error) throw new HttpError(403, "Unduhan tidak tersedia.");
    return Response.redirect(signed.data.signedUrl, 302);
  } catch (e) {
    return failure(e);
  }
}
