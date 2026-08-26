import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { computeFingerprint } from "./fingerprint";
import type { CapturedEventInput } from "./eventSchema";

export interface PersistedEvent {
  groupId: string;
  eventId: string;
  occurrenceCount: number;
}

/**
 * Persists Project -> ErrorGroup -> ErrorEvent for one ingested event, per
 * Phase 8's acceptance criteria. Runs as a single transaction so a group's
 * occurrenceCount/lastSeenAt can never advance without the corresponding
 * event row actually being written (or vice versa).
 *
 * `os`/`metadata` are intentionally never populated — the current SDK
 * contract carries no data for either (see DECISIONS.md); storing null is
 * honest about what wasn't captured rather than faking a value.
 */
export async function persistEvent(projectId: string, event: CapturedEventInput): Promise<PersistedEvent> {
  const fingerprint = computeFingerprint(event);
  const now = new Date();
  const timestamp = new Date(event.timestamp);

  return prisma.$transaction(async (tx) => {
    const group = await tx.errorGroup.upsert({
      where: { projectId_fingerprint: { projectId, fingerprint } },
      create: {
        projectId,
        fingerprint,
        type: event.type,
        message: event.message,
        // Representative values from the first occurrence — see the
        // schema's doc comment. Not updated on later occurrences, same as
        // `message`/`type`.
        endpoint: event.request ? `${event.request.method} ${event.request.url}` : null,
        statusCode: event.request?.statusCode ?? null,
        environment: event.environment,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
      },
      update: {
        lastSeenAt: now,
        occurrenceCount: { increment: 1 },
      },
    });

    const created = await tx.errorEvent.create({
      data: {
        projectId,
        groupId: group.id,
        type: event.type,
        message: event.message,
        stack: event.stack,
        url: event.url,
        method: event.request?.method,
        statusCode: event.request?.statusCode,
        timestamp,
        browser: event.browser.userAgent,
        os: null,
        environment: event.environment,
        metadata: Prisma.JsonNull,
      },
    });

    return { groupId: group.id, eventId: created.id, occurrenceCount: group.occurrenceCount };
  });
}
