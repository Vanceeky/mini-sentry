import { z } from "zod";

// Mirrors backend/src/lib/authSchema.ts exactly.
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Mirrors backend/src/lib/projectSchema.ts's createProjectSchema.
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200, "Name is too long"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
