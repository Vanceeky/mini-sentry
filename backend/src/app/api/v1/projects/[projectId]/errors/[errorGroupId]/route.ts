import { NextResponse } from "next/server";
import { resolveProjectAccess } from "@/lib/access";
import { assignErrorGroup, getErrorGroupSummary, updateErrorGroupStatus } from "@/lib/assignment";
import { updateErrorGroupSchema } from "@/lib/assignmentSchema";
import { requireSessionUser } from "@/lib/authGuard";
import { MAX_ASSIGNMENT_PAYLOAD_BYTES } from "@/lib/constants";
import { resolveCorsHeaders } from "@/lib/cors";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { getErrorGroupDetail } from "@/lib/errorQuery";
import { occurrencesQuerySchema, parseQueryOrThrow } from "@/lib/errorQuerySchema";
import { getNotificationService } from "@/lib/notification";

interface RouteContext {
  params: Promise<{ projectId: string; errorGroupId: string }>;
}

const ALLOWED_METHODS = "GET, PATCH, OPTIONS";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId, errorGroupId } = await params;

    const project = await resolveProjectAccess(user.id, projectId);
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

/**
 * Two independent, optionally-combined updates in one PATCH: `assigneeId`
 * (owner assigns anyone, a non-owner member only assigns/unassigns
 * themselves — see lib/assignment.ts's assignErrorGroup) and `status`
 * (open to any accessible member/owner — see updateErrorGroupStatus). At
 * least one field is required (enforced by the zod schema). If both are
 * present, assignment is applied first (it's the one that can fail on
 * permission grounds); status is applied after.
 */
export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS);

  try {
    const user = await requireSessionUser(request);
    const { projectId, errorGroupId } = await params;

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_ASSIGNMENT_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_ASSIGNMENT_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = updateErrorGroupSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    if (result.data.assigneeId !== undefined) {
      const outcome = await assignErrorGroup(user, projectId, errorGroupId, result.data.assigneeId);
      switch (outcome.status) {
        case "project_not_found":
          return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
        case "insufficient_role":
          return jsonError(ERRORS.INSUFFICIENT_ROLE(), cors);
        case "not_a_project_member":
          return jsonError(ERRORS.NOT_A_PROJECT_MEMBER(), cors);
        case "group_not_found":
          return jsonError(ERRORS.ERROR_GROUP_NOT_FOUND(), cors);
      }

      // Best-effort — a notification failure must never affect the
      // assignment that already committed. No notification on unassign.
      if (outcome.group.assigneeId) {
        try {
          await getNotificationService().notifyUser(outcome.group.assigneeId, {
            type: "ASSIGNED_ERROR",
            projectId,
            errorGroupId,
            title: "Error Assigned to You",
            message: outcome.group.message,
          });
        } catch (notifyError) {
          console.error("best-effort assignment notification failed", notifyError);
        }
      }
    }

    if (result.data.status !== undefined) {
      const outcome = await updateErrorGroupStatus(user, projectId, errorGroupId, result.data.status);
      if (outcome === "project_not_found") {
        return jsonError(ERRORS.PROJECT_NOT_FOUND(), cors);
      }
      if (outcome === "group_not_found") {
        return jsonError(ERRORS.ERROR_GROUP_NOT_FOUND(), cors);
      }
    }

    const group = await getErrorGroupSummary(projectId, errorGroupId);
    if (!group) {
      return jsonError(ERRORS.ERROR_GROUP_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true, group }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling PATCH /api/v1/projects/:projectId/errors/:errorGroupId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("GET, PATCH"), resolveCorsHeaders(request.headers.get("origin"), ALLOWED_METHODS));
}
