import { z } from "zod";
import { questionSchema } from "../authoring/schema";
import { metaSchema, ruleSchema, bankCommand } from "./schema";
import { resultAnalysisSchema } from "../results/contracts";
const count = z.number().int().nonnegative().safe(),
  id = z.uuid();
const base = z.object({
  id,
  metadata: metaSchema,
  state: z.enum(["draft", "revision", "approved", "archived"]),
  version: count.min(1),
  owner_id: id,
  payload: questionSchema,
});
export const bankRowSchema = base.extend({
  can_edit: z.boolean(),
  can_review: z.boolean(),
});
export const bankListSchema = z
  .object({ rows: z.array(bankRowSchema).max(25), total: count })
  .refine(
    (d) =>
      new Set(d.rows.map((r) => r.id)).size === d.rows.length &&
      d.total >= d.rows.length,
    "Daftar bank tidak konsisten.",
  );
export const bankDetailSchema = z
  .object({
    item: base,
    versions: z
      .array(
        z.object({
          version: count.min(1),
          payload: questionSchema,
          reason: z.string(),
        }),
      )
      .min(1)
      .max(50),
    reviews: z
      .array(
        z.object({
          id,
          version: count.min(1),
          decision: z.enum(["draft", "revision", "approved", "archived"]),
          reason: z.string(),
        }),
      )
      .max(100),
    similar: count,
    usage: z.array(
      z.object({
        title: z.string(),
        bank_version: count.min(1),
        points: z.number().positive(),
        attempts: count,
      }),
    ),
  })
  .refine(
    (d) =>
      new Set(d.versions.map((v) => v.version)).size === d.versions.length &&
      d.versions.some((v) => v.version === d.item.version),
    "Versi bank belum lengkap.",
  );
export const bankMastersSchema = z.object({
  classes: z.array(
    z.object({ id, name: z.string(), active: z.boolean().optional() }),
  ),
  subjects: z.array(
    z.object({ id, name: z.string(), active: z.boolean().optional() }),
  ),
  exams: z.array(
    z.object({
      id,
      title: z.string(),
      status: z.enum(["draft", "scheduled", "active", "closed", "archived"]),
      subject_id: id,
    }),
  ),
  examClasses: z.array(z.object({ exam_id: id, class_id: id })),
});
export const bankSourceSchema = z.object({
  questions: z.array(z.object({ payload: questionSchema })),
});
export const bankQualitySchema = z.object({
  eligible: count,
  limit: z.literal(300).default(300),
  items: z.array(
    resultAnalysisSchema.shape.items.element
      .pick({
        id: true,
        type: true,
        n: true,
        p: true,
        d: true,
        small_sample: true,
        difficulty: true,
        discrimination: true,
      })
      .extend({
        options: z.array(
          resultAnalysisSchema.shape.items.element.shape.options.element.pick({
            id: true,
            choices: true,
            is_key: true,
            selection_rate: true,
            nonfunctional: true,
          }),
        ),
      }),
  ),
});
export type BankDetail = z.infer<typeof bankDetailSchema>;
export type BankQuality = z.infer<typeof bankQualitySchema>;
export const importReportSchema = z.array(
  z
    .object({
      row: count.min(1),
      saved: z.boolean(),
      error: z.string().optional(),
      id: id.optional(),
    })
    .refine((r) => (r.saved ? !!r.id : !!r.error)),
);
export const candidatesSchema = z.array(
  z.object({ exam_id: id, rule: ruleSchema, available: count }),
);
export const assembledSchema = z.array(
  z.object({ exam_id: id, count: count.min(1), pack_id: id }),
);
export type BankInput = z.infer<typeof bankCommand>;
export function bankReceipt(input: BankInput): z.ZodType<unknown> {
  if (input.action === "save")
    return z.object({ id }).refine((r) => !input.id || r.id === input.id);
  if (input.action === "review") return z.object({ saved: z.literal(true) });
  if (input.action === "import")
    return importReportSchema.refine(
      (rows) =>
        rows.length === input.items.length &&
        new Set(rows.map((r) => r.row)).size === rows.length &&
        rows.every((r) => r.row <= input.items.length),
    );
  if (input.action === "assemble")
    return assembledSchema.refine(
      (rows) =>
        rows.length === input.exam_ids.length &&
        new Set(rows.map((r) => r.exam_id)).size === rows.length &&
        rows.every(
          (r) =>
            input.exam_ids.includes(r.exam_id) &&
            r.count === input.rules.reduce((n, r) => n + r.count, 0),
        ),
    );
  const key = (r: z.infer<typeof ruleSchema>) =>
    JSON.stringify(ruleSchema.parse(r));
  return candidatesSchema.refine(
    (rows) =>
      rows.length === input.exam_ids.length * input.rules.length &&
      input.exam_ids.every((id) => {
        const expected = input.rules.map(key).sort(),
          actual = rows
            .filter((r) => r.exam_id === id)
            .map((r) => key(r.rule))
            .sort();
        return JSON.stringify(actual) === JSON.stringify(expected);
      }),
  );
}
export function bankQuery(p: URLSearchParams) {
  const action = z
    .enum(["list", "detail", "quality"])
    .parse(p.get("action") || "list");
  const input = {
    action,
    ...(p.get("id") ? { id: id.parse(p.get("id")) } : {}),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(p.get("page") || 1),
    search: (p.get("search") || "").slice(0, 150),
    subject: p.get("subject") ? id.parse(p.get("subject")) : "",
    state: z
      .enum(["", "draft", "revision", "approved", "archived"])
      .parse(p.get("state") || ""),
    difficulty: z
      .enum(["", "easy", "medium", "hard"])
      .parse(p.get("difficulty") || ""),
    cognitive: z
      .enum(["", "C1", "C2", "C3", "C4", "C5", "C6"])
      .parse(p.get("cognitive") || ""),
  };
  if (action !== "list" && !input.id)
    throw Error("Pilih soal terlebih dahulu.");
  return input;
}
export function bankDecisions(
  item: { state: string },
  permissions: { can_review: boolean; can_edit: boolean },
) {
  return item.state === "archived"
    ? permissions.can_edit
      ? ["draft"]
      : []
    : [
        ...(permissions.can_review ? ["approved", "revision"] : []),
        ...(permissions.can_edit ? ["archived", "draft"] : []),
      ];
}

export function bankListFor(page: number) {
  return bankListSchema.refine(
    (d) => !d.total || d.rows.length > 0 || page > Math.ceil(d.total / 25),
    "Halaman bank belum lengkap.",
  );
}
