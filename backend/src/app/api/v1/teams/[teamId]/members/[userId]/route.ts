import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { MAX_TEAM_PAYLOAD_BYTES } from "@/lib/constants";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { findAccessibleTeam, removeMember, updateMemberRole } from "@/lib/team";
import { updateMemberRoleSchema } from "@/lib/teamMemberSchema";

interface RouteContext {
  params: Promise<{ teamId: string; userId: string }>;
}

const ALLOWED_METHODS = "PATCH, DELETE, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/** LEAD-only, guarded against demoting the last remaining LEAD. */
export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId, userId: targetUserId } = await params;

    if (!(await findAccessibleTeam(user.id, teamId))) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_TEAM_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_TEAM_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = updateMemberRoleSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const outcome = await updateMemberRole(user.id, teamId, targetUserId, result.data.role);
    switch (outcome) {
      case "forbidden":
        return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
      case "not_found":
        return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
      case "last_lead":
        return jsonError(ERRORS.LAST_TEAM_LEAD(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling PATCH /api/v1/teams/:teamId/members/:userId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

/** A LEAD can remove anyone; any member can remove themselves ("leave team"). */
export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId, userId: targetUserId } = await params;

    if (!(await findAccessibleTeam(user.id, teamId))) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }

    const outcome = await removeMember(user.id, teamId, targetUserId);
    switch (outcome) {
      case "forbidden":
        return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
      case "not_found":
        return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
      case "last_lead":
        return jsonError(ERRORS.LAST_TEAM_LEAD(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/teams/:teamId/members/:userId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
