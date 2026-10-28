import { z } from "zod";
import { gateway } from "../../../../lib/auth/gateway";
import { username } from "../../../../lib/domain/validation";
import { body, failure, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = z.object({ username }).parse(await body(request));
    await gateway({ action: "recover", ...input });
    return json({
      message:
        "Jika akun tersedia, petunjuk pemulihan akan dikirim ke email yang terdaftar.",
    });
  } catch (error) {
    return failure(error);
  }
}
