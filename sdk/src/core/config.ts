/**
 * The hosted Canary backend's event-ingestion endpoint — the default target
 * for every SDK consumer who doesn't self-host. Overridable via
 * `config.endpoint` for anyone running their own backend (e.g. from the
 * mini-sentry/canary-backend source). See DECISIONS.md.
 */
export const DEFAULT_ENDPOINT = "https://canary-backend-pi.vercel.app/api/v1/events";

export interface CanaryConfig {
  apiKey: string;
  endpoint?: string;
  enabled?: boolean;
}

export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
}

export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    errors.push("config must be an object");
    return errors;
  }

  const { apiKey, endpoint, enabled } = config as Record<string, unknown>;

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    errors.push("config.apiKey must be a non-empty string");
  }
  if (endpoint !== undefined && typeof endpoint !== "string") {
    errors.push("config.endpoint must be a string when provided");
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    errors.push("config.enabled must be a boolean when provided");
  }

  return errors;
}

export function resolveConfig(config: CanaryConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    enabled: config.enabled ?? true,
  };
}
