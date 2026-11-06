import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Button } from "../components/ui/button";

it("exposes pending actions and prevents another native activation", () => {
  vi.stubGlobal("React", React);
  try {
    const pending = renderToStaticMarkup(React.createElement(Button, { loading: true }, "Memproses…"));
    const disabled = renderToStaticMarkup(React.createElement(Button, { disabled: true }, "Simpan"));
    const link = renderToStaticMarkup(React.createElement(Button, { asChild: true }, React.createElement("a", { href: "/login" }, "Masuk")));
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain('data-loading="true"');
    expect(pending).toContain('disabled=""');
    expect(disabled).not.toContain("data-loading");
    expect(link).toContain('href="/login"');
  } finally {
    vi.unstubAllGlobals();
  }
});
