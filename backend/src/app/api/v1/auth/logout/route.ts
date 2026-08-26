import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/bearer";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { deleteSessionByToken } from "@/lib/session";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return jsonError(ERRORS.UNAUTHORIZED(), cors);
    }

    // Idempotent: an already-invalid/unknown token still resolves to "you
    // are logged out", not an error — deleteSessionByToken() is a no-op
    // deleteMany if nothing matches.
    await deleteSessionByToken(token);

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/auth/logout", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function PUT(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function DELETE(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function PATCH(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}
