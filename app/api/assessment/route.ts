import { z } from "zod";
import { staff } from "../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
  rpcData,
} from "../../../lib/http";
import { assessmentCommand } from "../../../lib/assessment/schema";

export async function GET(request: Request) {
  try {
    const actor = await staff();
    const params = new URL(request.url).searchParams;
    const action = z
      .enum(["list", "detail", "moderations", "publications"])
      .parse(params.get("action") || "list");
    const attempt = params.get("attempt");
    const exam = params.get("exam");
    const input = {
      action,
      ...(action === "list"
        ? {
            page: z.coerce
              .number()
              .int()
              .min(1)
              .max(10000)
              .parse(params.get("page") || "1"),
          }
        : {}),
      ...(action === "detail" || attempt
        ? { attempt_id: z.uuid().parse(attempt) }
        : {}),
      ...(exam ? { exam_id: z.uuid().parse(exam) } : {}),
    };
    const result = await actor.client
      .rpc("assessment_command", { input })
      .abortSignal(AbortSignal.timeout(15000));
    return json(rpcData(result));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const actor = await staff();
    const input = assessmentCommand.parse(await body(request));
    if (["schedule", "cancel"].includes(input.action) && actor.role !== "admin")
      throw new HttpError(403, "Publikasi hanya Admin.");
    const result = await actor.client.rpc("assessment_command", { input });
    return json(rpcData(result, true));
  } catch (error) {
    return failure(error);
  }
}
