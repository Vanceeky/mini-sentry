import { NextResponse } from "next/server";
import { findTeamMembership } from "@/lib/access";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { revokeInvitation } from "@/lib/invitation";
import { findAccessibleTeam } from "@/lib/team";

interface RouteContext {
  params: Promise<{ teamId: string; invitationId: string }>;
}

const ALLOWED_METHODS = "DELETE, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/** LEAD-only. */
export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId, invitationId } = await params;

    if (!(await findAccessibleTeam(user.id, teamId))) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }
    const membership = await findTeamMembership(teamId, user.id);
    if (membership?.role !== "LEAD") {
      return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
    }

    const revoked = await revokeInvitation(teamId, invitationId);
    if (!revoked) {
      return jsonError(ERRORS.INVITATION_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/teams/:teamId/invitations/:invitationId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
