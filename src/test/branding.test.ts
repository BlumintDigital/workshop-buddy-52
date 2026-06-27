import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGO_URL,
  getCustomLogoUrl,
  isLegacyDefaultLogoUrl,
  resolveLogoUrl,
} from "@/lib/branding";

describe("branding logo helpers", () => {
  it("uses the bundled default when no logo is configured", () => {
    expect(resolveLogoUrl(null)).toBe(DEFAULT_LOGO_URL);
    expect(resolveLogoUrl("")).toBe(DEFAULT_LOGO_URL);
    expect(resolveLogoUrl("   ")).toBe(DEFAULT_LOGO_URL);
  });

  it("treats legacy default logo paths as the bundled default", () => {
    expect(isLegacyDefaultLogoUrl("Blumint_Logo.png")).toBe(true);
    expect(isLegacyDefaultLogoUrl("/Blumint_Logo.png")).toBe(true);
    expect(isLegacyDefaultLogoUrl("https://example.com/assets/Blumint_Logo.png")).toBe(true);
    expect(resolveLogoUrl("/Blumint_Logo.png")).toBe(DEFAULT_LOGO_URL);
    expect(resolveLogoUrl("https://example.com/assets/Blumint_Logo.png")).toBe(DEFAULT_LOGO_URL);
  });

  it("keeps real uploaded custom logo URLs", () => {
    const customLogo = "https://example.com/storage/v1/object/public/workshop-assets/logo-123.png";

    expect(getCustomLogoUrl(customLogo)).toBe(customLogo);
    expect(resolveLogoUrl(customLogo)).toBe(customLogo);
  });

  it("ignores legacy default logo URLs when checking for custom logos", () => {
    expect(getCustomLogoUrl("/Blumint_Logo.png")).toBeNull();
  });
});
