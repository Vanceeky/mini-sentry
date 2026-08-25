import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SDK keeps a module-level singleton (core/state), so each test gets a
// fresh module instance to avoid state leaking across cases.
async function freshInit() {
  vi.resetModules();
  const mod = await import("./index");
  const state = await import("./core/state");
  return { init: mod.init, getState: state.getState };
}

describe("init", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("initializes with a valid config", async () => {
    const { init, getState } = await freshInit();
    init({ apiKey: "project_xxx" });
    const state = getState();
    expect(state.initialized).toBe(true);
    expect(state.instanceId).toEqual(expect.any(String));
    expect(state.config).toEqual({ apiKey: "project_xxx", endpoint: undefined, enabled: true });
  });

  it("does not initialize and does not throw on invalid config", async () => {
    const { init, getState } = await freshInit();
    expect(() => init({} as never)).not.toThrow();
    expect(getState().initialized).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not initialize when enabled is false", async () => {
    const { init, getState } = await freshInit();
    init({ apiKey: "project_xxx", enabled: false });
    expect(getState().initialized).toBe(false);
  });

  it("ignores a second init() call and keeps the original instance id", async () => {
    const { init, getState } = await freshInit();
    init({ apiKey: "first" });
    const firstId = getState().instanceId;
    init({ apiKey: "second" });
    expect(getState().instanceId).toBe(firstId);
    expect(getState().config?.apiKey).toBe("first");
  });

  it("never throws even if given a wildly malformed value", async () => {
    const { init } = await freshInit();
    expect(() => init(null as never)).not.toThrow();
    expect(() => init(undefined as never)).not.toThrow();
    expect(() => init("not-an-object" as never)).not.toThrow();
  });
});
