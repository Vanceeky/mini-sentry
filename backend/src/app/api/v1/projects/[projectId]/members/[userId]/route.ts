import { NextResponse } from "next/server";
import { resolveProjectAccess } from "@/lib/access";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { removeProjectMember } from "@/lib/projectMembers";

interface RouteContext {
  params: Promise<{ projectId: string; userId: string }>;
}

const ALLOWED_METHODS = "DELETE, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

/** The owner can remove anyone; any member can remove themselves ("leave project"). The owner can't remove themselves. */
export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId, userId: targetUserId } = await params;

    if (!(await resolveProjectAccess(user.id, projectId))) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    const outcome = await removeProjectMember(user.id, projectId, targetUserId);
    switch (outcome) {
      case "forbidden":
        return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
      case "cannot_remove_owner":
        return jsonError(ERRORS.CANNOT_REMOVE_OWNER(), cors);
      case "not_found":
        return jsonError(ERRORS.NOT_A_PROJECT_MEMBER(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/projects/:projectId/members/:userId", error);
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
