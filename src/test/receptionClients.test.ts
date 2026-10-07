import { describe, expect, it } from "vitest";
import { findExistingClient, type ReceptionClient } from "@/components/project/IntakeForm";

const clients: ReceptionClient[] = [
  { id: "a", full_name: "Sam Patel", company_name: null, phone: "07700 900123", email: "sam@example.com", portal: true },
  { id: "b", full_name: "Jo Walsh", company_name: "Walsh Plant", phone: "+44 7700 900456", email: null, portal: false },
];

describe("spotting a walk-in who's already a client", () => {
  it("matches on email, ignoring case and spaces", () => {
    expect(findExistingClient(clients, "  SAM@example.com ", "")?.id).toBe("a");
  });

  it("matches the same mobile written with or without the country code", () => {
    expect(findExistingClient(clients, "", "07700900456")?.id).toBe("b");
    expect(findExistingClient(clients, "", "+44 (0)7700 900123")?.id).toBe("a");
  });

  it("finds clients without portal access too", () => {
    expect(findExistingClient(clients, "", "07700 900456")?.portal).toBe(false);
  });

  it("doesn't match on short or empty details", () => {
    expect(findExistingClient(clients, "", "")).toBeUndefined();
    expect(findExistingClient(clients, "", "900")).toBeUndefined();
    expect(findExistingClient(clients, "someone@else.com", "01632 960000")).toBeUndefined();
  });
});
