import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { MAX_TEAM_PAYLOAD_BYTES } from "@/lib/constants";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { deleteTeam, findAccessibleTeam, renameTeam } from "@/lib/team";
import { renameTeamSchema } from "@/lib/teamSchema";

interface RouteContext {
  params: Promise<{ teamId: string }>;
}

const ALLOWED_METHODS = "GET, PATCH, DELETE, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId } = await params;

    const team = await findAccessibleTeam(user.id, teamId);
    if (!team) {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, team }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/teams/:teamId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

/** LEAD-only. */
export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId } = await params;

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

    const result = renameTeamSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const team = await renameTeam(user.id, teamId, result.data.name);
    if (!team) {
      const accessible = await findAccessibleTeam(user.id, teamId);
      return jsonError(accessible ? ERRORS.INSUFFICIENT_ROLE() : ERRORS.TEAM_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, team }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling PATCH /api/v1/teams/:teamId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

/** LEAD-only. Projects attached to this team are detached (onDelete: SetNull), never deleted. */
export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { teamId } = await params;

    const deleted = await deleteTeam(user.id, teamId);
    if (!deleted) {
      const accessible = await findAccessibleTeam(user.id, teamId);
      return jsonError(accessible ? ERRORS.INSUFFICIENT_ROLE() : ERRORS.TEAM_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/teams/:teamId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
