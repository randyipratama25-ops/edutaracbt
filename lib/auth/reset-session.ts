import { homeCallback } from "./home-callback";
import { accountRequest, AccountRequestError } from "./account-request";
export type ResetSession = {
  phase: "ready" | "redirecting" | "blocked";
  message: string;
  retry: boolean;
};
export async function checkResetSession(
  controller: AbortController,
): Promise<ResetSession> {
  const data = await accountRequest("password", undefined, controller);
  if (data.ready !== true)
    throw Error(
      "Sesi belum dapat diperiksa. Periksa koneksi dan coba periksa sesi lagi.",
    );
  return { phase: "ready", message: "", retry: true };
}
export async function initializeReset(
  controller: AbortController,
): Promise<ResetSession> {
  const marker = new URLSearchParams(window.location.search).get("activation");
  const callback = homeCallback(
    window.location.search,
    window.location.hash,
    "/auth/reset",
  );
  const invalid =
    "Tautan tidak lengkap, tidak valid, atau sudah kedaluwarsa. Gunakan tautan terbaru atau minta pemulihan melalui halaman masuk.";
  if (callback.kind === "invalid") {
    const clean = new URL(callback.cleanHref, window.location.origin);
    clean.searchParams.set("activation", "invalid");
    window.history.replaceState(
      window.history.state,
      "",
      clean.pathname + clean.search,
    );
    return { phase: "blocked", message: invalid, retry: false };
  }
  if (callback.kind === "redirect") {
    if (callback.href.startsWith("/auth/confirm?")) {
      window.location.replace(callback.href);
      return {
        phase: "redirecting",
        message: "Membuka verifikasi tautan…",
        retry: false,
      };
    }
    const params = new URLSearchParams(window.location.hash.slice(1));
    const input = {
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
    };
    // A non-secret marker prevents reload from falling back to an unrelated pre-existing session.
    window.history.replaceState(
      window.history.state,
      "",
      "/auth/reset?activation=pending",
    );
    try {
      const data = await accountRequest("activate", input, controller);
      if (data.ready !== true) throw Error();
      window.history.replaceState(window.history.state, "", "/auth/reset");
      return { phase: "ready", message: "", retry: false };
    } catch (error) {
      return {
        phase: "blocked",
        message:
          error instanceof AccountRequestError
            ? error.message
            : "Verifikasi tautan belum dapat dipastikan. Gunakan tautan terbaru.",
        retry: false,
      };
    }
  }
  if (marker === "pending" || marker === "invalid")
    return { phase: "blocked", message: invalid, retry: false };
  try {
    return await checkResetSession(controller);
  } catch (error) {
    return {
      phase: "blocked",
      message:
        error instanceof AccountRequestError
          ? error.message
          : "Sesi belum dapat diperiksa. Periksa koneksi dan coba periksa sesi lagi.",
      retry: true,
    };
  }
}
