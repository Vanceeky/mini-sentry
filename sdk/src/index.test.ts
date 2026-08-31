import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SDK keeps a module-level singleton (core/state), so each test gets a
// fresh module instance to avoid state leaking across cases.
async function freshInit() {
  vi.resetModules();
  const mod = await import("./index");
  const state = await import("./core/state");
  return { init: mod.init, getState: state.getState, getCapturedEvents: mod.getCapturedEvents };
}

describe("init", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("initializes with a valid config, defaulting endpoint to the hosted collector", async () => {
    const { init, getState } = await freshInit();
    const { DEFAULT_ENDPOINT } = await import("./core/config");
    init({ apiKey: "project_xxx" });
    const state = getState();
    expect(state.initialized).toBe(true);
    expect(state.instanceId).toEqual(expect.any(String));
    expect(state.config).toEqual({ apiKey: "project_xxx", endpoint: DEFAULT_ENDPOINT, enabled: true });
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

  it("captures a global error after a successful init and exposes it", async () => {
    const { init, getCapturedEvents } = await freshInit();
    init({ apiKey: "project_xxx" });

    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));

    const events = getCapturedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].message).toBe("boom");
  });

  it("captures an unhandled rejection after a successful init and exposes it", async () => {
    const { init, getCapturedEvents } = await freshInit();
    init({ apiKey: "project_xxx" });

    const reason = new Error("rejected");
    const promise = Promise.reject(reason);
    promise.catch(() => {});
    const event = new Event("unhandledrejection") as unknown as PromiseRejectionEvent;
    Object.assign(event, { reason, promise });
    window.dispatchEvent(event);

    const events = getCapturedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("unhandledrejection");
    expect(events[0].message).toBe("rejected");
  });

  it("captures a failed resource load after a successful init and exposes it", async () => {
    const { init, getCapturedEvents } = await freshInit();
    init({ apiKey: "project_xxx" });

    const img = document.createElement("img");
    img.src = "https://example.com/broken.png";
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error"));
    img.remove();

    const events = getCapturedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("resource");
    expect(events[0].resource).toEqual({ url: "https://example.com/broken.png", tagName: "img" });
  });

  it("does not capture anything when init() was invalid", async () => {
    const { init, getCapturedEvents } = await freshInit();
    init({} as never);

    window.dispatchEvent(new ErrorEvent("error", { message: "should be ignored" }));

    expect(getCapturedEvents()).toHaveLength(0);
  });
});
