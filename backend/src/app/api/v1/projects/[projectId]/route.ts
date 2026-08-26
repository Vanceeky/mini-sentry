import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_PROJECT_PAYLOAD_BYTES } from "@/lib/constants";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { deleteOwnedProject, findOwnedProject, updateProjectName } from "@/lib/project";
import { updateProjectSchema } from "@/lib/projectSchema";

interface RouteContext {
  params: Promise<{ projectId: string }>;
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
    const { projectId } = await params;

    const project = await findOwnedProject(user.id, projectId);
    if (!project) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, project }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/projects/:projectId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PROJECT_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_PROJECT_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = updateProjectSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const project = await updateProjectName(user.id, projectId, result.data.name);
    if (!project) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, project }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling PATCH /api/v1/projects/:projectId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId } = await params;

    const deleted = await deleteOwnedProject(user.id, projectId);
    if (!deleted) {
      return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/projects/:projectId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH, DELETE"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
