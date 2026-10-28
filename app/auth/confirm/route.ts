import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { db } from "../../../lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = await db();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let valid = false;
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    valid = !error;
  } else if (hash && ["invite", "recovery"].includes(type || "")) {
    const { error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: type as EmailOtpType,
    });
    valid = !error;
  }
  return NextResponse.redirect(
    new URL(valid ? "/auth/reset" : "/login?error=activation", url.origin),
  );
}
