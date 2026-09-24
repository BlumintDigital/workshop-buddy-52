import { describe, expect, it } from "vitest";
import { contrastWithWhite, ensureReadablePrimary, hexToHslString, PRESETS } from "@/lib/brand-colors";

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
