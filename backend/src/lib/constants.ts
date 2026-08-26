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
