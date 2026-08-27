import { installGlobalErrorListeners } from "./capture/listeners";
import { installFetchInterceptor } from "./capture/network";
import { installResourceErrorListener } from "./capture/resources";
import { getRecordedEvents, recordEvent } from "./capture/store";
import type { CapturedEvent } from "./capture/types";
import { resolveConfig, validateConfig } from "./core/config";
import type { MiniSentryConfig } from "./core/config";
import { generateId } from "./core/id";
import { info, safeExec, warn } from "./core/safe";
import { getState, setInitialized } from "./core/state";
import { sendEvent } from "./transport/send";
import { showCaptureNotification } from "./ui/notification";

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
    const onCapture = (event: CapturedEvent): void => {
      recordEvent(event);
      info(`captured ${event.type} event`, event);
      showCaptureNotification(event);
      if (resolved.endpoint) {
        sendEvent(resolved.endpoint, resolved.apiKey, event);
      }
    };
    installGlobalErrorListeners(onCapture);
    installFetchInterceptor(onCapture);
    installResourceErrorListener(onCapture);
  }, "init() failed unexpectedly");
}

/** Events captured so far, whether or not a transport endpoint is configured. */
export function getCapturedEvents(): readonly CapturedEvent[] {
  return getRecordedEvents();
}
