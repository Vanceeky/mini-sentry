import { generateId } from "../core/id";
import { captureEnvironment } from "../context/environment";
import type { CapturedEvent } from "./types";

export function normalizeErrorEvent(event: ErrorEvent): CapturedEvent {
  const err = event.error;
  const message = err instanceof Error ? err.message : event.message || "Unknown error";
  const stack = err instanceof Error ? err.stack : undefined;

  return {
    id: generateId(),
    type: "error",
    message,
    stack,
    filename: event.filename || undefined,
    line: event.lineno > 0 ? event.lineno : undefined,
    column: event.colno > 0 ? event.colno : undefined,
    timestamp: new Date().toISOString(),
    ...captureEnvironment(),
  };
}

export function normalizeRejectionEvent(event: PromiseRejectionEvent): CapturedEvent {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : stringifyReason(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;

  return {
    id: generateId(),
    type: "unhandledrejection",
    message,
    stack,
    timestamp: new Date().toISOString(),
    ...captureEnvironment(),
  };
}

function stringifyReason(reason: unknown): string {
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}
