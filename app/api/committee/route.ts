import { actor } from "../../../lib/auth/actor";
import {
  committeeData,
  committeeDate,
  committeeReceipt,
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
          ? { date: committeeDate.parse(date) }
          : {}),
      },
    });
    const parsed = committeeData.safeParse(rpcData(result));
    if (!parsed.success) throw new HttpError(503, "Jadwal belum dapat dimuat.");
    const data = parsed.data;
    const server_now = new Date().toISOString();
    if (a.context === "committee") {
      if (data.date !== data.today)
        throw new HttpError(503, "Jadwal hari ini belum dapat diverifikasi.");
      return json({
        ...data,
        server_now,
        duties: [],
        candidates: [],
        schedule: data.status === "confirmed" ? data.schedule : [],
        supervisors: data.status === "confirmed" ? data.supervisors : [],
      });
    }
    return json({ ...data, server_now });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await committeeActor();
    const input = committeeMutation.parse(await body(request));
    const adminAction = [
      "assign",
      "confirm_committee",
      "replace_committee",
    ].includes(input.action);
    if (adminAction !== (a.context === "staff"))
      throw new HttpError(403, "Tindakan ini berada di luar kewenangan Anda.");
    const result = await a.client.rpc("committee_command", { input });
    if (result.error?.code === "23505")
      throw new HttpError(
        409,
        "Petugas sudah memiliki tugas pada tanggal ini. Muat ulang daftar.",
      );
    const parsed = committeeReceipt.safeParse(rpcData(result, true));
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
