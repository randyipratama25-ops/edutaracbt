"use client";

import { useEffect, useRef } from "react";
import { safeHtml } from "../../lib/authoring/schema";

const delimited =
  /\$\$([^$]+)\$\$|\$([^$\n]+)\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)/g;

export function MathContent({ html }: { html: string }) {
  const root = useRef<HTMLDivElement>(null);
  const sanitized = safeHtml(html);

  useEffect(() => {
    const node = root.current;
    if (!node || !/\$|\\[[(]/.test(sanitized)) return;
    let active = true;
    void import("../../lib/authoring/mathjax")
      .then(({ renderFormula }) => {
        if (!active) return;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        while (walker.nextNode()) texts.push(walker.currentNode as Text);
        let remaining = 100;
        for (const text of texts) {
          if (!remaining) break;
          const source = text.data;
          const fragment = document.createDocumentFragment();
          let cursor = 0;
          for (const match of source.matchAll(delimited)) {
            if (!remaining) break;
            remaining--;
            const tex = match[1] ?? match[2] ?? match[3] ?? match[4];
            if (tex.length > 2000) continue;
            try {
              const result = renderFormula(tex, Boolean(match[1] || match[3]));
              if (result.includes("data-mjx-error=")) continue;
              const template = document.createElement("template");
              template.innerHTML = result;
              const math = template.content.firstElementChild;
              math?.setAttribute("role", "math");
              math?.setAttribute("aria-label", tex);
              math?.querySelector("svg")?.setAttribute("aria-hidden", "true");
              fragment.append(
                source.slice(cursor, match.index),
                template.content,
              );
              cursor = match.index + match[0].length;
            } catch {
              // Preserve the original expression if it cannot be rendered.
            }
          }
          if (cursor) {
            fragment.append(source.slice(cursor));
            text.replaceWith(fragment);
          }
        }
      })
      .catch(() => {
        // TeX source remains readable if the renderer cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, [sanitized]);

  return (
    <div
      key={sanitized}
      ref={root}
      className="question-math"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
