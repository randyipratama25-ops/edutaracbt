import type { z } from "zod";
import { api, ApiError } from "../../components/operations/shared";
export class ClientRequestError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public status?: number,
  ) {
    super(message);
  }
}
/** Existing API transport with bounded reads/mutations. Never automatically retries a write. */
export async function clientRequest<T>(
  url: string,
  input: object | undefined,
  schema: z.ZodType<T>,
  controller: AbortController,
  options: {
    mutation?: boolean;
    uncertainMessage?: string;
    partial?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const mutation = options.mutation === true;
  if (controller.signal.aborted)
    throw new ClientRequestError("Permintaan dibatalkan.", mutation);
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
    const partialCreate = options.partial?.(error) === true;
    const uncertain =
      mutation && (status === undefined || status >= 500 || partialCreate);
    if (uncertain)
      throw new ClientRequestError(
        options.uncertainMessage ||
          "Hasil perubahan belum dapat dipastikan. Muat ulang data dan periksa hasil sebelum mencoba lagi.",
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
    throw new ClientRequestError(message, false, status);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
