import type { CapturedEventInput } from "./eventSchema";
import type { NotificationPayload, NotificationType } from "./notification";
import type { PersistedEvent } from "./persistEvent";

const TITLES: Record<NotificationType, string> = {
  NEW_ERROR: "New Error Detected",
  SERIOUS_ERROR: "Serious Error",
  REACTIVATED_ERROR: "Error Reactivated",
};

function formatErrorSummary(event: CapturedEventInput): string {
  if (event.type === "http" && event.request) {
    return `${event.request.statusCode ?? "ERR"} ${event.request.method} ${event.request.url}`;
  }
  return event.message;
}

/**
 * At most one trigger per event — the brief is explicit that not every
 * event should notify. Priority, when more than one condition applies to
 * the same event: a brand-new error group is the most novel/actionable
 * signal; failing that, a serious (5xx) response is the next most urgent;
 * failing that, a previously-quiet error reactivating is worth a nudge.
 * Deliberately simple and documented (see DECISIONS.md), not a scoring
 * engine — the brief explicitly asked to avoid building one.
 */
export function determineNotificationType(event: CapturedEventInput, persisted: PersistedEvent): NotificationType | null {
  if (persisted.isNewGroup) return "NEW_ERROR";
  if (event.type === "http" && (event.request?.statusCode ?? 0) >= 500) return "SERIOUS_ERROR";
  if (persisted.wasInactive) return "REACTIVATED_ERROR";
  return null;
}

export function buildNotificationPayload(
  type: NotificationType,
  projectId: string,
  event: CapturedEventInput,
  persisted: PersistedEvent,
): NotificationPayload {
  return {
    type,
    projectId,
    errorGroupId: persisted.groupId,
    title: TITLES[type],
    message: formatErrorSummary(event),
  };
}
