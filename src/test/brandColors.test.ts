import { afterEach, describe, expect, it } from "vitest";
import {
  applyBrandColors,
  contrastWithDarkInk,
  contrastWithWhite,
  ensureReadablePrimary,
  ensureReadablePrimaryDark,
  worstDarkContrast,
  hexToHslString,
  PRESETS,
} from "@/lib/brand-colors";

describe("ensureReadablePrimary", () => {
  it("keeps a colour that already passes AA", () => {
    expect(ensureReadablePrimary("150 39% 30%")).toBe("150 39% 30%");
  });

  it("darkens the legacy pastel sage until white text passes AA", () => {
    const fixed = ensureReadablePrimary("110 14% 54%");
    expect(contrastWithWhite(fixed)!).toBeGreaterThanOrEqual(4.5);
  });

  it("makes every preset readable", () => {
    for (const preset of PRESETS) {
      const hsl = hexToHslString(preset.hex)!;
      expect(contrastWithWhite(ensureReadablePrimary(hsl))!).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("ensureReadablePrimaryDark", () => {
  it("lightens a dark brand colour so dark button text passes AA", () => {
    const fixed = ensureReadablePrimaryDark("150 39% 30%");
    expect(contrastWithDarkInk(fixed)!).toBeGreaterThanOrEqual(4.5);
  });

  it("turns a near-black brand into near-white rather than a muddy grey", () => {
    const fixed = ensureReadablePrimaryDark("0 3% 6%");
    expect(fixed).toBe("0 3% 90%");
    expect(worstDarkContrast(fixed)!).toBeGreaterThanOrEqual(4.5);
  });

  it("makes every preset readable in the dark theme", () => {
    for (const preset of PRESETS) {
      const hsl = hexToHslString(preset.hex)!;
      expect(worstDarkContrast(ensureReadablePrimaryDark(hsl))!).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("applyBrandColors", () => {
  const root = document.documentElement;
  afterEach(() => root.removeAttribute("style"));

  it("sets per-theme brand variables and clears the legacy overrides", () => {
    root.style.setProperty("--primary", "0 0% 0%");
    applyBrandColors({ primary: "210 60% 40%", accent: null } as never);
    expect(root.style.getPropertyValue("--brand-primary")).not.toBe("");
    expect(root.style.getPropertyValue("--brand-primary-dark")).not.toBe("");
    expect(root.style.getPropertyValue("--primary")).toBe("");
  });

  it("removes brand variables when no colour is set", () => {
    applyBrandColors({ primary: "210 60% 40%", accent: null } as never);
    applyBrandColors({ primary: null, accent: null } as never);
    expect(root.style.getPropertyValue("--brand-primary")).toBe("");
  });
});
