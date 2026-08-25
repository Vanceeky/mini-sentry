const LOG_PREFIX = "[mini-sentry]";

/**
 * Runs fn and swallows any exception it throws. The SDK must never let an
 * internal failure propagate into the host application's execution flow.
 */
export function safeExec<T>(fn: () => T, errorMessage: string): T | undefined {
  try {
    return fn();
  } catch (error) {
    warn(errorMessage, error);
    return undefined;
  }
}

export function warn(message: string, error?: unknown): void {
  try {
    console.warn(`${LOG_PREFIX} ${message}`, error);
  } catch {
    // Logging itself must never throw into the host application.
  }
}
