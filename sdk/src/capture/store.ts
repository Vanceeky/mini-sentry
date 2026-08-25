import type { CapturedEvent } from "./types";

// No transport exists yet (Phase 4), so captured events are only held in
// memory. Bounded so a page with runaway errors can't grow this unbounded.
const MAX_BUFFERED_EVENTS = 50;
const events: CapturedEvent[] = [];

export function recordEvent(event: CapturedEvent): void {
  events.push(event);
  if (events.length > MAX_BUFFERED_EVENTS) {
    events.shift();
  }
}

export function getRecordedEvents(): readonly CapturedEvent[] {
  return events;
}
