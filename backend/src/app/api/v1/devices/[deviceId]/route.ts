import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/authGuard";
import { resolveCorsHeaders } from "@/lib/cors";
import { deleteOwnedDevice } from "@/lib/device";
import { ApiError, ERRORS, jsonError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ deviceId: string }>;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const cors = resolveCorsHeaders(request.headers.get("origin"));

  try {
    const user = await requireSessionUser(request);
    const { deviceId } = await params;

    const deleted = await deleteOwnedDevice(user.id, deviceId);
    if (!deleted) {
      return jsonError(ERRORS.DEVICE_NOT_FOUND(), cors);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, cors);
    }
    console.error("unexpected error handling DELETE /api/v1/devices/:deviceId", error);
    return jsonError(ERRORS.INTERNAL_ERROR(), cors);
  }
}

export async function GET(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"));
}

export async function POST(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"));
}

export async function PUT(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"));
}

export async function PATCH(): Promise<NextResponse> {
  return jsonError(ERRORS.METHOD_NOT_ALLOWED("DELETE"));
}
