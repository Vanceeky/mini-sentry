import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { rotateApiKey } from "@/lib/project";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

    // Rotation is immediate and unconditional — the previous key stops
    // working the instant this returns, no grace period. See DECISIONS.md.
    const apiKey = await rotateApiKey(user.id, projectId);
    if (!apiKey) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, apiKey }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/projects/:projectId/api-key/rotate", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
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
