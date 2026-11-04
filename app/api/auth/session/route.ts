import {
  isAuthSessionMissingError,
  AuthInvalidJwtError,
} from "@supabase/supabase-js";
import { db } from "../../../../lib/supabase/server";
import { failure, HttpError, json } from "../../../../lib/http";
/** Confirm an auth failure without exposing identity or confusing an outage with expiry. */
export async function GET() {
  try {
    const client = await db();
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (
        isAuthSessionMissingError(error) ||
        error instanceof AuthInvalidJwtError ||
        error.status === 401 ||
        [
          "session_not_found",
          "session_expired",
          "refresh_token_not_found",
          "refresh_token_already_used",
          "bad_jwt",
          "user_not_found",
          "user_banned",
        ].includes(error.code ?? "")
      )
        throw new HttpError(
          401,
          "Sesi tidak tersedia. Masuk kembali untuk melanjutkan.",
        );
      throw new HttpError(
        503,
        "Sesi belum dapat diperiksa. Silakan coba lagi.",
      );
    }
    if (!data.user)
      throw new HttpError(
        401,
        "Sesi tidak tersedia. Masuk kembali untuk melanjutkan.",
      );
    return json({ authenticated: true });
  } catch (e) {
    return failure(e);
  }
}
