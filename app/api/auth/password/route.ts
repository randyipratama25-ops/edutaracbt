import { z } from "zod";
import { db } from "../../../../lib/supabase/server";
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
    const input = z
      .object({ password: z.string().min(12).max(128) })
      .parse(await body(request));
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new HttpError(401, "Sesi pemulihan tidak valid.");
    const { error } = await client.auth.updateUser({
      password: input.password,
    });
    if (error) throw error;
    await client.auth.signOut({ scope: "global" });
    return json({ message: "Password diperbarui. Silakan masuk kembali." });
  } catch (error) {
    return failure(error);
  }
}
