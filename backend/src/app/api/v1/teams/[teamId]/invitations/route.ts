import { NextResponse } from "next/server";
import { findTeamMembership } from "@/lib/access";
import { requireSessionUser } from "@/lib/authGuard";
import { MAX_INVITATION_PAYLOAD_BYTES } from "@/lib/constants";
import { resolveCorsHeaders } from "@/lib/cors";
import { getEmailService } from "@/lib/email";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { createInvitation, listPendingInvitationsForTeam } from "@/lib/invitation";
import { createInvitationSchema } from "@/lib/invitationSchema";
import { findAccessibleTeam } from "@/lib/team";

interface RouteContext {
  params: Promise<{ teamId: string }>;
}

const ALLOWED_METHODS = "GET, POST, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/** LEAD-only. */
export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId } = await params;

    if (!(await findAccessibleTeam(user.id, teamId))) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }
    const membership = await findTeamMembership(teamId, user.id);
    if (membership?.role !== "LEAD") {
      return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
    }

    const invitations = await listPendingInvitationsForTeam(teamId);
    return NextResponse.json({ success: true, invitations }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/teams/:teamId/invitations", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

/**
 * LEAD-only. Returns the raw invite token once (mirrors project API-key
 * issuance). Also best-effort sends an invite email (lib/email.ts) — a
 * delivery failure never blocks invitation creation, since the token in the
 * response is always a valid fallback.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId } = await params;

    if (!(await findAccessibleTeam(user.id, teamId))) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_INVITATION_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_INVITATION_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = createInvitationSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const outcome = await createInvitation(teamId, user.id, result.data.email, result.data.role);
    if (outcome.status === "forbidden") {
      return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
    }
    if (outcome.status === "already_pending") {
      return jsonError(ERRORS.INVITATION_ALREADY_PENDING(), cors);
    }

    try {
      await getEmailService().sendInvitationEmail(result.data.email, {
        teamName: outcome.teamName,
        inviterName: outcome.inviterName,
        invitedRole: result.data.role,
        token: outcome.token,
      });
    } catch (emailError) {
      console.error("best-effort invitation email failed", emailError);
    }

    return NextResponse.json(
      { success: true, invitation: outcome.invitation, token: outcome.token },
      { status: 201, headers: cors },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/teams/:teamId/invitations", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
