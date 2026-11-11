import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import {
  committeeData,
  committeeMutation,
} from "../../../lib/committee/contracts";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";

async function committeeActor() {
  const a = await actor();
  if (
    !a ||
    !(
      a.context === "committee" ||
      (a.context === "staff" && a.role === "admin")
    )
  )
    throw new HttpError(403, "Akses Panitia Ujian diperlukan.");
  return a;
}

export async function GET(request: Request) {
  try {
    const a = await committeeActor();
    const date = new URL(request.url).searchParams.get("date");
    const result = await a.client.rpc("committee_command", {
      input: {
        action: "list",
        ...(a.role === "admin" && date
          ? { date: z.iso.date().parse(date) }
          : {}),
      },
    });
    const parsed = committeeData.safeParse(rpcData(result));
    if (!parsed.success) throw new HttpError(503, "Jadwal belum dapat dimuat.");
    return json(parsed.data);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await committeeActor();
    const input = committeeMutation.parse(await body(request));
    const result = await a.client.rpc("committee_command", { input });
    if (result.error?.code === "23505")
      throw new HttpError(
        409,
        "Petugas sudah memiliki tugas pada tanggal ini. Muat ulang daftar.",
      );
    const parsed = z
      .object({ saved: z.literal(true) })
      .safeParse(rpcData(result, true));
    if (!parsed.success)
      throw new HttpError(
        503,
        "Periksa daftar untuk memastikan perubahan tersimpan.",
      );
    return json(parsed.data);
  } catch (error) {
    return failure(error);
  }
}
