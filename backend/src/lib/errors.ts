import { NextResponse } from "next/server";
import { MAX_EVENT_PAYLOAD_BYTES } from "./constants";

export type ErrorCode =
  | "INVALID_EVENT"
  | "UNAUTHORIZED"
  | "INVALID_API_KEY"
  | "PAYLOAD_TOO_LARGE"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

/**
 * Deliberately-thrown API errors. Anything else caught by the route
 * handler's top-level try/catch is treated as INTERNAL_ERROR and never has
 * its message/stack serialized into the response — see jsonError().
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const ERRORS = {
  UNAUTHORIZED: () =>
    new ApiError(
      "UNAUTHORIZED",
      401,
      'Missing or malformed Authorization header. Expected "Authorization: Bearer <apiKey>".',
    ),
  INVALID_API_KEY: () => new ApiError("INVALID_API_KEY", 401, "API key is invalid or unrecognized."),
  PAYLOAD_TOO_LARGE: () =>
    new ApiError(
      "PAYLOAD_TOO_LARGE",
      413,
      `Request body exceeds the maximum allowed size of ${MAX_EVENT_PAYLOAD_BYTES} bytes.`,
    ),
  METHOD_NOT_ALLOWED: () => new ApiError("METHOD_NOT_ALLOWED", 405, "This endpoint only accepts POST."),
  INTERNAL_ERROR: () =>
    new ApiError("INTERNAL_ERROR", 500, "An internal error occurred. Please try again later."),
  invalidEvent: (message: string) => new ApiError("INVALID_EVENT", 400, message),
};

export function jsonError(err: ApiError, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: err.code, message: err.message } },
    { status: err.status, headers },
  );
}
