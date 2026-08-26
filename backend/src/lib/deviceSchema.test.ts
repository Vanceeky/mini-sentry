import { describe, expect, it } from "vitest";
import { registerDeviceSchema } from "./deviceSchema";

describe("registerDeviceSchema", () => {
  it("accepts a valid ios registration", () => {
    expect(registerDeviceSchema.safeParse({ platform: "ios", pushToken: "abc123" }).success).toBe(true);
  });

  it("accepts a valid android registration", () => {
    expect(registerDeviceSchema.safeParse({ platform: "android", pushToken: "abc123" }).success).toBe(true);
  });

  it("rejects an unsupported platform", () => {
    expect(registerDeviceSchema.safeParse({ platform: "web", pushToken: "abc123" }).success).toBe(false);
  });

  it("rejects a missing pushToken", () => {
    expect(registerDeviceSchema.safeParse({ platform: "ios" }).success).toBe(false);
  });

  it("rejects an empty pushToken", () => {
    expect(registerDeviceSchema.safeParse({ platform: "ios", pushToken: "   " }).success).toBe(false);
  });

  it("trims the pushToken", () => {
    const result = registerDeviceSchema.safeParse({ platform: "ios", pushToken: "  abc123  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pushToken).toBe("abc123");
  });
});
