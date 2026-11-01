import { NextResponse } from "next/server";
import { db } from "../../../lib/supabase/server";
import { homeCallback } from "../../../lib/auth/home-callback";
export async function GET(request: Request) {
  const url = new URL(request.url);
  let valid = false;
  try {
    const callback = homeCallback(url.search, "");
    if (
      callback.kind === "redirect" &&
      callback.href.startsWith("/auth/confirm?")
    ) {
      const client = await db();
      const code = url.searchParams.get("code"),
        token_hash = url.searchParams.get("token_hash"),
        type = url.searchParams.get("type");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        valid = !error;
      } else if (token_hash && (type === "invite" || type === "recovery")) {
        const { error } = await client.auth.verifyOtp({ token_hash, type });
        valid = !error;
      }
    }
  } catch {
    /* Provider/network failures use the same safe login feedback as rejected links. */
  }
  const response = NextResponse.redirect(
    new URL(valid ? "/auth/reset" : "/login?error=activation", url.origin),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
