import { z } from "zod";

const JOB_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const JOB_STATUSES = ["pending", "in_progress", "review", "completed", "cancelled"] as const;

export const jobEditSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(JOB_PRIORITIES),
  due_date: z.string().optional(),
  estimated_hours: z
    .number()
    .positive("Estimated hours must be greater than 0")
    .optional()
    .nullable(),
  assigned_staff_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  status: z.enum(JOB_STATUSES),
  due_date: z.string().optional().nullable(),
  value: z.number().min(0),
});

export type JobEditFormData = z.infer<typeof jobEditSchema>;
export type TaskFormData = z.infer<typeof taskSchema>;
