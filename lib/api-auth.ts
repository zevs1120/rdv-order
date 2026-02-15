import { getBearerToken, verifyToken, type AuthPayload } from "./auth";

export async function requireAuth(req: Request, roles: Array<AuthPayload["role"]>) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const payload = await verifyToken(token);
  if (!roles.includes(payload.role)) {
    throw new Error("FORBIDDEN");
  }

  return payload;
}
