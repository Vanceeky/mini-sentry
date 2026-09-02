import type { AuthenticatedProject } from "./apiKey";
import type { CapturedEventInput } from "./eventSchema";
import { getNotificationService } from "./notification";
import { buildNotificationPayload, determineNotificationType } from "./notificationRules";
import type { PersistedEvent } from "./persistEvent";

/**
 * Called after persistEvent() has already committed — a notification
 * failure must never affect whether the event itself was saved. This
 * function itself doesn't swallow errors (so it stays testable/composable);
 * the route calling it is responsible for treating it as best-effort (see
 * events/route.ts).
 */
export async function notifyIfNeeded(
  project: AuthenticatedProject,
  event: CapturedEventInput,
  persisted: PersistedEvent,
): Promise<void> {
  if (!project.ownerId) {
    return; // no owner to notify — see AuthenticatedProject's doc comment
  }

  const type = determineNotificationType(event, persisted);
  const payload = buildNotificationPayload(type, project.id, event, persisted);
  await getNotificationService().notifyUser(project.ownerId, payload);
}
