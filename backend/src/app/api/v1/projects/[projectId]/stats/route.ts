import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { getProjectStats } from "@/lib/errorQuery";
import { findOwnedProject } from "@/lib/project";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

    const project = await findOwnedProject(user.id, projectId);
    if (!project) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    const stats = await getProjectStats(projectId);

    return NextResponse.json({ success: true, ...stats }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/projects/:projectId/stats", error);
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
