import { NextResponse } from "next/server";
import { MAX_EVENT_PAYLOAD_BYTES } from "./constants";

export type ErrorCode =
  | "INVALID_EVENT"
  | "UNAUTHORIZED"
  | "INVALID_API_KEY"
  | "PAYLOAD_TOO_LARGE"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "INVALID_SESSION"
  | "PROJECT_NOT_FOUND";

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
      'Missing or malformed Authorization header. Expected "Authorization: Bearer <token>".',
    ),
  INVALID_API_KEY: () => new ApiError("INVALID_API_KEY", 401, "API key is invalid or unrecognized."),
  PAYLOAD_TOO_LARGE: (maxBytes: number = MAX_EVENT_PAYLOAD_BYTES) =>
    new ApiError("PAYLOAD_TOO_LARGE", 413, `Request body exceeds the maximum allowed size of ${maxBytes} bytes.`),
  METHOD_NOT_ALLOWED: (allowed: string = "POST") =>
    new ApiError("METHOD_NOT_ALLOWED", 405, `This endpoint only accepts ${allowed}.`),
  INTERNAL_ERROR: () =>
    new ApiError("INTERNAL_ERROR", 500, "An internal error occurred. Please try again later."),
  EMAIL_ALREADY_REGISTERED: () =>
    new ApiError("EMAIL_ALREADY_REGISTERED", 409, "An account with this email already exists."),
  INVALID_CREDENTIALS: () => new ApiError("INVALID_CREDENTIALS", 401, "Email or password is incorrect."),
  INVALID_SESSION: () => new ApiError("INVALID_SESSION", 401, "Session is invalid, expired, or already logged out."),
  // Deliberately identical whether the project id doesn't exist at all or
  // belongs to a different user — never confirm/deny another user's project
  // exists via response shape. See DECISIONS.md (Phase 10).
  PROJECT_NOT_FOUND: () =>
    new ApiError("PROJECT_NOT_FOUND", 404, "No project with this id exists for the current user."),
  invalidEvent: (message: string) => new ApiError("INVALID_EVENT", 400, message),
  validationError: (message: string) => new ApiError("VALIDATION_ERROR", 400, message),
};

export function jsonError(err: ApiError, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: err.code, message: err.message } },
    { status: err.status, headers },
  );
}
