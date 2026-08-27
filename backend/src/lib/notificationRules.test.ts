import { describe, expect, it } from "vitest";
import { buildNotificationPayload, determineNotificationType } from "./notificationRules";
import type { CapturedEventInput } from "./eventSchema";
import type { PersistedEvent } from "./persistEvent";

const baseEvent: CapturedEventInput = {
  id: "evt_1",
  type: "error",
  message: "Cannot read property of undefined",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test" },
  url: "https://example.com/",
};

const basePersisted: PersistedEvent = {
  groupId: "grp_1",
  eventId: "dbevt_1",
  occurrenceCount: 1,
  isNewGroup: false,
  wasInactive: false,
};

describe("determineNotificationType", () => {
  it("returns NEW_ERROR when isNewGroup is true, regardless of anything else", () => {
    expect(determineNotificationType(baseEvent, { ...basePersisted, isNewGroup: true })).toBe("NEW_ERROR");
  });

  it("returns SERIOUS_ERROR for a repeat http event with a 5xx status", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/x", method: "GET", statusCode: 503 } };
    expect(determineNotificationType(httpEvent, basePersisted)).toBe("SERIOUS_ERROR");
  });

  it("does not return SERIOUS_ERROR for a 4xx http event", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/x", method: "GET", statusCode: 404 } };
    expect(determineNotificationType(httpEvent, basePersisted)).toBeNull();
  });

  it("does not return SERIOUS_ERROR for an http event with no statusCode (network failure)", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/x", method: "GET" } };
    expect(determineNotificationType(httpEvent, basePersisted)).toBeNull();
  });

  it("returns REACTIVATED_ERROR when wasInactive is true and nothing higher-priority applies", () => {
    expect(determineNotificationType(baseEvent, { ...basePersisted, wasInactive: true })).toBe("REACTIVATED_ERROR");
  });

  it("prioritizes NEW_ERROR over a 5xx status on the same event", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/x", method: "GET", statusCode: 500 } };
    expect(determineNotificationType(httpEvent, { ...basePersisted, isNewGroup: true })).toBe("NEW_ERROR");
  });

  it("prioritizes SERIOUS_ERROR over wasInactive on the same event", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/x", method: "GET", statusCode: 500 } };
    expect(determineNotificationType(httpEvent, { ...basePersisted, wasInactive: true })).toBe("SERIOUS_ERROR");
  });

  it("returns null when no trigger applies (ordinary repeat occurrence)", () => {
    expect(determineNotificationType(baseEvent, basePersisted)).toBeNull();
  });

  it("never returns SERIOUS_ERROR for a resource event (no HTTP status exists)", () => {
    const resourceEvent: CapturedEventInput = {
      ...baseEvent,
      type: "resource",
      resource: { url: "https://example.com/broken.png", tagName: "img" },
    };
    expect(determineNotificationType(resourceEvent, basePersisted)).toBeNull();
    expect(determineNotificationType(resourceEvent, { ...basePersisted, isNewGroup: true })).toBe("NEW_ERROR");
  });
});

describe("buildNotificationPayload", () => {
  it("uses the event's message for a non-http event", () => {
    const payload = buildNotificationPayload("NEW_ERROR", "proj_1", baseEvent, basePersisted);
    expect(payload).toEqual({
      type: "NEW_ERROR",
      projectId: "proj_1",
      errorGroupId: "grp_1",
      title: "New Error Detected",
      message: "Cannot read property of undefined",
    });
  });

  it("formats '<statusCode> <method> <url>' for an http event", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/api/users", method: "GET", statusCode: 500 } };
    const payload = buildNotificationPayload("SERIOUS_ERROR", "proj_1", httpEvent, basePersisted);
    expect(payload.message).toBe("500 GET /api/users");
    expect(payload.title).toBe("Serious Error");
  });

  it("uses a placeholder status when an http event has no statusCode", () => {
    const httpEvent: CapturedEventInput = { ...baseEvent, type: "http", request: { url: "/api/users", method: "GET" } };
    const payload = buildNotificationPayload("REACTIVATED_ERROR", "proj_1", httpEvent, basePersisted);
    expect(payload.message).toBe("ERR GET /api/users");
    expect(payload.title).toBe("Error Reactivated");
  });

  it("formats 'Failed to load <tagName>: <url>' for a resource event", () => {
    const resourceEvent: CapturedEventInput = {
      ...baseEvent,
      type: "resource",
      resource: { url: "https://example.com/broken.png", tagName: "img" },
    };
    const payload = buildNotificationPayload("NEW_ERROR", "proj_1", resourceEvent, basePersisted);
    expect(payload.message).toBe("Failed to load img: https://example.com/broken.png");
  });
});
