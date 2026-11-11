import {feedbackFetch} from "../client/feedback-transport";
export const recoveryAcceptedMessage =
  "Jika akun tersedia, petunjuk pemulihan akan dikirim ke email yang terdaftar.";
export const activationErrorMessage =
  "Tautan aktivasi atau pemulihan tidak valid atau sudah kedaluwarsa. Gunakan tautan terbaru, minta Admin mengirim ulang undangan, atau pilih Lupa password.";
export function loginDestination(context: string) {
  if (context === "committee") return "/committee";
  return context === "supervisor"
    ? "/supervisor"
    : context === "student"
      ? "/student"
      : "/dashboard";
}
export class AccountRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
type AccountAction = "login" | "recover" | "activate" | "password";
const uncertain = (action: AccountAction, readOnly = false) =>
  readOnly
    ? "Sesi belum dapat diperiksa. Periksa koneksi dan coba periksa sesi lagi."
    : action === "activate"
      ? "Verifikasi tautan belum dapat dipastikan. Gunakan tautan terbaru atau minta tautan baru."
      : action === "password"
        ? "Hasil perubahan password belum dapat dipastikan. Coba masuk dengan password baru sebelum mengulang."
        : action === "recover"
          ? "Hasil permintaan belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba kembali."
          : "Hasil login belum dapat dipastikan. Muat ulang halaman atau coba masuk kembali.";
/** One request, no automatic retry: recovery may already have sent an email. */
export async function accountRequest(
  action: AccountAction,
  input: object | undefined,
  controller: AbortController,
) {
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await feedbackFetch(`/api/auth/${action}`, {
      method: input === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: input === undefined ? undefined : JSON.stringify(input),
      cache: "no-store",
      signal: controller.signal,
    });
    let result: {
      success?: unknown;
      data?: unknown;
      error?: { message?: unknown };
    } | null;
    try {
      result = await response.json();
    } catch {
      throw new AccountRequestError(uncertain(action, input === undefined));
    }
    if (!response.ok) {
      const message = result?.error?.message;
      throw new AccountRequestError(
        typeof message === "string" && message.trim() && message.length <= 500
          ? message
          : "Layanan akun belum dapat memproses permintaan. Coba lagi nanti.",
        response.status,
      );
    }
    if (
      result?.success !== true ||
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    )
      throw new AccountRequestError(uncertain(action, input === undefined));
    return result.data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(uncertain(action, input === undefined));
  } finally {
    clearTimeout(timer);
  }
}
