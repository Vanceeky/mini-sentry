import { describe, expect, it, vi } from "vitest";

async function freshListeners() {
  vi.resetModules();
  return import("./listeners");
}

describe("installGlobalErrorListeners", () => {
  it("forwards a dispatched 'error' event as a normalized CapturedEvent", async () => {
    const { installGlobalErrorListeners } = await freshListeners();
    const received: unknown[] = [];
    installGlobalErrorListeners((event) => received.push(event));

    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));

    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("error");
    expect((received[0] as { message: string }).message).toBe("boom");
  });

  it("forwards a dispatched 'unhandledrejection' event", async () => {
    const { installGlobalErrorListeners } = await freshListeners();
    const received: unknown[] = [];
    installGlobalErrorListeners((event) => received.push(event));

    const reason = new Error("rejected");
    const promise = Promise.reject(reason);
    promise.catch(() => {});
    const event = new Event("unhandledrejection") as unknown as PromiseRejectionEvent;
    Object.assign(event, { reason, promise });
    window.dispatchEvent(event);

    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("unhandledrejection");
    expect((received[0] as { message: string }).message).toBe("rejected");
  });

  it("only installs once even if called twice", async () => {
    const { installGlobalErrorListeners } = await freshListeners();
    const received: unknown[] = [];
    installGlobalErrorListeners((event) => received.push(event));
    installGlobalErrorListeners((event) => received.push(event));

    window.dispatchEvent(new ErrorEvent("error", { message: "once" }));

    expect(received).toHaveLength(1);
  });
});
