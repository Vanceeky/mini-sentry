import { z } from "zod";
import { EMAIL_MAX_LEN } from "./constants";

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LEN).email("email must be a valid email address"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1),
});

export const previewInvitationQuerySchema = z.object({
  token: z.string().trim().min(1),
});
