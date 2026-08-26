import { describe, expect, it } from "vitest";
import { createProjectSchema, updateProjectSchema } from "./projectSchema";

describe("createProjectSchema", () => {
  it("accepts a valid name", () => {
    expect(createProjectSchema.safeParse({ name: "My Application" }).success).toBe(true);
  });

  it("trims the name", () => {
    const result = createProjectSchema.safeParse({ name: "  My Application  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("My Application");
  });

  it("rejects an empty name", () => {
    expect(createProjectSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createProjectSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a name over the max length", () => {
    expect(createProjectSchema.safeParse({ name: "x".repeat(500) }).success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("accepts a valid name", () => {
    expect(updateProjectSchema.safeParse({ name: "Renamed App" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });
});
