import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
import { resultData } from "../../../lib/results/server";
import {
  signalsSchema,
  helpListSchema,
} from "../../../lib/operations/contracts";
import { workflowCommand } from "../../../lib/workflow/schema";
export async function GET(request: Request) {
  try {
    const a = await actor();
    if (!a) throw new HttpError(401, "Silakan masuk kembali.");
    const p = new URL(request.url).searchParams;
    const action = z
      .enum(["preparation", "signals", "help_list"])
      .parse(p.get("action") || "preparation");
    if (
      action === "preparation" &&
      (a.context !== "staff" || !["admin", "teacher"].includes(a.role))
    )
      throw new HttpError(403, "Akses staf diperlukan.");
    if (action === "signals" && a.context === "student")
      throw new HttpError(403, "Akses petugas diperlukan.");
    if (action === "signals" && !p.get("exam"))
      throw new HttpError(422, "Pilih ujian terlebih dahulu.");
    const { data, error } = await a.client.rpc("workflow_command", {
      input: {
        action,
        ...(p.get("exam") ? { exam_id: z.uuid().parse(p.get("exam")) } : {}),
        ...(p.get("attempt")
          ? { attempt_id: z.uuid().parse(p.get("attempt")) }
          : {}),
      },
    });
    const value = resultData({ data, error });
    const schema =
      action === "signals"
        ? signalsSchema
        : action === "help_list"
          ? helpListSchema
          : null;
    if (schema && !schema.safeParse(value).success)
      throw new HttpError(
        503,
        "Status pelaksanaan belum dapat dimuat. Coba muat ulang.",
      );
    return json(value);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = workflowCommand.parse(await body(request));
    const a = await actor();
    if (!a) throw new HttpError(401, "Silakan masuk kembali.");
    if (
      input.action === "import_preview"
        ? a.context !== "staff" || !["admin", "teacher"].includes(a.role)
        : input.action === "help"
          ? a.context !== "student"
          : input.action === "resolve"
            ? a.context === "student"
            : a.context !== "staff" || a.role !== "admin"
    )
      throw new HttpError(403, "Anda tidak memiliki izin tindakan ini.");
    const { data, error } = await a.client.rpc("workflow_command", { input });
    if (error?.message.startsWith("CONFLICT:"))
      throw new HttpError(409, error.message);
    const value = resultData({ data, error }, true);
    const schema =
      input.action === "resolve"
        ? z.object({ resolved: z.literal(true) })
        : input.action === "extend"
          ? z.object({
              deadline_at: z
                .string()
                .refine((v) => Number.isFinite(Date.parse(v))),
              minutes: z.literal(input.minutes),
            })
          : null;
    if (schema && !schema.safeParse(value).success)
      throw new HttpError(
        503,
        "Hasil tindakan belum dapat dipastikan. Muat ulang status sebelum mencoba lagi.",
      );
    return json(value);
  } catch (e) {
    return failure(e);
  }
}
