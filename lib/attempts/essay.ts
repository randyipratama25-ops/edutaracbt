/** Count meaningful plain text, excluding HTML, entities, math markup and symbols. */
export function plainEssayText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\$\$[^$]*\$\$|\$[^$]*\$/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}
export function essayLength(value: string) {
  return Array.from(plainEssayText(value)).length;
}
