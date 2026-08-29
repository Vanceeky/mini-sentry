import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { findAccessibleTeam, listTeamMembers } from "@/lib/team";

interface RouteContext {
  params: Promise<{ teamId: string }>;
}

const ALLOWED_METHODS = "GET, OPTIONS";

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

    const members = await listTeamMembers(teamId);
    return NextResponse.json({ success: true, members }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/teams/:teamId/members", error);
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
