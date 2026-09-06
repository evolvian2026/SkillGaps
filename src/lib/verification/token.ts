import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Shareable verification tokens.
 *
 * Pure crypto helpers, no I/O, so the properties below are unit testable:
 *
 * - The token is high-entropy random, not derived from the student's id, so it
 *   cannot be guessed or enumerated from a known profile.
 * - Only the SHA-256 reaches the database. A leaked dump therefore yields no
 *   working links — the same reason session cookies are stored hashed.
 * - The public id is separate from the token: it can be quoted in an email or
 *   a support ticket without granting access to anything.
 */

const TOKEN_BYTES = 32;
const PUBLIC_ID_BYTES = 6;

export interface IssuedToken {
  /** Given to the student once; never stored, never recoverable. */
  token: string;
  /** Stored, and used for lookup. */
  tokenHash: string;
  /** Safe to display and to quote. */
  publicId: string;
}

export function issueToken(): IssuedToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    publicId: `SG-${randomBytes(PUBLIC_ID_BYTES).toString("hex").toUpperCase()}`,
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two token hashes.
 *
 * Lookup is by hash so this is rarely on the hot path, but comparing hashes
 * with `===` anywhere in a verification flow is the kind of habit that leaks
 * timing information once someone reuses the helper.
 */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Rejects anything that cannot be a token before it reaches the database. */
export function isWellFormedToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= 32 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export function verificationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/verify/${token}`;
}
