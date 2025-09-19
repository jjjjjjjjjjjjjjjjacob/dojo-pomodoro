"use node";
import * as crypto from "crypto";

const ITERATIONS = 100_000;
const KEYLEN = 32;
const DIGEST = "sha256";

/**
 * Generates HMAC fingerprint for password uniqueness checking
 */
export function hmacFingerprint(secret: string, password: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(password.toLowerCase(), "utf8")
    .digest("hex");
}

/**
 * Hashes a password using PBKDF2
 */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password.toLowerCase(), salt, ITERATIONS, KEYLEN, DIGEST);
  return {
    saltB64: salt.toString("base64"),
    hashB64: hash.toString("base64"),
    iterations: ITERATIONS,
  };
}

/**
 * Verifies a password against stored credentials using timing-safe comparison
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number
): boolean {
  const salt = Buffer.from(storedSalt, "base64");
  const candidate = crypto.pbkdf2Sync(password.toLowerCase(), salt, iterations, KEYLEN, DIGEST);
  const stored = Buffer.from(storedHash, "base64");

  // Timing-safe comparison
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

/**
 * Timing-safe buffer comparison (for consistency with existing code)
 */
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}