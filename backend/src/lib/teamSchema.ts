import { z } from "zod";
import { ID_MAX_LEN, NAME_MAX_LEN } from "./constants";

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
});

export const renameTeamSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LEN),
});

export const attachProjectTeamSchema = z.object({
  teamId: z.string().trim().min(1).max(ID_MAX_LEN),
});
