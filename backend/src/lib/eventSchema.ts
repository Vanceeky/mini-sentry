import { z } from "zod";
import {
  ID_MAX_LEN,
  MESSAGE_MAX_LEN,
  REQUEST_METHOD_MAX_LEN,
  STACK_MAX_LEN,
  TRUNCATION_SUFFIX,
  URL_MAX_LEN,
  USER_AGENT_MAX_LEN,
} from "./constants";

// Mirrors sdk/src/capture/types.ts's CapturedEvent exactly. `url`/`request.url`
// are validated as non-empty strings, NOT as well-formed absolute URLs: the
// SDK's scrubUrl() can legitimately return a relative path (e.g. a same-origin
// fetch("/api/x")) unchanged when there's nothing to redact — rejecting those
// would reject perfectly valid "http" events.
export const capturedEventSchema = z
  .object({
    id: z.string().min(1).max(ID_MAX_LEN),
    type: z.enum(["error", "unhandledrejection", "http"]),
    message: z.string().min(1),
    stack: z.string().optional(),
    url: z.string().min(1),
    timestamp: z.string().datetime(),
    environment: z.literal("browser"),
    browser: z.object({
      userAgent: z.string().min(1),
    }),
    request: z
      .object({
        url: z.string().min(1),
        method: z.string().min(1),
        statusCode: z.number().int().min(100).max(599).optional(),
      })
      .optional(),
  })
  .refine((event) => event.type !== "http" || event.request !== undefined, {
    message: 'request is required when type is "http"',
    path: ["request"],
  });

export type CapturedEventInput = z.infer<typeof capturedEventSchema>;

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * Runs after schema validation passes. Truncates (never rejects) overlong
 * strings — a verbose but otherwise legitimate message/stack shouldn't cause
 * the whole event to be dropped. Unknown/extra fields were already stripped
 * by zod's default (non-strict) object parsing.
 */
export function normalizeEvent(event: CapturedEventInput): CapturedEventInput {
  return {
    ...event,
    message: truncate(event.message, MESSAGE_MAX_LEN),
    stack: event.stack !== undefined ? truncate(event.stack, STACK_MAX_LEN) : undefined,
    url: truncate(event.url, URL_MAX_LEN),
    browser: { userAgent: truncate(event.browser.userAgent, USER_AGENT_MAX_LEN) },
    request: event.request
      ? {
          ...event.request,
          url: truncate(event.request.url, URL_MAX_LEN),
          method: truncate(event.request.method, REQUEST_METHOD_MAX_LEN),
        }
      : undefined,
  };
}
