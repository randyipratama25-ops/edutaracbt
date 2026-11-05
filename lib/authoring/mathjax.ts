import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const engine = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams"], maxBuffer: 4096 }),
  OutputJax: new SVG({ fontCache: "none" }),
});

export function renderFormula(tex: string, display: boolean) {
  return adaptor.outerHTML(engine.convert(tex, { display }));
}
