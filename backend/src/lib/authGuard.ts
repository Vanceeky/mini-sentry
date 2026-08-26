import { extractBearerToken } from "./bearer";
import { ERRORS } from "./errors";
import { findUserBySessionToken, type AuthenticatedUser } from "./session";

/**
 * Resolves the authenticated user from a request's Authorization header, or
 * throws the appropriate ApiError — callers rely on the route's top-level
 * try/catch (same pattern as every other route in this backend) to turn that
 * into the right response.
 */
export async function requireSessionUser(request: Request): Promise<AuthenticatedUser> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    throw ERRORS.UNAUTHORIZED();
  }

  const user = await findUserBySessionToken(token);
  if (!user) {
    throw ERRORS.INVALID_SESSION();
  }

  return user;
}
