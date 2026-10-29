import { z } from "zod";
export const types = ["PG", "PG_KOMPLEKS", "BS", "JODOH", "Esai"] as const;
export type Kind = (typeof types)[number];
// Attribute-free formatting only. Media are resolved by attachment IDs, never HTML URLs.
export function safeHtml(value: string) {
  return value.replace(/<[^>]*>/g, (tag) =>
    /^<\/?(?:p|br|b|strong|i|em|u|sub|sup|ul|ol|li|blockquote)>$/i.test(tag)
      ? tag.toLowerCase()
      : "",
  );
}
const option = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  text: z.string().trim().min(1).max(10000),
});
export const questionSchema = z
  .object({
    type: z.enum(types),
    stem: z.string().trim().min(1).max(50000).transform(safeHtml),
    points: z.number().positive().max(10000),
    required: z.boolean().default(true),
    distractors: z
      .array(z.string().trim().min(1).max(10000))
      .max(50)
      .default([]),
    keywords: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
    options: z.array(option).max(50).default([]),
    key: z.array(z.string().max(100)).max(50).default([]),
    explanation: z.string().max(20000).default("").transform(safeHtml),
    rubric: z.string().max(20000).default(""),
    minChars: z.number().int().min(0).max(50000).default(0),
    direction: z.enum(["ltr", "rtl"]).default("ltr"),
    attachments: z.array(z.uuid()).max(10).default([]),
    canvas: z
      .object({
        enabled: z.boolean(),
        width: z.number().int().min(100).max(4096),
        height: z.number().int().min(100).max(4096),
      })
      .default({ enabled: false, width: 1000, height: 600 }),
  })
  .superRefine((q, ctx) => {
    const err = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) err("ID opsi harus unik.");
    if (q.type === "PG" || q.type === "PG_KOMPLEKS") {
      if (ids.length < 2 || ids.length > 6) err("PG memerlukan 2–6 opsi.");
      if (
        q.key.some((k) => !ids.includes(k)) ||
        !q.key.length ||
        new Set(q.key).size !== q.key.length
      )
        err("Kunci harus memakai ID opsi unik.");
      if (q.type === "PG" && q.key.length !== 1)
        err("PG harus memiliki satu kunci.");
    } else if (q.type === "BS") {
      if (
        !ids.length ||
        q.key.length !== ids.length ||
        q.key.some((k) => !["true", "false"].includes(k))
      )
        err("BS memerlukan kunci true/false untuk setiap pernyataan.");
    } else if (q.type === "JODOH") {
      if (
        ids.length < 2 ||
        q.key.length !== ids.length ||
        q.key.some((k) => !k.trim())
      )
        err("JODOH memerlukan pasangan jawaban untuk setiap pernyataan.");
    } else if (q.options.length || q.key.length)
      err("Esai menggunakan rubrik, tanpa opsi/kunci.");
  });
export type Question = z.output<typeof questionSchema>;
export const configSchema = z.object({
  type: z.enum(types),
  enabled: z.boolean(),
  max_questions: z.number().int().min(0).max(10000),
  option_count: z.number().int().min(2).max(6),
  default_points: z.number().positive().max(10000),
});
export const examSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(150),
    subject_id: z.uuid(),
    class_ids: z.array(z.uuid()).min(1).max(100),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    duration_minutes: z.number().int().min(1).max(1440),
    pin: z
      .string()
      .regex(/^[0-9]{4,12}$/)
      .optional(),
    passing_grade: z.number().min(0).max(100),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]),
    bypass_period: z.boolean(),
    shuffle_questions: z.boolean(),
    shuffle_options: z.boolean(),
    configs: z.array(configSchema).length(5),
  })
  .superRefine((e, c) => {
    if (Date.parse(e.ends_at) <= Date.parse(e.starts_at))
      c.addIssue({
        code: "custom",
        message: "Waktu akhir harus setelah awal.",
      });
    if (new Set(e.configs.map((x) => x.type)).size !== 5)
      c.addIssue({
        code: "custom",
        message: "Konfigurasi lima tipe wajib unik.",
      });
    if (!e.id && !e.pin)
      c.addIssue({ code: "custom", message: "PIN wajib untuk ujian baru." });
  });
export function studentQuestion(q: Question) {
  const { key, explanation, rubric, keywords, ...publicFields } = q;
  void key;
  void explanation;
  void rubric;
  void keywords;
  return publicFields;
}
