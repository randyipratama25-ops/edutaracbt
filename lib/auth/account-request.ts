export const recoveryAcceptedMessage =
  "Jika akun tersedia, petunjuk pemulihan akan dikirim ke email yang terdaftar.";
export const activationErrorMessage =
  "Tautan aktivasi atau pemulihan tidak valid atau sudah kedaluwarsa. Gunakan tautan terbaru, minta Admin mengirim ulang undangan, atau pilih Lupa password.";
export function loginDestination(context: string) {
  return context === "supervisor"
    ? "/supervisor"
    : context === "student"
      ? "/student"
      : "/dashboard";
}
export class AccountRequestError extends Error {}
const uncertain = (action: "login" | "recover") =>
  action === "recover"
    ? "Hasil permintaan belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba kembali."
    : "Hasil login belum dapat dipastikan. Muat ulang halaman atau coba masuk kembali.";
/** One request, no automatic retry: recovery may already have sent an email. */
export async function accountRequest(
  action: "login" | "recover",
  input: object,
  controller: AbortController,
) {
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
      throw new AccountRequestError(uncertain(action));
    }
    if (!response.ok) {
      const message = result?.error?.message;
      throw new AccountRequestError(
        typeof message === "string" && message.trim() && message.length <= 500
          ? message
          : "Layanan akun belum dapat memproses permintaan. Coba lagi nanti.",
      );
    }
    if (
      result?.success !== true ||
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    )
      throw new AccountRequestError(uncertain(action));
    return result.data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(uncertain(action));
  } finally {
    clearTimeout(timer);
  }
}
