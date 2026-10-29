import { cookies } from "next/headers";
import { db } from "../../../../lib/supabase/server";
import { failure, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const client = await db();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    (await cookies()).delete("edutara_context");
    return json({ next: "/login" });
  } catch (error) {
    return failure(error);
  }
}
