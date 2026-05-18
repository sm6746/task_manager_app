import { z } from "zod";

export const authSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

export const loginSchema = authSchema.pick({ email: true, password: true });

export const projectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters").max(80),
  description: z.string().max(500).optional()
});

export const taskSchema = z.object({
  title: z.string().min(3, "Task title must be at least 3 characters").max(120),
  description: z.string().max(1000).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"])
});

export type TaskStatus = "todo" | "in_progress" | "done";
