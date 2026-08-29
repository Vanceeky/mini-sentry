import { z } from "zod";

export const updateMemberRoleSchema = z.object({
  role: z.enum(["LEAD", "MEMBER"]),
});
