import { resolveConfig, validateConfig } from "./core/config";
import type { MiniSentryConfig } from "./core/config";
import { generateId } from "./core/id";
import { safeExec, warn } from "./core/safe";
import { getState, setInitialized } from "./core/state";

export type { MiniSentryConfig } from "./core/config";

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
  }, "init() failed unexpectedly");
}
