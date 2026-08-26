import { prisma } from "./db";

export type NotificationType = "NEW_ERROR" | "SERIOUS_ERROR" | "REACTIVATED_ERROR";

/** Deep-links a mobile client to the specific error that triggered it. */
export interface NotificationPayload {
  type: NotificationType;
  projectId: string;
  errorGroupId: string;
  title: string;
  message: string;
}

/**
 * Abstraction over however push notifications actually get delivered, so
 * event-ingestion logic (lib/notify.ts) never needs to change when a real
 * provider (Expo Push, Firebase Cloud Messaging, ...) is wired up — only
 * getNotificationService()'s return value would.
 */
export interface NotificationService {
  notifyUser(userId: string, payload: NotificationPayload): Promise<void>;
}

/**
 * The only implementation for now. No real push provider is configured —
 * this project has no Expo/FCM credentials to call an actual API with.
 * Logging exactly what *would* be sent, to whom, is honest about that
 * (per this repo's "no fake functionality presented as working" guardrail)
 * rather than silently no-op'ing or pretending delivery succeeded.
 */
class ConsoleNotificationService implements NotificationService {
  async notifyUser(userId: string, payload: NotificationPayload): Promise<void> {
    const devices = await prisma.device.findMany({
      where: { userId },
      select: { id: true, platform: true },
    });

    if (devices.length === 0) {
      console.log("notification (user has no registered devices)", { userId, ...payload });
      return;
    }

    for (const device of devices) {
      console.log("notification (no push provider wired up yet — logging only)", {
        deviceId: device.id,
        platform: device.platform,
        ...payload,
      });
    }
  }
}

let instance: NotificationService | undefined;

export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = new ConsoleNotificationService();
  }
  return instance;
}
