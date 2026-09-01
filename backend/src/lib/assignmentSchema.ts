import { z } from "zod";
import { ID_MAX_LEN } from "./constants";

// null explicitly means "unassign" — distinct from omitting the field.
// At least one of assigneeId/status must be present — an empty {} PATCH is
// a validation error, not a silent no-op.
export const updateErrorGroupSchema = z
  .object({
    assigneeId: z.string().trim().min(1).max(ID_MAX_LEN).nullable().optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]).optional(),
  })
  .refine((data) => data.assigneeId !== undefined || data.status !== undefined, {
    message: "At least one of assigneeId or status must be provided.",
  });
