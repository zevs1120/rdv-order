import { getBearerToken, verifyToken, type AuthPayload } from "./auth";

export async function requireAuth(req: Request, roles: Array<AuthPayload["role"]>) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  let payload: AuthPayload;
  try {
    payload = await verifyToken(token);
  } catch {
    // Treat any JWT verification failure as unauthenticated.
    throw new Error("UNAUTHORIZED");
  }
  if (!roles.includes(payload.role)) {
    throw new Error("FORBIDDEN");
  }

  return payload;
}
