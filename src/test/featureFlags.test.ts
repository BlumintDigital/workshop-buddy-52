import { describe, expect, it } from "vitest";
import {
  FEATURE_DEFAULTS,
  normalizeFeatureFlags,
} from "@/hooks/useFeatureFlags";

describe("normalizeFeatureFlags", () => {
  it("fails open when no flag rows are available", () => {
    expect(normalizeFeatureFlags(null)).toEqual(FEATURE_DEFAULTS);
  });

  it("merges known stored values with enabled defaults", () => {
    expect(
      normalizeFeatureFlags([
        { key: "appointments", enabled: false },
        { key: "reports", enabled: true },
      ])
    ).toEqual({
      appointments: false,
      client_portal: true,
      goals: true,
      job_chat: true,
      reports: true,
    });
  });

  it("ignores unknown keys and malformed values", () => {
    expect(
      normalizeFeatureFlags([
        { key: "unknown", enabled: false },
        { key: "goals", enabled: "false" },
      ])
    ).toEqual(FEATURE_DEFAULTS);
  });
});
