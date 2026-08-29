import { NextResponse } from "next/server";
import { syncSuperAdminRole } from "@/lib/adminGuard";
import { loginSchema } from "@/lib/authSchema";
import { resolveCorsHeaders } from "@/lib/cors";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, MAX_AUTH_PAYLOAD_BYTES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rateLimit";
import { createSession } from "@/lib/session";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_AUTH_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_AUTH_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = loginSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const { email, password } = result.data;

    // Keyed by email (already validated/normalized above), not IP — this
    // repo has no reliable client-IP extraction, and brute-forcing one
    // account's password is the threat this specifically guards against.
    // See DECISIONS.md for the trade-offs of this choice.
    const rateLimit = checkRateLimit(`login:${email}`, LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return jsonError(ERRORS.RATE_LIMITED(Math.ceil(rateLimit.retryAfterMs / 1000)), cors);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always runs a scrypt computation, even when no account matches — a
    // dummy hash keeps response timing from revealing whether the email is
    // registered (an early return on "user not found" would leak that).
    const passwordMatches = verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      return jsonError(ERRORS.INVALID_CREDENTIALS(), cors);
    }

    const role = await syncSuperAdminRole(user.id, user.email, user.role);
    const session = await createSession(user.id);

    return NextResponse.json(
      {
        success: true,
        token: session.token,
        user: { id: user.id, name: user.name, email: user.email, role },
      },
      { status: 200, headers: cors },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/auth/login", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED(), resolveCorsHeaders(request.headers.get("origin")));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED(), resolveCorsHeaders(request.headers.get("origin")));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED(), resolveCorsHeaders(request.headers.get("origin")));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED(), resolveCorsHeaders(request.headers.get("origin")));
}
