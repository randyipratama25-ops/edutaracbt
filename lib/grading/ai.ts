import { z } from "zod";
export const aiSuggestionSchema = z
  .object({
    question_id: z.uuid(),
    points: z.number().finite().min(0).max(10000),
    reason: z.string().trim().min(1).max(5000),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    prompt_version: z.literal("essay-rubric-v1"),
    schema_version: z.literal(1),
  })
  .strict();
export const aiBatchSchema = z.array(aiSuggestionSchema).max(50);
export function validateSuggestion(input: unknown, maxPoints: number) {
  const result = aiSuggestionSchema.parse(input);
  if (result.points > maxPoints)
    throw Error("Saran AI melampaui bobot snapshot.");
  return result;
}
export function minimizedPrompt(
  question: { stem: string; rubric: string },
  answer: { text: string },
) {
  return {
    schema_version: 1,
    prompt_version: "essay-rubric-v1",
    question: question.stem,
    rubric: question.rubric,
    answer: answer.text,
  };
}
export const aiRuntimePolicy = {
  configured: false,
  timeoutMs: 20000,
  maxBatch: 50,
  approvalRequired: true,
} as const;
// No outbound adapter is enabled until the owner chooses a provider and permits answer disclosure.
