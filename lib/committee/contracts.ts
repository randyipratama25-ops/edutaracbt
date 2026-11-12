import { z } from "zod";

const person = z.object({ id: z.uuid(), name: z.string() });
const instant = z.iso.datetime({ offset: true });
const attendance = instant.nullable();
export const committeeDate = z.iso.date();
export const committeeReceipt = z.object({ saved: z.literal(true) });
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: value });
    return true;
  } catch {
    return false;
  }
});
export const committeeData = z.object({
  date: committeeDate,
  today: z.iso.date(),
  timezone,
  expires_at: instant,
  status: z.enum(["unassigned", "pending", "confirmed"]),
  candidates: z.array(person),
  supervisors: z.array(person),
  duties: z.array(
    person.extend({
      profile_id: z.uuid(),
      confirmed_at: attendance,
      replaced_at: attendance,
      replaces: z.string().nullable(),
    }),
  ),
  schedule: z.array(
    z
      .object({
        id: z.uuid(),
        exam: z.string(),
        room: z.string(),
        session: z.string().nullable(),
        starts_at: instant,
        ends_at: instant,
        original_id: z.uuid(),
        original_name: z.string(),
        supervisor_id: z.uuid(),
        supervisor_name: z.string(),
        substitution_id: z.uuid().nullable(),
        confirmed_at: attendance,
        original_confirmed_at: attendance,
        can_replace: z.boolean(),
      })
      .refine((item) => Date.parse(item.ends_at) > Date.parse(item.starts_at)),
  ),
});

const target = z.object({ id: z.uuid() });
const candidate = z.object({ profile_id: z.uuid() });
const supervisorTarget = target.extend({
  substitution_id: z.uuid().nullable(),
});
export const committeeMutation = z.discriminatedUnion("action", [
  candidate.extend({ action: z.literal("assign"), date: z.iso.date() }),
  target.extend({ action: z.literal("confirm_committee") }),
  target.extend({ action: z.literal("replace_committee"), ...candidate.shape }),
  supervisorTarget.extend({ action: z.literal("confirm_supervisor") }),
  supervisorTarget.extend({
    action: z.literal("replace_supervisor"),
    ...candidate.shape,
  }),
]);

export type CommitteeData = z.infer<typeof committeeData>;
export type CommitteeMutation = z.infer<typeof committeeMutation>;
