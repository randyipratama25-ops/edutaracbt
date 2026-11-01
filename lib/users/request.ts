import type { z } from "zod";
import { api, ApiError } from "../../components/operations/shared";
export class UserRequestError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public status?: number,
  ) {
    super(message);
  }
}
/** Existing API transport with bounded reads/mutations. Never automatically retries a write. */
export async function userRequest<T>(
  url: string,
  input: object | undefined,
  schema: z.ZodType<T>,
  controller: AbortController,
  mutation = false,
): Promise<T> {
  if (controller.signal.aborted)
    throw new UserRequestError("Permintaan dibatalkan.", mutation);
  const timer = setTimeout(() => controller.abort(), mutation ? 35000 : 20000);
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(Error("Aborted"));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([
      api<unknown>(url, input, {
        signal: controller.signal,
        validateEnvelope: true,
      }).then((d) => schema.parse(d)),
      aborted,
    ]);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    const operation = (input as { operation?: string } | undefined)?.operation;
    const partialCreate =
      operation === "create" &&
      error instanceof Error &&
      /undangan|profil gagal|penempatan kelas gagal/i.test(error.message);
    const uncertain =
      mutation && (status === undefined || status >= 500 || partialCreate);
    if (uncertain)
      throw new UserRequestError(
        operation === "resend_invitation"
          ? "Hasil pengiriman belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba lagi."
          : "Hasil perubahan belum dapat dipastikan. Muat ulang daftar dan periksa akun sebelum mencoba lagi.",
        true,
        status,
      );
    const message =
      status &&
      status < 500 &&
      error instanceof Error &&
      error.message.length <= 500
        ? error.message
        : "Data belum dapat diproses. Periksa koneksi lalu coba lagi.";
    throw new UserRequestError(message, false, status);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
