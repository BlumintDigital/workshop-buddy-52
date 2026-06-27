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
      generate_sample_data: false,
      setup_demo_users: false,
      backup_restore: false,
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

  it("respects stored true values for flags that default to false", () => {
    expect(
      normalizeFeatureFlags([
        { key: "generate_sample_data", enabled: true },
        { key: "setup_demo_users", enabled: true },
      ])
    ).toEqual({
      ...FEATURE_DEFAULTS,
      generate_sample_data: true,
      setup_demo_users: true,
    });
  });

  it("respects stored true value for backup_restore flag", () => {
    expect(
      normalizeFeatureFlags([{ key: "backup_restore", enabled: true }])
    ).toEqual({ ...FEATURE_DEFAULTS, backup_restore: true });
  });
});
