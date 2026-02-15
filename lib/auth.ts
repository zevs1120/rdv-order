import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();
let cachedKey: Uint8Array | null = null;

function getJwtKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  cachedKey = encoder.encode(secret);
  return cachedKey;
}

export type AuthPayload = {
  userId: string;
  role: "waiter" | "manager";
};

export async function signToken(payload: AuthPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtKey());
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, getJwtKey());
  return payload as AuthPayload;
}

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}
