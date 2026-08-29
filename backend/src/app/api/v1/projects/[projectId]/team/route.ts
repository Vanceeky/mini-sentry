import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { MAX_TEAM_PAYLOAD_BYTES } from "@/lib/constants";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { attachProjectToTeam, detachProjectFromTeam } from "@/lib/team";
import { attachProjectTeamSchema } from "@/lib/teamSchema";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const ALLOWED_METHODS = "PUT, DELETE, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/** Owner-only: attaches a project to a team the owner already belongs to. */
export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

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

    const result = attachProjectTeamSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const outcome = await attachProjectToTeam(user.id, projectId, result.data.teamId);
    if (outcome === "project_not_found") {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }
    if (outcome === "not_a_team_member") {
      return jsonError(ERRORS.TEAM_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling PUT /api/v1/projects/:projectId/team", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

    const detached = await detachProjectFromTeam(user.id, projectId);
    if (!detached) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/projects/:projectId/team", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PUT, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PUT, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("PUT, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
