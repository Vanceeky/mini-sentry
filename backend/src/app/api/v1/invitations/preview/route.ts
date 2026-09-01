import { NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { parseQueryOrThrow } from "@/lib/errorQuerySchema";
import { previewInvitation } from "@/lib/invitation";
import { previewInvitationQuerySchema } from "@/lib/invitationSchema";

const ALLOWED_METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/**
 * PUBLIC — deliberately no auth. Lets a brand-new person (no account yet)
 * preview what they've been invited to before registering. Never reveals
 * anything beyond project name + invited email, both already implied by
 * possessing the raw token.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const { token } = parseQueryOrThrow(previewInvitationQuerySchema, request.url);
    const outcome = await previewInvitation(token);

    switch (outcome.status) {
      case "not_found":
        return jsonError(ERRORS.INVITATION_NOT_FOUND(), cors);
      case "expired":
        return jsonError(ERRORS.INVITATION_EXPIRED(), cors);
    }

    return NextResponse.json(
      { success: true, projectName: outcome.projectName, invitedEmail: outcome.invitedEmail },
      { status: 200, headers: cors },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/invitations/preview", error);
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
