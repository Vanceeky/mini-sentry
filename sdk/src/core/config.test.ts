import { describe, expect, it } from "vitest";
import { resolveConfig, validateConfig } from "./config";

describe("validateConfig", () => {
  it("accepts a minimal valid config", () => {
    expect(validateConfig({ apiKey: "project_xxx" })).toEqual([]);
  });

  it("rejects a missing apiKey", () => {
    expect(validateConfig({})).toContain("config.apiKey must be a non-empty string");
  });

  it("rejects a blank apiKey", () => {
    expect(validateConfig({ apiKey: "   " })).toContain(
      "config.apiKey must be a non-empty string",
    );
  });

  it("rejects a non-string endpoint", () => {
    expect(validateConfig({ apiKey: "k", endpoint: 123 })).toContain(
      "config.endpoint must be a string when provided",
    );
  });

  it("rejects a non-boolean enabled flag", () => {
    expect(validateConfig({ apiKey: "k", enabled: "yes" })).toContain(
      "config.enabled must be a boolean when provided",
    );
  });

  it("rejects non-object input without throwing", () => {
    expect(validateConfig(null)).toEqual(["config must be an object"]);
    expect(validateConfig(undefined)).toEqual(["config must be an object"]);
    expect(validateConfig("nope")).toEqual(["config must be an object"]);
  });
});

describe("resolveConfig", () => {
  it("defaults enabled to true", () => {
    expect(resolveConfig({ apiKey: "k" }).enabled).toBe(true);
  });

  it("preserves an explicit enabled/endpoint", () => {
    expect(resolveConfig({ apiKey: "k", endpoint: "https://e", enabled: false })).toEqual({
      apiKey: "k",
      endpoint: "https://e",
      enabled: false,
    });
  });
});
