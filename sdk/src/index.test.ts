import { describe, expect, it } from "vitest";
import { isSdkLoaded } from "./index";

describe("isSdkLoaded", () => {
  it("returns true", () => {
    expect(isSdkLoaded()).toBe(true);
  });
});
