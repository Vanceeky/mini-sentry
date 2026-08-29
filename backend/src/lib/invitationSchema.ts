import { z } from "zod";
import { EMAIL_MAX_LEN } from "./constants";

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LEN).email("email must be a valid email address"),
  role: z.enum(["LEAD", "MEMBER"]).default("MEMBER"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1),
});
