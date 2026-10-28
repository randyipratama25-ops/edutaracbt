import { z } from "zod";
import { db } from "../../../../lib/supabase/server";
import { body, failure, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const x = z
      .object({
        access_token: z.string().min(10).max(10000),
        refresh_token: z.string().min(10).max(10000),
      })
      .parse(await body(request));
    const client = await db();
    const { error } = await client.auth.setSession(x);
    if (error) throw error;
    return json({ ready: true });
  } catch (e) {
    return failure(e);
  }
}
