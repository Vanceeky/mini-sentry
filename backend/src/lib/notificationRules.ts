import type { CapturedEventInput } from "./eventSchema";
import type { NotificationPayload, NotificationType } from "./notification";
import type { PersistedEvent } from "./persistEvent";

// ASSIGNED_ERROR is included only for type-completeness against
// NotificationType — determineNotificationType() below never produces it
// (assignment is a manual action, not an ingestion-time decision); its real
// title is built inline where it's actually used, in the PATCH assignment
// route. See DECISIONS.md.
const TITLES: Record<NotificationType, string> = {
  NEW_ERROR: "New Error Detected",
  SERIOUS_ERROR: "Serious Error",
  REACTIVATED_ERROR: "Error Reactivated",
  ERROR_OCCURRED: "Error Occurred",
  ASSIGNED_ERROR: "Error Assigned to You",
};

function formatErrorSummary(event: CapturedEventInput): string {
  if (event.type === "http" && event.request) {
    return `${event.request.statusCode ?? "ERR"} ${event.request.method} ${event.request.url}`;
  }
  if (event.type === "resource" && event.resource) {
    return `Failed to load ${event.resource.tagName}: ${event.resource.url}`;
  }
  return event.message;
}

/**
 * Every event notifies now — one type per event, chosen by priority, never
 * "no notification." This reverses the original design (see DECISIONS.md's
 * Phase 12 entry, which followed the brief's explicit warning against
 * notifying on every event) at the user's explicit request. Priority, when
 * more than one condition applies to the same event: a brand-new error
 * group is the most novel/actionable signal; failing that, a serious (5xx)
 * response is the next most urgent; failing that, a previously-quiet error
 * reactivating is worth a nudge; failing all of those, it's an ordinary
 * repeat occurrence, still worth a plain ERROR_OCCURRED notification.
 */
export function determineNotificationType(event: CapturedEventInput, persisted: PersistedEvent): NotificationType {
  if (persisted.isNewGroup) return "NEW_ERROR";
  if (event.type === "http" && (event.request?.statusCode ?? 0) >= 500) return "SERIOUS_ERROR";
  if (persisted.wasInactive) return "REACTIVATED_ERROR";
  return "ERROR_OCCURRED";
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
