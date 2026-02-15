import crypto from "crypto";

export function hashPin(pin: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function generateSalt() {
  return crypto.randomBytes(8).toString("hex");
}
