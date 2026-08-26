import { NextResponse } from "next/server";
import { extractBearerToken, findProjectByApiKey } from "@/lib/apiKey";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_EVENT_PAYLOAD_BYTES } from "@/lib/constants";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";
import { capturedEventSchema, normalizeEvent } from "@/lib/eventSchema";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const rawKey = extractBearerToken(request.headers.get("authorization"));
    if (!rawKey) {
      return jsonError(ERRORS.UNAUTHORIZED(), cors);
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_EVENT_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.invalidEvent("Request body must be valid JSON."), cors);
    }

    const result = capturedEventSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid event.";
      return jsonError(ERRORS.invalidEvent(message), cors);
    }

    const event = normalizeEvent(result.data);

    const project = await findProjectByApiKey(rawKey);
    if (!project) {
      return jsonError(ERRORS.INVALID_API_KEY(), cors);
    }

    // Phase 7 validates and acknowledges events; it does not persist them —
    // that's Phase 8's job, once the error_groups/error_events schema and
    // grouping logic exist. This log line is the only visibility into
    // accepted events for now, deliberately excluding message/stack/url to
    // avoid dumping arbitrary user-supplied content into server logs.
    console.log("event accepted", {
      projectId: project.id,
      eventId: event.id,
      type: event.type,
      receivedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, eventId: `evt_${event.id}` }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/events", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function PUT(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function DELETE(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}

export async function PATCH(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED());
}
