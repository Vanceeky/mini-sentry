import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/bearer";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { findUserBySessionToken } from "@/lib/session";

const ALLOWED_METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return jsonError(ERRORS.UNAUTHORIZED(), cors);
    }

    const user = await findUserBySessionToken(token);
    if (!user) {
      return jsonError(ERRORS.INVALID_SESSION(), cors);
    }

    return NextResponse.json({ success: true, user }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/auth/me", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
