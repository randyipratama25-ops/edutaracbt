import { afterEach, describe, expect, it, vi } from "vitest";
import { requiresLandscape } from "../lib/device/orientation";
function device(userAgent: string, type?: string, angle?: number, platform = "", maxTouchPoints = 1) {
  vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
  vi.stubGlobal("window", {
    screen: { orientation: type ? { type } : undefined },
    orientation: angle,
    matchMedia: () => ({ matches: true }),
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("student mobile landscape policy", () => {
  it("can render on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(requiresLandscape()).toBe(false);
  });
  it.each(["portrait-primary", "portrait-secondary"])("blocks Android %s", type => {
    device("Android", type);
    expect(requiresLandscape()).toBe(true);
  });
  it.each(["landscape-primary", "landscape-secondary"])("allows Android %s even if the keyboard makes the viewport portrait", type => {
    device("Android", type);
    expect(requiresLandscape()).toBe(false);
  });
  it("does not block a narrow desktop or touch laptop", () => {
    device("Windows NT", "portrait-primary", undefined, "Win32", 10);
    expect(requiresLandscape()).toBe(false);
  });
  it("recognizes iPad desktop mode", () => {
    device("Macintosh", "portrait-primary", undefined, "MacIntel", 5);
    expect(requiresLandscape()).toBe(true);
  });
  it.each([0, 180])("blocks legacy Safari angle %s", angle => {
    device("iPhone", undefined, angle);
    expect(requiresLandscape()).toBe(true);
  });
  it.each([-90, 90])("allows legacy Safari angle %s", angle => {
    device("iPhone", undefined, angle);
    expect(requiresLandscape()).toBe(false);
  });
  it("falls back to the orientation media query", () => {
    device("Android");
    expect(requiresLandscape()).toBe(true);
  });
});
