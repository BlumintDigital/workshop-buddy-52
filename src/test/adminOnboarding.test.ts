import { describe, expect, it } from "vitest";
import {
  buildAdminOnboardingSteps,
  type AdminOnboardingMetrics,
} from "@/hooks/useAdminOnboarding";

const emptyMetrics: AdminOnboardingMetrics = {
  hasWorkshopDetails: false,
  teamCount: 1,
  inviteCodeCount: 0,
  clientCount: 0,
  jobCount: 0,
  inventoryCount: 0,
};

describe("buildAdminOnboardingSteps", () => {
  it("marks first-time admin steps incomplete when no setup data exists", () => {
    const steps = buildAdminOnboardingSteps(emptyMetrics);

    expect(steps.map((step) => [step.id, step.completed])).toEqual([
      ["workshop_settings", false],
      ["team_invites", false],
      ["client", false],
      ["job", false],
      ["inventory", false],
    ]);
  });

  it("derives completion from real setup counts", () => {
    const steps = buildAdminOnboardingSteps({
      hasWorkshopDetails: true,
      teamCount: 2,
      inviteCodeCount: 0,
      clientCount: 1,
      jobCount: 1,
      inventoryCount: 1,
    });

    expect(steps.every((step) => step.completed)).toBe(true);
  });

  it("allows a job to complete independently of team and client setup", () => {
    const steps = buildAdminOnboardingSteps({
      ...emptyMetrics,
      jobCount: 1,
    });

    expect(steps.find((step) => step.id === "job")?.completed).toBe(true);
    expect(steps.find((step) => step.id === "team_invites")?.completed).toBe(false);
    expect(steps.find((step) => step.id === "client")?.completed).toBe(false);
  });

  it("marks skipped standalone steps without making them completed", () => {
    const steps = buildAdminOnboardingSteps(emptyMetrics, ["inventory"]);
    const inventory = steps.find((step) => step.id === "inventory");

    expect(inventory?.skipped).toBe(true);
    expect(inventory?.completed).toBe(false);
  });
});
