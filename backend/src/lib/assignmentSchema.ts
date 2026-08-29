import { z } from "zod";
import { ID_MAX_LEN } from "./constants";

// null explicitly means "unassign" — distinct from omitting the field, which is a validation error.
export const assignErrorGroupSchema = z.object({
  assigneeId: z.string().trim().min(1).max(ID_MAX_LEN).nullable(),
});
