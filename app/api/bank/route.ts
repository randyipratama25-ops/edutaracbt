import { z } from "zod";
import { staff } from "../../../lib/results/server";
import {
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";
import { readBounded } from "../../../lib/operations/media";
import { bankCommand } from "../../../lib/bank/schema";
import {
  bankQuery,
  bankListFor,
  bankDetailSchema,
  bankQualitySchema,
  bankReceipt,
} from "../../../lib/bank/contracts";
import { resultDetailSchema } from "../../../lib/results/contracts";
import { analyze } from "../../../lib/results/analytics";
export async function GET(request: Request) {
  try {
    const a = await staff();
    let input: ReturnType<typeof bankQuery>;
    try {
      input = bankQuery(new URL(request.url).searchParams);
    } catch (e) {
      if (e instanceof z.ZodError) throw e;
      throw new HttpError(422, "Pilih soal terlebih dahulu.");
    }
    const raw = rpcData(await a.client.rpc("bank_command", { input }));
    if (input.action === "quality") {
      const parsed = z.array(resultDetailSchema).max(300).safeParse(raw);
      if (!parsed.success)
        throw new HttpError(503, "Data kualitas soal belum dapat dimuat.");
      const result = analyze(parsed.data);
      return json(
        bankQualitySchema.parse({
          eligible: result.eligible,
          items: result.items,
        }),
      );
    }
    const schema =
      input.action === "list" ? bankListFor(input.page) : bankDetailSchema;
    if (!schema.safeParse(raw).success)
      throw new HttpError(
        503,
        "Data bank soal belum dapat dimuat lengkap. Coba muat ulang.",
      );
    return json(raw);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (Number(request.headers.get("content-length") || 0) > 5_000_000)
      throw new HttpError(413, "Maksimal 5 MB.");
    const bytes = await readBounded(request.body, 5_000_000).catch(() => {
      throw new HttpError(413, "Maksimal 5 MB.");
    });
    let value;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpError(400, "Format JSON tidak valid.");
    }
    const input = bankCommand.parse(value),
      result = rpcData(
        await a.client.rpc("bank_command", { input }),
        input.action !== "preview",
      );
    if (!bankReceipt(input).safeParse(result).success)
      throw new HttpError(
        503,
        input.action === "preview"
          ? "Kandidat belum dapat diperiksa lengkap. Coba lagi."
          : "Hasil perubahan belum dapat dipastikan. Periksa hasil sebelum mencoba lagi.",
      );
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
