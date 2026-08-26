import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/authSchema";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_AUTH_PAYLOAD_BYTES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";

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

    const result = registerSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const { name, email, password } = result.data;

    let user;
    try {
      user = await prisma.user.create({
        data: { name, email, passwordHash: hashPassword(password) },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError(ERRORS.EMAIL_ALREADY_REGISTERED(), cors);
      }
      throw error;
    }

    return NextResponse.json({ success: true, user }, { status: 201, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/auth/register", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
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
