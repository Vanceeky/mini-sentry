import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { getErrorGroupDetail } from "@/lib/errorQuery";
import { occurrencesQuerySchema, parseQueryOrThrow } from "@/lib/errorQuerySchema";
import { findOwnedProject } from "@/lib/project";

interface RouteContext {
  params: Promise<{ projectId: string; errorGroupId: string }>;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const user = await requireSessionUser(request);
    const { projectId, errorGroupId } = await params;

    const project = await findOwnedProject(user.id, projectId);
    if (!project) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    const occurrencesQuery = parseQueryOrThrow(occurrencesQuerySchema, request.url);
    const detail = await getErrorGroupDetail(projectId, errorGroupId, occurrencesQuery);
    if (!detail) {
      return jsonError(ERRORS.ERROR_GROUP_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, ...detail }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/projects/:projectId/errors/:errorGroupId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"));
}

export async function PUT(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"));
}

export async function DELETE(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"));
}

export async function PATCH(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET"));
}
