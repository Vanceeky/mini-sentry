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
  | "PROJECT_NOT_FOUND"
  | "ERROR_GROUP_NOT_FOUND"
  | "DEVICE_NOT_FOUND"
  | "RATE_LIMITED"
  | "TEAM_NOT_FOUND"
  | "FORBIDDEN"
  | "INSUFFICIENT_ROLE"
  | "NOT_A_TEAM_MEMBER"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_EMAIL_MISMATCH"
  | "INVITATION_ALREADY_PENDING"
  | "PROJECT_NOT_ON_TEAM"
  | "LAST_TEAM_LEAD";

/**
 * Deliberately-thrown API errors. Anything else caught by the route
 * handler's top-level try/catch is treated as INTERNAL_ERROR and never has
 * its message/stack serialized into the response — see jsonError().
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Set only for RATE_LIMITED — jsonError() turns this into a standard `Retry-After` header. */
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
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
  ERROR_GROUP_NOT_FOUND: () =>
    new ApiError("ERROR_GROUP_NOT_FOUND", 404, "No error group with this id exists in this project."),
  // Same IDOR-safe rationale as PROJECT_NOT_FOUND — identical whether the
  // device id doesn't exist or belongs to a different user.
  DEVICE_NOT_FOUND: () => new ApiError("DEVICE_NOT_FOUND", 404, "No device with this id is registered to the current user."),
  RATE_LIMITED: (retryAfterSeconds: number) =>
    new ApiError(
      "RATE_LIMITED",
      429,
      `Too many requests. Try again in ${retryAfterSeconds} second(s).`,
      retryAfterSeconds,
    ),
  // Same IDOR-safe rationale as PROJECT_NOT_FOUND/DEVICE_NOT_FOUND — identical
  // whether the team id doesn't exist or belongs to a team the caller isn't on.
  TEAM_NOT_FOUND: () => new ApiError("TEAM_NOT_FOUND", 404, "No team with this id exists for the current user."),
  // Generic "authenticated but not authorized" — used by requireSuperAdmin.
  FORBIDDEN: () => new ApiError("FORBIDDEN", 403, "You do not have permission to perform this action."),
  // Distinct from FORBIDDEN: a team MEMBER (not a LEAD) tried to act on
  // someone else's assignment — the catalog already differentiates this
  // granularly elsewhere (DEVICE_NOT_FOUND vs PROJECT_NOT_FOUND), not a
  // generic NOT_FOUND, so mirror that here rather than collapsing into FORBIDDEN.
  INSUFFICIENT_ROLE: () =>
    new ApiError("INSUFFICIENT_ROLE", 403, "Your role on this team does not allow this action."),
  NOT_A_TEAM_MEMBER: () =>
    new ApiError("NOT_A_TEAM_MEMBER", 400, "The specified user is not a member of this project's team."),
  // Not found / wrong status / lazily-expired all collapse to this one code —
  // a revoked/accepted/expired token must behave identically to a token that
  // never existed, so guessing/reusing an old token can't reveal it was ever valid.
  INVITATION_NOT_FOUND: () =>
    new ApiError("INVITATION_NOT_FOUND", 404, "No pending invitation exists for this token."),
  INVITATION_EXPIRED: () =>
    new ApiError("INVITATION_EXPIRED", 404, "No pending invitation exists for this token."),
  // This one *can* be distinguishable — it doesn't leak another user's data,
  // just that some invitation exists for some email, which the token itself
  // already proves; it just isn't addressed to the caller.
  INVITATION_EMAIL_MISMATCH: () =>
    new ApiError("INVITATION_EMAIL_MISMATCH", 403, "This invitation was not sent to your account's email address."),
  INVITATION_ALREADY_PENDING: () =>
    new ApiError("INVITATION_ALREADY_PENDING", 409, "A pending invitation already exists for this email on this team."),
  PROJECT_NOT_ON_TEAM: () =>
    new ApiError("PROJECT_NOT_ON_TEAM", 409, "This project is not attached to a team, so error groups cannot be assigned."),
  LAST_TEAM_LEAD: () =>
    new ApiError("LAST_TEAM_LEAD", 409, "Cannot remove or demote the last remaining LEAD of a team."),
  invalidEvent: (message: string) => new ApiError("INVALID_EVENT", 400, message),
  validationError: (message: string) => new ApiError("VALIDATION_ERROR", 400, message),
};

export function jsonError(err: ApiError, headers: Record<string, string> = {}): NextResponse {
  const responseHeaders =
    err.retryAfterSeconds !== undefined ? { ...headers, "Retry-After": String(err.retryAfterSeconds) } : headers;

  return NextResponse.json(
    { success: false, error: { code: err.code, message: err.message } },
    { status: err.status, headers: responseHeaders },
  );
}
