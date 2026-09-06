import { describe, expect, it } from "vitest";
import { dedupeKey } from "@/lib/queue";

/**
 * BullMQ rejects `:` in custom job ids. Getting this wrong is a silent
 * failure: the user's action succeeds, the record stays `pending`, and no work
 * ever runs. These tests pin the constraint.
 */
describe("dedupeKey", () => {
  it("never emits a colon", () => {
    expect(dedupeKey("evaluate-interview", "a:b:c")).not.toContain(":");
  });

  it("joins parts into a stable, readable id", () => {
    expect(dedupeKey("match", "1234")).toBe("match-1234");
  });

  it("is stable for the same inputs, so a double submit dedupes", () => {
    const id = "3f2a1b4c-0000-4000-8000-000000000001";
    expect(dedupeKey("parse-resume", id)).toBe(dedupeKey("parse-resume", id));
  });

  it("keeps uuids intact — hyphens are allowed", () => {
    const id = "3f2a1b4c-0000-4000-8000-000000000001";
    expect(dedupeKey("match", id)).toBe(`match-${id}`);
  });

  it("strips any other character BullMQ might reject", () => {
    expect(dedupeKey("job", "a b/c*d")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("accepts numbers", () => {
    expect(dedupeKey("readiness", "u1", 1700000000000)).toBe(
      "readiness-u1-1700000000000",
    );
  });
});
