import { z } from "zod";
import { limitSchema, pageSchema } from "./paginationSchema";

export const adminListQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});
