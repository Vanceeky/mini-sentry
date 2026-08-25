export type CapturedEventType = "error" | "unhandledrejection" | "http";

export interface CapturedEvent {
  id: string;
  type: CapturedEventType;
  message: string;
  stack?: string;
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
}
