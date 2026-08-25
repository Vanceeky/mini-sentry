import { installGlobalErrorListeners } from "./capture/listeners";
import { getRecordedEvents, recordEvent } from "./capture/store";
import type { CapturedEvent } from "./capture/types";
import { resolveConfig, validateConfig } from "./core/config";
import type { MiniSentryConfig } from "./core/config";
import { generateId } from "./core/id";
import { info, safeExec, warn } from "./core/safe";
import { getState, setInitialized } from "./core/state";

export type { MiniSentryConfig } from "./core/config";
export type { CapturedEvent, CapturedEventType } from "./capture/types";

export function init(config: MiniSentryConfig): void {
  safeExec(() => {
    if (getState().initialized) {
      warn("init() called more than once; ignoring subsequent call.");
      return;
    }

    const errors = validateConfig(config);
    if (errors.length > 0) {
      warn(`invalid configuration, SDK will not be initialized: ${errors.join("; ")}`);
      return;
    }

    const resolved = resolveConfig(config);
    if (!resolved.enabled) {
      warn("SDK initialized with enabled: false; running in no-op mode.");
      return;
    }

    setInitialized(generateId(), resolved);
    installGlobalErrorListeners((event) => {
      recordEvent(event);
      info(`captured ${event.type} event`, event);
    });
  }, "init() failed unexpectedly");
}

/** Events captured so far. Nothing is transmitted anywhere yet (see Phase 4). */
export function getCapturedEvents(): readonly CapturedEvent[] {
  return getRecordedEvents();
}
