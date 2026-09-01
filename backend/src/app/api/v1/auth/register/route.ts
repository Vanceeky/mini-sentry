import { NextResponse } from "next/server";
import { syncSuperAdminRole } from "@/lib/adminGuard";
import { registerSchema } from "@/lib/authSchema";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_AUTH_PAYLOAD_BYTES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { acceptInvitation } from "@/lib/invitation";
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

    const { name, email, password, invitationToken } = result.data;

    let user;
    try {
      user = await prisma.user.create({
        data: { name, email, passwordHash: hashPassword(password) },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError(ERRORS.EMAIL_ALREADY_REGISTERED(), cors);
      }
      throw error;
    }

    const role = await syncSuperAdminRole(user.id, user.email, user.role);

    // The account is already committed at this point — a bad/expired/
    // foreign invitation token must never undo or fail the registration
    // that just succeeded. Its outcome is reported as a sub-field instead,
    // and this call is wrapped in its own try/catch so an unexpected
    // failure here can't turn a successful registration into a 500.
    let invitation: { status: string; projectId?: string } | undefined;
    if (invitationToken) {
      try {
        const outcome = await acceptInvitation(invitationToken, user.id, user.email);
        invitation = outcome.status === "accepted" ? { status: outcome.status, projectId: outcome.projectId } : { status: outcome.status };
      } catch (invitationError) {
        console.error("best-effort invitation acceptance during registration failed", invitationError);
        invitation = { status: "not_found" };
      }
    }

    return NextResponse.json(
      { success: true, user: { ...user, role }, ...(invitation ? { invitation } : {}) },
      { status: 201, headers: cors },
    );
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
