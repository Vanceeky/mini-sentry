import { describe, expect, it } from "vitest";
import { ApiError, ERRORS, jsonError } from "./errors";

describe("jsonError", () => {
  it("produces the documented {success:false, error:{code,message}} shape and status", async () => {
    const response = jsonError(ERRORS.INVALID_API_KEY());
    expect(response.status).toBe(401);

    const body = (await response.json()) as unknown;
    expect(body).toEqual({
      success: false,
      error: { code: "INVALID_API_KEY", message: "API key is invalid or unrecognized." },
    });
  });

  it("attaches any provided headers (e.g. CORS) to the response", async () => {
    const response = jsonError(ERRORS.UNAUTHORIZED(), { "Access-Control-Allow-Origin": "http://localhost:5173" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("INTERNAL_ERROR always uses the generic message, never an underlying error's detail", async () => {
    const response = jsonError(ERRORS.INTERNAL_ERROR());
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe("An internal error occurred. Please try again later.");
  });

  it("ApiError carries its code and status", () => {
    const err = new ApiError("INVALID_EVENT", 400, "bad");
    expect(err.code).toBe("INVALID_EVENT");
    expect(err.status).toBe(400);
    expect(err.message).toBe("bad");
  });
});
