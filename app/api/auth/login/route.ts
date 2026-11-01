import { cookies } from "next/headers";
import { loginDestination } from "../../../../lib/auth/account-request";
import { loginSchema } from "../../../../lib/domain/validation";
import { db } from "../../../../lib/supabase/server";
import { gateway } from "../../../../lib/auth/gateway";
import { body, failure, json, requireOrigin } from "../../../../lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = loginSchema.parse(await body(request));
    const result = await gateway({ action: "login", ...input });
    const client = await db();
    const { error } = await client.auth.setSession(result.session);
    if (error) throw error;
    (await cookies()).set("edutara_context", input.context, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return json({
      next: loginDestination(input.context),
    });
  } catch (error) {
    return failure(error);
  }
}
