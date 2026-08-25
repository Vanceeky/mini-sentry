import { describe, expect, it, vi } from "vitest";
import { info, safeExec } from "./safe";

describe("safeExec", () => {
  it("returns the function's result on success", () => {
    expect(safeExec(() => 42, "should not warn")).toBe(42);
  });

  it("swallows thrown errors and returns undefined", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = safeExec(() => {
      throw new Error("boom");
    }, "context failed");
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("info", () => {
  it("logs via console.info without throwing", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => info("hello", { a: 1 })).not.toThrow();
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
