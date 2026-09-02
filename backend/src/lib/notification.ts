import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "./db";

// ASSIGNED_ERROR (Phase 14) is built and sent inline from the assignment
// route, not through notify.ts/notificationRules.ts — those are keyed off
// ingestion's CapturedEventInput/PersistedEvent, which a manual assign
// action doesn't produce. See DECISIONS.md.
//
// ERROR_OCCURRED is the catch-all: every ingested event notifies now (user
// request, overriding the original "not every event" design — see
// DECISIONS.md), and this is the type for an occurrence that isn't a new
// group, a serious repeat, or a reactivation.
export type NotificationType = "NEW_ERROR" | "SERIOUS_ERROR" | "REACTIVATED_ERROR" | "ERROR_OCCURRED" | "ASSIGNED_ERROR";

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
 * event-ingestion logic (lib/notify.ts) never needs to change when the
 * delivery mechanism changes — only getNotificationService()'s return value
 * would.
 */
export interface NotificationService {
  notifyUser(userId: string, payload: NotificationPayload): Promise<void>;
}

/**
 * Fallback used whenever no Firebase Cloud Messaging credential is
 * configured (e.g. local dev, or a fresh deploy before
 * FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is set) — never a hard failure to run
 * the app at all. Logging exactly what *would* be sent, to whom, is honest
 * about that (per this repo's "no fake functionality presented as working"
 * guardrail) rather than silently no-op'ing or pretending delivery
 * succeeded. See FcmNotificationService below for real delivery.
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

/**
 * FCM's own signal that a token is dead (app uninstalled, token rotated,
 * etc.) — https://firebase.google.com/docs/cloud-messaging/manage-tokens.
 * Distinguished from any other send failure (network blip, malformed
 * payload) so only genuinely-dead tokens get pruned; a transient failure
 * must not delete a device that would otherwise keep working.
 */
function isUnregisteredTokenError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "messaging/registration-token-not-registered";
}

/**
 * Real delivery via Firebase Cloud Messaging — the same provider Flutter's
 * `firebase_messaging` package registers a token with, covering both iOS and
 * Android from one API. Only ever selected by getNotificationService() when
 * a real service-account credential is configured; otherwise
 * ConsoleNotificationService is used, per this file's existing fallback
 * convention (mirrors lib/email.ts's SmtpEmailService/ConsoleEmailService
 * split).
 */
class FcmNotificationService implements NotificationService {
  private readonly app: App;

  constructor(serviceAccount: ServiceAccount) {
    // Re-initializing an already-created default app throws — reuse it
    // across Next.js dev-mode hot reloads, same rationale as lib/db.ts's
    // PrismaClient singleton.
    this.app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  }

  async notifyUser(userId: string, payload: NotificationPayload): Promise<void> {
    const devices = await prisma.device.findMany({
      where: { userId },
      select: { id: true, pushToken: true },
    });

    if (devices.length === 0) {
      return;
    }

    const messaging = getMessaging(this.app);
    await Promise.all(
      devices.map(async (device) => {
        try {
          await messaging.send({
            token: device.pushToken,
            notification: { title: payload.title, body: payload.message },
            // Lets the app deep-link to the specific error group without
            // parsing the human-readable title/body.
            data: { type: payload.type, projectId: payload.projectId, errorGroupId: payload.errorGroupId },
          });
        } catch (error) {
          if (isUnregisteredTokenError(error)) {
            await prisma.device.delete({ where: { id: device.id } }).catch(() => {
              // Already gone (e.g. the user re-registered/removed it
              // concurrently) — the end state this cleanup wants is
              // already true, so there's nothing left to do.
            });
          } else {
            console.error("fcm send failed", { deviceId: device.id, error });
          }
        }
      }),
    );
  }
}

let instance: NotificationService | undefined;

export function getNotificationService(): NotificationService {
  if (!instance) {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();

    if (serviceAccountBase64) {
      try {
        const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, "base64").toString("utf8")) as ServiceAccount;
        instance = new FcmNotificationService(serviceAccount);
      } catch (error) {
        // A malformed credential falls back rather than crashing the app at
        // import time — consistent with lib/email.ts's "never a hard
        // failure to run" precedent.
        console.error("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is set but invalid — falling back to console logging", error);
        instance = new ConsoleNotificationService();
      }
    } else {
      instance = new ConsoleNotificationService();
    }
  }
  return instance;
}
