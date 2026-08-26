import { afterEach, describe, expect, it, vi } from "vitest";

async function freshGuard() {
  vi.resetModules();
  return import("./authGuard");
}

function makeRequest(auth?: string) {
  const headers = new Headers();
  if (auth !== undefined) headers.set("Authorization", auth);
  return new Request("http://localhost:3000/api/v1/projects", { headers });
}

describe("requireSessionUser", () => {
  afterEach(() => vi.doUnmock("./session"));

  it("returns the user for a valid session token", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com" };
    vi.doMock("./session", () => ({ findUserBySessionToken: vi.fn().mockResolvedValue(user) }));

    const { requireSessionUser } = await freshGuard();
    expect(await requireSessionUser(makeRequest("Bearer good-token"))).toEqual(user);
  });

  it("throws UNAUTHORIZED when the header is missing", async () => {
    vi.doMock("./session", () => ({ findUserBySessionToken: vi.fn() }));
    const { requireSessionUser } = await freshGuard();

    await expect(requireSessionUser(makeRequest())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INVALID_SESSION when the token doesn't resolve to a user", async () => {
    vi.doMock("./session", () => ({ findUserBySessionToken: vi.fn().mockResolvedValue(null) }));
    const { requireSessionUser } = await freshGuard();

    await expect(requireSessionUser(makeRequest("Bearer bad-token"))).rejects.toMatchObject({ code: "INVALID_SESSION" });
  });
});
