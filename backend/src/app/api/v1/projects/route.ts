import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_PROJECT_PAYLOAD_BYTES } from "@/lib/constants";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { createProject, listOwnedProjects } from "@/lib/project";
import { createProjectSchema } from "@/lib/projectSchema";

const ALLOWED_METHODS = "GET, POST, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const projects = await listOwnedProjects(user.id);
    return NextResponse.json({ success: true, projects }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling GET /api/v1/projects", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);

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

    const result = createProjectSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const project = await createProject(user.id, result.data.name);

    // apiKey (the raw key) is only ever present in THIS response — creation
    // and rotation. Every other project response omits it in favor of
    // apiKeyLastFour. See docs/API.md's API-key lifecycle note.
    return NextResponse.json({ success: true, project }, { status: 201, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/projects", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, POST"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
