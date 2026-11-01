import { db } from "../../../../lib/supabase/server";
import { activationTokensSchema } from "../../../../lib/auth/password";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = activationTokensSchema.parse(await body(request));
    const client = await db();
    const { error } = await client.auth.setSession(input);
    if (error)
      throw new HttpError(
        error.status && error.status >= 500 ? 503 : 401,
        "Tautan aktivasi tidak valid atau sudah kedaluwarsa. Gunakan tautan terbaru atau minta tautan baru.",
      );
    return json({ ready: true });
  } catch (error) {
    return failure(error);
  }
}
