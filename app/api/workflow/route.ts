import { z } from "zod";
import { actor } from "../../../lib/auth/actor";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/http";
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
    const { data, error } = await a.client.rpc("workflow_command", {
      input: {
        action,
        ...(p.get("exam") ? { exam_id: z.uuid().parse(p.get("exam")) } : {}),
        ...(p.get("attempt")
          ? { attempt_id: z.uuid().parse(p.get("attempt")) }
          : {}),
      },
    });
    if (error) throw new HttpError(403, error.message);
    return json(data);
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
    if (error)
      throw new HttpError(
        error.message.includes("CONFLICT") ? 409 : 422,
        error.message,
      );
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
