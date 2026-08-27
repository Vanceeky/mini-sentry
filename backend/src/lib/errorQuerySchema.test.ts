import { describe, expect, it } from "vitest";
import {
  listErrorGroupsQuerySchema,
  listEventsQuerySchema,
  occurrencesQuerySchema,
  parseQueryOrThrow,
  queryParamsToObject,
} from "./errorQuerySchema";

describe("queryParamsToObject", () => {
  it("converts search params into a plain object", () => {
    expect(queryParamsToObject("http://localhost/x?a=1&b=two")).toEqual({ a: "1", b: "two" });
  });

  it("returns an empty object for no query string", () => {
    expect(queryParamsToObject("http://localhost/x")).toEqual({});
  });
});

describe("listErrorGroupsQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    const result = listErrorGroupsQuerySchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20, sort: "lastSeen" });
  });

  it("coerces page/limit/status from strings", () => {
    const result = listErrorGroupsQuerySchema.parse({ page: "2", limit: "50", status: "500" });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.status).toBe(500);
  });

  it("rejects a limit over the max", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ limit: "9999" }).success).toBe(false);
  });

  it("rejects a page below 1", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("accepts a valid type", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ type: "http" }).success).toBe(true);
  });

  it("accepts 'resource' as a valid type", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ type: "resource" }).success).toBe(true);
  });

  it("rejects an invalid type (e.g. the brief's illustrative 'network', not this contract's 'http')", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ type: "network" }).success).toBe(false);
  });

  it("accepts a valid sort value", () => {
    expect(listErrorGroupsQuerySchema.parse({ sort: "occurrences" }).sort).toBe("occurrences");
  });

  it("rejects an invalid sort value", () => {
    expect(listErrorGroupsQuerySchema.safeParse({ sort: "not-a-real-sort" }).success).toBe(false);
  });
});

describe("occurrencesQuerySchema / listEventsQuerySchema", () => {
  it("both apply page/limit defaults", () => {
    expect(occurrencesQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listEventsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });
});

describe("parseQueryOrThrow", () => {
  it("returns parsed data for a valid query", () => {
    const result = parseQueryOrThrow(listEventsQuerySchema, "http://localhost/x?page=2");
    expect(result.page).toBe(2);
  });

  it("throws a VALIDATION_ERROR ApiError for an invalid query", () => {
    expect(() => parseQueryOrThrow(listEventsQuerySchema, "http://localhost/x?limit=9999")).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });
});
