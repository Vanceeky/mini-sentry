export type CapturedEventType = "error" | "unhandledrejection" | "http" | "resource";

export interface CapturedEvent {
  id: string;
  type: CapturedEventType;
  message: string;
  stack?: string;
  /** Present only for "error" events, when the browser provides it. */
  filename?: string;
  /** 1-indexed. Present only for "error" events, when the browser provides it. */
  line?: number;
  /** 1-indexed. Present only for "error" events, when the browser provides it. */
  column?: number;
  url: string;
  timestamp: string;
  /** Runtime that produced this event; a fixed discriminator for now, the SDK is browser-only. */
  environment: "browser";
  browser: {
    userAgent: string;
  };
  /** Present only for "http" events: the request that failed or came back non-success. */
  request?: {
    url: string;
    method: string;
    /** Absent when the request itself failed (network error) rather than returning a response. */
    statusCode?: number;
  };
  /** Present only for "resource" events: the element that failed to load. */
  resource?: {
    url: string;
    tagName: "img" | "script" | "link";
    /** Best-effort, via the Resource Timing API — often absent (cross-origin without Timing-Allow-Origin, or unsupported browser). Never guessed. */
    statusCode?: number;
  };
}
