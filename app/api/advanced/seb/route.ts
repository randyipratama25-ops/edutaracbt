import { staff } from "../../../../lib/results/server";
import { failure, HttpError } from "../../../../lib/http";
import { pilotConfig } from "../../../../lib/advanced/seb";
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const xml = pilotConfig(new URL(request.url).origin);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/seb",
        "Content-Disposition":
          'attachment; filename="edutara-uji-kompatibilitas.seb"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
