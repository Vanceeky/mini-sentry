import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./constants";
import { ERRORS } from "./errors";

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT);

// Matches the SDK's actual CapturedEventType (see sdk/src/capture/types.ts).
// The brief's own example used "network" as an illustrative value, but this
// deployment's contract calls that type "http" — see DECISIONS.md.
const eventTypeSchema = z.enum(["error", "unhandledrejection", "http"]);

export const listErrorGroupsQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  search: z.string().trim().min(1).optional(),
  type: eventTypeSchema.optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  environment: z.string().trim().min(1).optional(),
  sort: z.enum(["lastSeen", "firstSeen", "occurrences"]).default("lastSeen"),
});

export const occurrencesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export const listEventsQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  type: eventTypeSchema.optional(),
});

/** Converts a Request's search params into a plain object zod can parse. */
export function queryParamsToObject(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

/** Parses query params against a schema, or throws a 400 VALIDATION_ERROR with the first issue. */
export function parseQueryOrThrow<T extends z.ZodTypeAny>(schema: T, url: string): z.infer<T> {
  const result = schema.safeParse(queryParamsToObject(url));
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}`
      : "Invalid query parameters.";
    throw ERRORS.validationError(message);
  }
  return result.data;
}
