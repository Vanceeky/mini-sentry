import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { MAX_DEVICE_PAYLOAD_BYTES } from "@/lib/constants";
import { registerDevice } from "@/lib/device";
import { registerDeviceSchema } from "@/lib/deviceSchema";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const user = await requireSessionUser(request);

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_DEVICE_PAYLOAD_BYTES) {
      return jsonError(ERRORS.PAYLOAD_TOO_LARGE(MAX_DEVICE_PAYLOAD_BYTES), cors);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(ERRORS.validationError("Request body must be valid JSON."), cors);
    }

    const result = registerDeviceSchema.safeParse(parsedBody);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}` : "Invalid request.";
      return jsonError(ERRORS.validationError(message), cors);
    }

    const device = await registerDevice(user.id, result.data.platform, result.data.pushToken);

    // 200, not 201: registration upserts by pushToken, so this request may
    // have updated an existing row rather than created a new one — see
    // lib/device.ts and plans/DECISIONS.md.
    return NextResponse.json({ success: true, device }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling POST /api/v1/devices", error);
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
