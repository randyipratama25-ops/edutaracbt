import { z } from "zod";

export const profiles = {
  practice: "Latihan",
  standard: "Standar",
  strict: "Ketat",
} as const;
export const integrityProfile = z.enum(["practice", "standard", "strict"]);
export const studentPolicy = z.object({
  integrity_mode: z.string(),
  unlock_time: z.string(),
  tolerance_ms: z.number().nonnegative(),
  incident_cooldown_ms: z.number().nonnegative(),
  fullscreen_review: z.boolean().optional(),
  hidden_seconds: z.number().int().optional(),
  accommodated: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  equivalent_packs: z.boolean().optional(),
  watermark: z.boolean().optional(),
});
export type StudentPolicy = z.infer<typeof studentPolicy>;
export const policyFields = z.object({
  profile: integrityProfile,
  packs: z
    .array(z.uuid())
    .max(3)
    .refine(
      (ids) => [0, 2, 3].includes(ids.length),
      "Pilih dua atau tiga paket, atau kosongkan pilihan.",
    ),
  accommodations: z.array(z.uuid()).max(5000),
  watermark: z.boolean(),
  focus_ms: z.number().int().min(500).max(60000),
  hidden_seconds: z.number().int().min(2).max(120),
  fullscreen_review: z.boolean(),
});
export const policyConfig = policyFields.extend({
  editable: z.boolean(),
  available_packs: z.array(
    z.object({
      id: z.uuid(),
      created_at: z.string(),
      count: z.number().int().positive(),
    }),
  ),
  students: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type PolicyConfig = z.infer<typeof policyConfig>;
export const policySave = policyFields.extend({
  action: z.literal("save"),
  exam_id: z.uuid(),
});
export const transferDecision = z.object({
  action: z.enum(["approve", "deny"]),
  id: z.uuid(),
});
export const pendingTransfers = z.array(
  z.object({
    id: z.uuid(),
    student: z.string(),
    code: z.string(),
    room: z.string().nullable(),
    created_at: z.string(),
  }),
);
