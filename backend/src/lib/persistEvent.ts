import { Prisma } from "@prisma/client";
import { ACTIVE_GROUP_WINDOW_MS } from "./constants";
import { prisma } from "./db";
import { computeFingerprint } from "./fingerprint";
import type { CapturedEventInput } from "./eventSchema";

export interface PersistedEvent {
  groupId: string;
  eventId: string;
  occurrenceCount: number;
  /** True when this event created a brand-new ErrorGroup. Drives Phase 12's NEW_ERROR notification trigger. */
  isNewGroup: boolean;
  /**
   * True when the group already existed but hadn't had an occurrence within
   * ACTIVE_GROUP_WINDOW_MS before this one — i.e. it just went from
   * "inactive" back to "active." Always false when isNewGroup is true (a
   * brand-new group was never previously active or inactive). Drives Phase
   * 12's REACTIVATED_ERROR trigger.
   */
  wasInactive: boolean;
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
    // Read before the upsert so we can tell "new group" / "was this group
    // inactive" apart from the upsert's own return value, which only ever
    // reflects the post-write state.
    const existingGroup = await tx.errorGroup.findUnique({
      where: { projectId_fingerprint: { projectId, fingerprint } },
      select: { lastSeenAt: true },
    });
    const isNewGroup = !existingGroup;
    const wasInactive = !!existingGroup && now.getTime() - existingGroup.lastSeenAt.getTime() > ACTIVE_GROUP_WINDOW_MS;

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
        endpoint: event.request
          ? `${event.request.method} ${event.request.url}`
          : event.resource
            ? `${event.resource.tagName} ${event.resource.url}`
            : null,
        statusCode: event.request?.statusCode ?? event.resource?.statusCode ?? null,
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
        filename: event.filename,
        line: event.line,
        column: event.column,
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

    return { groupId: group.id, eventId: created.id, occurrenceCount: group.occurrenceCount, isNewGroup, wasInactive };
  });
}
