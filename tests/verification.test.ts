import { describe, expect, it } from "vitest";
import {
  hashToken,
  isWellFormedToken,
  issueToken,
  tokensMatch,
  verificationUrl,
} from "@/lib/verification/token";

describe("issueToken", () => {
  it("produces a high-entropy token, not something guessable", () => {
    const { token } = issueToken();
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => issueToken().token),
    );
    expect(tokens.size).toBe(200);
  });

  it("returns a hash that is not the token itself", () => {
    const { token, tokenHash } = issueToken();
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(hashToken(token));
  });

  it("gives a public id that is distinct from the token", () => {
    const { token, publicId } = issueToken();
    expect(publicId).toMatch(/^SG-[0-9A-F]{12}$/);
    // Quoting a public id must not reveal any part of the secret.
    expect(token).not.toContain(publicId.slice(3));
  });
});

describe("hashToken", () => {
  it("is deterministic, so lookup by hash works", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("differs for different tokens", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("tokensMatch", () => {
  it("matches identical values", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
  });

  it("rejects different values and different lengths", () => {
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
  });
});

describe("isWellFormedToken", () => {
  it("accepts a real token", () => {
    expect(isWellFormedToken(issueToken().token)).toBe(true);
  });

  it("rejects anything that could not be one", () => {
    for (const bad of ["", "short", null, undefined, 42, "has spaces in it here ok", "a".repeat(200)]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("rejects path traversal and SQL-ish input before it reaches the database", () => {
    expect(isWellFormedToken("../../etc/passwd")).toBe(false);
    expect(isWellFormedToken("' OR 1=1 --")).toBe(false);
  });
});

describe("verificationUrl", () => {
  it("builds a link without doubling the slash", () => {
    expect(verificationUrl("https://x.test/", "abc")).toBe("https://x.test/verify/abc");
    expect(verificationUrl("https://x.test", "abc")).toBe("https://x.test/verify/abc");
  });
});
