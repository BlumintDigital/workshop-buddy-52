import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit_price: z.number().min(0, "Unit price cannot be negative"),
});

export const invoiceSchema = z.object({
  client_id: z.string().uuid("A valid client must be selected"),
  due_date: z
    .string()
    .optional()
    .refine((d) => !d || new Date(d) >= new Date(new Date().toDateString()), {
      message: "Due date cannot be in the past",
    }),
  tax_rate: z.number().min(0).max(100),
  items: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required")
    .refine((items) => items.some((i) => i.description.trim()), {
      message: "At least one line item must have a description",
    }),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
