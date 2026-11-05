import { describe, expect, it } from "vitest";
import { renderFormula } from "../lib/authoring/mathjax";

describe("MathJax soal", () => {
  it("renders TeX fractions and AMS environments to self-contained SVG", () => {
    const inline = renderFormula(String.raw`\frac{1}{2}`, false);
    const block = renderFormula(
      String.raw`\begin{aligned}a&=1\\b&=2\end{aligned}`,
      true,
    );
    expect(inline).toContain("<svg");
    expect(block).toContain('display="true"');
    expect(block).not.toContain("data-mjx-error");
  });

  it("does not turn author TeX into links or load additional extensions", () => {
    const result = renderFormula(
      String.raw`\href{javascript:alert(1)}{x}\require{html}`,
      false,
    );
    expect(result).not.toMatch(/<(a|script)\b/i);
    expect(result).not.toContain('href="javascript:');
  });
});
