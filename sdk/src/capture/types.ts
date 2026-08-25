export type CapturedEventType = "error" | "unhandledrejection";

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
}
