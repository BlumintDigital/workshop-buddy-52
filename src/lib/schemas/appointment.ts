import { z } from "zod";

const APPOINTMENT_TYPES = ["consultation", "service", "follow_up", "emergency", "other"] as const;

export const appointmentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  client_id: z.string().uuid("A valid client must be selected"),
  appointment_date: z
    .string()
    .min(1, "Date is required")
    .refine((d) => new Date(d) >= new Date(new Date().toDateString()), {
      message: "Appointment date cannot be in the past",
    }),
  appointment_time: z.string().min(1, "Time is required"),
  type: z.enum(APPOINTMENT_TYPES).default("consultation"),
  duration_minutes: z.number().int().positive("Duration must be a positive number"),
  notes: z.string().optional(),
});

export type AppointmentFormData = z.infer<typeof appointmentSchema>;
