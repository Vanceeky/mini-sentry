import { z } from "zod";
import { NAME_MAX_LEN } from "./constants";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
});

// PATCH allows partial updates in principle, but "name" is the only editable
// field today — still required (a body with no name is a no-op PATCH, which
// is a validation error rather than silently accepted).
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
});
