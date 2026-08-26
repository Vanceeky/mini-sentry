/** Hard cap on the raw request body — checked before JSON parsing. */
export const MAX_EVENT_PAYLOAD_BYTES = 32 * 1024; // 32 KiB

/**
 * Overlong string fields are truncated, not rejected — a verbose but
 * otherwise legitimate error message/stack shouldn't cause the whole event
 * to be dropped. The payload-size cap above still bounds worst-case abuse.
 */
export const MESSAGE_MAX_LEN = 4096;
export const STACK_MAX_LEN = 20000;
export const URL_MAX_LEN = 2048;
export const USER_AGENT_MAX_LEN = 512;
export const REQUEST_METHOD_MAX_LEN = 16;
export const ID_MAX_LEN = 200;

export const TRUNCATION_SUFFIX = "…[truncated]";

/** Auth endpoints (register/login/logout/me) — bodies are tiny, so a much smaller cap. */
export const MAX_AUTH_PAYLOAD_BYTES = 4 * 1024; // 4 KiB
export const NAME_MAX_LEN = 200;
export const EMAIL_MAX_LEN = 320; // RFC 5321 max mailbox length
export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 200; // bounds scrypt cost on attacker-supplied input

/** Session tokens are opaque bearer tokens, valid for this long after login. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
