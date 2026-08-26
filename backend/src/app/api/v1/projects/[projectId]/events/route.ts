import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { listProjectEvents } from "@/lib/errorQuery";
import { listEventsQuerySchema, parseQueryOrThrow } from "@/lib/errorQuerySchema";
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

    const query = parseQueryOrThrow(listEventsQuerySchema, request.url);
    const result = await listProjectEvents(projectId, query);

    return NextResponse.json({ success: true, ...result }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/projects/:projectId/events", error);
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
