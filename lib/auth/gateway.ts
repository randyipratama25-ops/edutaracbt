import "server-only";
import { HttpError } from "../http";
export async function gateway(payload: unknown, token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new HttpError(503, "Konfigurasi layanan belum tersedia.");
  const response = await fetch(`${url}/functions/v1/identity-gateway`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new HttpError(
      response.status,
      result.error || "Layanan akun tidak dapat memproses permintaan.",
    );
  return result;
}
