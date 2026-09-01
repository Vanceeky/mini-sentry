import { z } from "zod";
import { EMAIL_MAX_LEN, ID_MAX_LEN, NAME_MAX_LEN, PASSWORD_MAX_LEN, PASSWORD_MIN_LEN } from "./constants";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LEN)
    .email("email must be a valid email address"),
  password: z
    .string()
    .min(PASSWORD_MIN_LEN, `password must be at least ${PASSWORD_MIN_LEN} characters`)
    .max(PASSWORD_MAX_LEN),
  // Optional — joins the invitation's project as part of registration
  // itself, so a brand-new person doesn't need a separate authenticated
  // "accept" call. A bad/expired/foreign token never fails registration;
  // its outcome is reported in the response instead (see auth/register/route.ts).
  invitationToken: z.string().trim().min(1).max(ID_MAX_LEN).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LEN).email("email must be a valid email address"),
  password: z.string().min(1).max(PASSWORD_MAX_LEN),
});
