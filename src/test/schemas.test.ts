import { describe, it, expect } from "vitest";
import { invoiceSchema } from "@/lib/schemas/invoice";
import { appointmentSchema } from "@/lib/schemas/appointment";
import { jobEditSchema } from "@/lib/schemas/job";

// ─── Helpers ────────────────────────────────────────────────────────────────

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const validItem = { description: "Labour", quantity: 1, unit_price: 50 };
const validUuid = "00000000-0000-0000-0000-000000000001";

// ─── invoiceSchema ───────────────────────────────────────────────────────────

describe("invoiceSchema", () => {
  it("accepts a valid invoice", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      due_date: tomorrow(),
      tax_rate: 20,
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing client_id", () => {
    const result = invoiceSchema.safeParse({
      tax_rate: 0,
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid client_id (not a UUID)", () => {
    const result = invoiceSchema.safeParse({
      client_id: "not-a-uuid",
      tax_rate: 0,
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a due date in the past", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      due_date: yesterday(),
      tax_rate: 0,
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a missing due date (optional)", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      tax_rate: 0,
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      tax_rate: 0,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a line item with blank description", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      tax_rate: 0,
      items: [{ description: "", quantity: 1, unit_price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a line item with zero quantity", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      tax_rate: 0,
      items: [{ description: "Parts", quantity: 0, unit_price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative unit price", () => {
    const result = invoiceSchema.safeParse({
      client_id: validUuid,
      tax_rate: 0,
      items: [{ description: "Parts", quantity: 1, unit_price: -5 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── appointmentSchema ───────────────────────────────────────────────────────

describe("appointmentSchema", () => {
  it("accepts a valid appointment", () => {
    const result = appointmentSchema.safeParse({
      title: "Oil Change",
      client_id: validUuid,
      appointment_date: tomorrow(),
      appointment_time: "10:00",
      type: "service",
      duration_minutes: 60,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank title", () => {
    const result = appointmentSchema.safeParse({
      title: "",
      client_id: validUuid,
      appointment_date: tomorrow(),
      appointment_time: "10:00",
      duration_minutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing client_id", () => {
    const result = appointmentSchema.safeParse({
      title: "Consultation",
      appointment_date: tomorrow(),
      appointment_time: "10:00",
      duration_minutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an appointment date in the past", () => {
    const result = appointmentSchema.safeParse({
      title: "Consultation",
      client_id: validUuid,
      appointment_date: yesterday(),
      appointment_time: "10:00",
      duration_minutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing appointment date", () => {
    const result = appointmentSchema.safeParse({
      title: "Consultation",
      client_id: validUuid,
      appointment_date: "",
      appointment_time: "10:00",
      duration_minutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative duration", () => {
    const result = appointmentSchema.safeParse({
      title: "Consultation",
      client_id: validUuid,
      appointment_date: tomorrow(),
      appointment_time: "10:00",
      duration_minutes: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ─── jobEditSchema ───────────────────────────────────────────────────────────

describe("jobEditSchema", () => {
  it("accepts a valid job edit", () => {
    const result = jobEditSchema.safeParse({
      title: "Engine Repair",
      priority: "high",
      due_date: tomorrow(),
      estimated_hours: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank title", () => {
    const result = jobEditSchema.safeParse({
      title: "",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid priority value", () => {
    const result = jobEditSchema.safeParse({
      title: "Tyre Change",
      priority: "critical" as any,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative estimated_hours", () => {
    const result = jobEditSchema.safeParse({
      title: "Tyre Change",
      priority: "low",
      estimated_hours: -2,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null estimated_hours (optional)", () => {
    const result = jobEditSchema.safeParse({
      title: "Quick Check",
      priority: "low",
      estimated_hours: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all four valid priority values", () => {
    for (const priority of ["low", "medium", "high", "urgent"] as const) {
      const result = jobEditSchema.safeParse({ title: "Job", priority });
      expect(result.success).toBe(true);
    }
  });
});
