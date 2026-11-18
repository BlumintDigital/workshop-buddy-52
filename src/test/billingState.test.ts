import { describe, expect, it, vi } from "vitest";
import { billingState, type BillingStatus } from "@/lib/billing";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const invoice = (status: string, clientMarkedPaid = false): BillingStatus => ({
  job_id: "j1",
  invoice_id: "i1",
  invoice_number: "INV-1",
  status,
  total: 100,
  currency: "GBP",
  client_marked_paid: clientMarkedPaid,
});

describe("billingState", () => {
  it("lets a paid project go in every mode", () => {
    for (const policy of ["off", "warn", "block"] as const) {
      expect(billingState(invoice("paid"), false, policy)).toMatchObject({ label: "Paid", paid: true, needsReason: false, blocked: false });
    }
  });

  it("Off: an unpaid project goes without a reason", () => {
    expect(billingState(invoice("sent"), false, "off")).toMatchObject({ label: "Invoiced, not paid", paid: false, needsReason: false, blocked: false });
  });

  it("Warn (the default): an unpaid project needs a reason", () => {
    expect(billingState(invoice("draft"), false)).toMatchObject({ label: "Invoice not sent", needsReason: true, blocked: false });
    expect(billingState(invoice("overdue"), false, "warn")).toMatchObject({ label: "Invoice overdue", needsReason: true, blocked: false });
    expect(billingState(undefined, false, "warn")).toMatchObject({ label: "Not invoiced", needsReason: true, blocked: false });
  });

  it("Block: an unpaid project can't go", () => {
    expect(billingState(invoice("sent"), false, "block")).toMatchObject({ paid: false, blocked: true });
    expect(billingState(undefined, false, "block")).toMatchObject({ label: "Not invoiced", blocked: true });
  });

  it("Block: a walk-in with no invoice needs a reason instead, as it can't be invoiced in the portal", () => {
    expect(billingState(undefined, true, "block")).toMatchObject({ label: "Walk-in, bill directly", needsReason: true, blocked: false });
  });

  it("client says paid: no reason in Warn, still blocked in Block", () => {
    const b = invoice("sent", true);
    expect(billingState(b, false, "warn")).toMatchObject({ label: "Client says paid. Check and confirm.", paid: false, needsReason: false, blocked: false });
    expect(billingState(b, false, "block")).toMatchObject({ label: "Client says paid. Check and confirm.", paid: false, blocked: true });
    expect(billingState(b, false, "off")).toMatchObject({ needsReason: false, blocked: false });
  });
});
