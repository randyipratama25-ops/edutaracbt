import type { z } from "zod";
import { clientRequest } from "../client/request";
export { ClientRequestError as UserRequestError } from "../client/request";
/** Account-specific messages on the shared bounded transport. */
export function userRequest<T>(
  url: string,
  input: object | undefined,
  schema: z.ZodType<T>,
  controller: AbortController,
  mutation = false,
): Promise<T> {
  const operation = (input as { operation?: string } | undefined)?.operation;
  return clientRequest(url, input, schema, controller, {
    mutation,
    uncertainMessage:
      operation === "resend_invitation"
        ? "Hasil pengiriman belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba lagi."
        : "Hasil perubahan belum dapat dipastikan. Muat ulang daftar dan periksa akun sebelum mencoba lagi.",
    partial: (error) =>
      operation === "create" &&
      error instanceof Error &&
      /undangan|profil gagal|penempatan kelas gagal/i.test(error.message),
  });
}
