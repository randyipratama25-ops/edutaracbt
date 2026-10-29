import { z } from "zod";
import { safeHtml } from "../authoring/schema";
export const answerValue = z.union([
  z.array(z.string().max(100)).max(50),
  z.record(z.string().max(40), z.string().max(10000)),
  z.object({
    text: z.string().max(100000).transform(safeHtml),
    canvas_id: z.uuid().optional(),
  }),
]);
// The essay union member must run first so text HTML is sanitized rather than accepted as a general record.
export const safeAnswer = z.union([
  z.object({
    text: z.string().max(100000).transform(safeHtml),
    canvas_id: z.uuid().optional(),
  }),
  z.array(z.string().max(100)).max(50),
  z.record(z.string().max(40), z.string().max(10000)),
]);
const writer = {
  attempt_id: z.uuid(),
  client_id: z.uuid(),
  epoch: z.number().int().positive(),
};
export const attemptCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    exam_id: z.uuid(),
    pin: z.string().regex(/^[0-9]{4,12}$/),
    client_id: z.uuid(),
  }),
  z.object({
    action: z.literal("resume"),
    attempt_id: z.uuid(),
    client_id: z.uuid(),
  }),
  z.object({
    action: z.literal("takeover"),
    attempt_id: z.uuid(),
    client_id: z.uuid(),
  }),
  z.object({
    action: z.literal("save"),
    ...writer,
    request_id: z.uuid(),
    answers: z
      .array(
        z.object({
          question_id: z.uuid(),
          expected_revision: z.number().int().min(0),
          value: safeAnswer,
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal("submit"),
    ...writer,
    request_id: z.uuid(),
    mode: z.enum(["manual", "timeout"]),
  }),
  z.object({
    action: z.literal("event"),
    ...writer,
    event_id: z.uuid(),
    kind: z.enum([
      "focus_loss",
      "visibility_hidden",
      "fullscreen_exit",
      "pagehide",
      "shortcut",
      "copy",
      "cut",
      "paste",
      "contextmenu",
    ]),
    duration_ms: z.number().int().min(0).max(86400000).default(0),
    editing: z.boolean().default(false),
    orientation_recent: z.boolean().default(false),
  }),
]);
