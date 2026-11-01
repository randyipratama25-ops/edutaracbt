import { cookies } from "next/headers";
import { db } from "../../../../lib/supabase/server";
import { newPasswordSchema } from "../../../../lib/auth/password";
import { z } from "zod";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function GET() {
  try {
    const client = await db();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      throw new HttpError(
        401,
        "Sesi tidak tersedia atau kedaluwarsa. Masuk kembali atau gunakan tautan terbaru.",
      );
    return json({ ready: true });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = z
      .object({ password: newPasswordSchema })
      .parse(await body(request));
    const client = await db();
    const { data, error: sessionError } = await client.auth.getUser();
    if (sessionError || !data.user)
      throw new HttpError(
        401,
        "Sesi pemulihan tidak valid. Masuk kembali atau gunakan tautan terbaru.",
      );
    let update;
    try {
      update = await client.auth.updateUser({ password: input.password });
    } catch {
      throw new HttpError(
        503,
        "Hasil perubahan password belum dapat dipastikan. Coba masuk dengan password baru sebelum mengulang.",
      );
    }
    if (update.error) {
      if (update.error.code === "weak_password")
        throw new HttpError(
          422,
          "Password belum memenuhi kebijakan keamanan. Gunakan password yang lebih kuat.",
        );
      if (update.error.code === "same_password")
        throw new HttpError(
          422,
          "Password baru harus berbeda dari password sebelumnya.",
        );
      if (update.error.status === 401 || update.error.status === 403)
        throw new HttpError(
          401,
          "Sesi tidak valid. Masuk kembali atau gunakan tautan terbaru.",
        );
      throw new HttpError(
        503,
        "Hasil perubahan password belum dapat dipastikan. Coba masuk dengan password baru sebelum mengulang.",
      );
    }
    // A failed audit must not skip global sign-out or misreport a completed password change.
    try {
      const audit = await client.rpc("session_audit", {
        event_name: "PASSWORD_CHANGED",
      });
      if (audit.error)
        console.error(
          JSON.stringify({ event: "password_change_audit_failed" }),
        );
    } catch {
      console.error(JSON.stringify({ event: "password_change_audit_failed" }));
    }
    let signedOut = false;
    try {
      const result = await client.auth.signOut({ scope: "global" });
      signedOut = !result.error;
    } catch {
      /* Report partial completion, never repeat the password mutation. */
    }
    if (signedOut) {
      try {
        (await cookies()).delete("edutara_context");
      } catch {
        console.error(
          JSON.stringify({ event: "password_context_cleanup_failed" }),
        );
      }
    } else
      console.error(
        JSON.stringify({ event: "password_global_signout_unconfirmed" }),
      );
    return json({
      message: signedOut
        ? "Password diperbarui. Silakan masuk kembali."
        : "Password telah diperbarui, tetapi pengakhiran sesi belum dapat dipastikan. Masuk dengan password baru dan hubungi Admin jika sesi lain masih aktif.",
      signed_out: signedOut,
    });
  } catch (error) {
    return failure(error);
  }
}
