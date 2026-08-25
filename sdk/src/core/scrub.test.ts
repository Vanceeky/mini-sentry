import { describe, expect, it } from "vitest";
import { scrubUrl } from "./scrub";

describe("scrubUrl", () => {
  it("redacts a query param that looks like a credential", () => {
    expect(scrubUrl("https://api.example.com/login?token=abc123")).toBe(
      "https://api.example.com/login?token=%5BRedacted%5D",
    );
  });

  it("redacts multiple sensitive params with varying names/casing", () => {
    const result = scrubUrl(
      "https://api.example.com/x?Password=hunter2&api_key=xyz&session=s1&normal=keep-me",
    );
    expect(result).toContain("Password=%5BRedacted%5D");
    expect(result).toContain("api_key=%5BRedacted%5D");
    expect(result).toContain("session=%5BRedacted%5D");
    expect(result).toContain("normal=keep-me");
  });

  it("leaves a URL with no sensitive params completely unchanged", () => {
    const url = "https://api.example.com/things?page=2&sort=asc";
    expect(scrubUrl(url)).toBe(url);
  });

  it("resolves a relative URL against location before scrubbing", () => {
    const result = scrubUrl("/api/things?token=abc");
    expect(result).toContain("token=%5BRedacted%5D");
    expect(result.startsWith("http")).toBe(true);
  });

  it("never throws on a garbled, unparseable-looking string", () => {
    expect(() => scrubUrl("not a url at all: %%%")).not.toThrow();
  });

  it("returns an empty string unchanged", () => {
    expect(scrubUrl("")).toBe("");
  });
});
