import { z } from "zod";
import { PUSH_TOKEN_MAX_LEN } from "./constants";

export const registerDeviceSchema = z.object({
  platform: z.enum(["ios", "android"]),
  pushToken: z.string().trim().min(1).max(PUSH_TOKEN_MAX_LEN),
});
